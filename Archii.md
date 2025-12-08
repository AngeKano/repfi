# Architecture ETL Multi-Tenant pour Traitement Comptable

## Vue d'Ensemble

Ce document décrit l'approche pour gérer deux types de fichiers distincts dans votre application :

1.**Fichiers normaux** : stockage simple type Google Drive

2.**Fichiers comptables** : traitement ETL avec validation de période et chargement ClickHouse

## 🎯 Principes Directeurs

-**Séparation claire** entre fichiers normaux et comptables

-**Multi-tenant** : chaque client isolé dans sa propre structure

-**Traitement parallèle** : plusieurs utilisateurs peuvent lancer des ETL simultanément

-**Validation stricte** : cohérence des périodes avant traitement

-**Historisation** : backup automatique avant écrasement

---

## 1️⃣ Modifications Next.js

### 1.1 Extension du Modèle Prisma

```prisma

// Ajout dans schema.prisma


modelFile{

  // ... champs existants ...

  

  // NOUVEAU : Catégorisation des fichiers

  category      FileCategory  @default(NORMAL)

  

  // Pour fichiers comptables uniquement

  periodStart   DateTime?

  periodEnd     DateTime?

  processingStatusProcessingStatus@default(PENDING)

  batchId       String?       // Pour regrouper les 5 fichiers d'une période

  

  @@index([category])

  @@index([batchId])

  @@index([processingStatus])

}


enumFileCategory{

  NORMAL        // Fichiers vrac (PDF, images, etc.)

  COMPTABLE     // Fichiers pour ETL

}


enumProcessingStatus{

  PENDING       // En attente de traitement

  VALIDATING    // Validation en cours

  PROCESSING    // ETL en cours

  COMPLETED     // Traité avec succès

  FAILED        // Échec de traitement

}


// Nouvelle table pour gérer les périodes comptables

modelComptablePeriod{

  id            String        @id@default(cuid())

  clientId      String

  periodStart   DateTime

  periodEnd     DateTime

  year          Int

  batchId       String        @unique

  status        ProcessingStatus@default(PENDING)

  

  // Tracking

  createdAt     DateTime      @default(now())

  processedAt   DateTime?

  

  // Relations

  client        Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)

  files         File[]        @relation("PeriodFiles")

  

  @@unique([clientId, periodStart, periodEnd])

  @@index([clientId])

  @@index([status])

  @@map("comptable_periods")

}

```

### 1.2 API Routes à Créer/Modifier

```typescript

// app/api/files/comptable/upload/route.ts

// Upload des 5 fichiers comptables avec validation


POST /api/files/comptable/upload

Body: {

  clientId: string,

  files: File[] // Les 5 fichiers obligatoires

}

Retour: { batchId: string, periodStart: Date, periodEnd: Date }

```

**Logique** :

1. Vérifier que 5 fichiers sont présents
2. Vérifier les types (pas de doublons)
3. Parser les fichiers GRAND_LIVRE_COMPTES et GRAND_LIVRE_TIERS pour extraire les périodes
4. Valider la cohérence des périodes
5. Créer un `batchId` unique (UUID)
6. Uploader vers S3 dans : `{clientId}/declaration/{year}/periode-{start}-{end}/`
7. Renommer les fichiers : `{YYYYMMDD}_{TYPE}_{ClientName}`
8. Créer l'enregistrement `ComptablePeriod` dans Postgres

```typescript

// app/api/files/comptable/trigger-etl/route.ts

// Déclencher le traitement ETL


POST /api/files/comptable/trigger-etl

Body: { batchId: string }

Retour: { dagRunId: string, status: 'triggered' }

```

**Logique** :

1. Vérifier que la période n'est pas déjà en cours de traitement
2. Vérifier qu'il n'y a pas de chevauchement avec des périodes existantes
3. Appeler l'API Airflow pour déclencher le DAG
4. Mettre à jour le statut à `PROCESSING`

```typescript

// app/api/files/comptable/status/[batchId]/route.ts

// Vérifier le statut du traitement


GET /api/files/comptable/status/{batchId}

Retour: { status: ProcessingStatus, progress: number, error?: string }

```

### 1.3 Structure S3 à Implémenter

```

s3://bucket/

└── {clientId}-{cuid}/

    ├── folder/              # Fichiers normaux (existant)

    │   └── ...

    └── declaration/         # NOUVEAU : Fichiers comptables

        └── {year}/

            └── periode-{YYYYMMDD}-{YYYYMMDD}/

                ├── {YYYYMMDD}_GrandLivre_{ClientName}

                ├── {YYYYMMDD}_GrandLivreTiers_{ClientName}

                ├── {YYYYMMDD}_PlanTiers_{ClientName}

                ├── {YYYYMMDD}_PlanComptes_{ClientName}

                ├── {YYYYMMDD}_CodeJournal_{ClientName}

                ├── success/           # Créé par Airflow

                │   ├── sources/       # Fichiers sources traités

                │   └── resultats/     # Fichiers transformés

                └── backup/            # Si re-traitement

                    └── {YYYYMMDD}_{HHMMSS}/

```

### 1.4 Composants UI à Créer

**Page : `/declaration-comptable`**

- Formulaire d'upload des 5 fichiers obligatoires
- Validation en temps réel (types, taille)
- Extraction automatique de la période après upload
- Bouton "Lancer le traitement ETL"

**Composant : Timeline des Périodes**

- Liste chronologique des périodes traitées
- Statut de chaque période (en cours, succès, échec)
- Bouton de restauration depuis backup
- Indicateur de progression en temps réel (WebSocket ou polling)

---

## 2️⃣ Modifications PostgreSQL

### 2.1 Nouvelles Tables

Voir section 1.1 pour les modifications Prisma (qui génèrent les tables Postgres).

### 2.2 Fonction de Validation de Chevauchement

```sql

-- Fonction pour vérifier qu'une nouvelle période ne chevauche pas les existantes

CREATEOR REPLACE FUNCTION check_period_overlap(

  p_client_id TEXT,

  p_start_date TIMESTAMP,

  p_end_date TIMESTAMP

) RETURNSBOOLEANAS $$

BEGIN

  RETURNNOTEXISTS (

    SELECT1FROM comptable_periods

    WHERE client_id = p_client_id

      ANDstatus = 'COMPLETED'

      AND (

        (period_start <= p_end_date AND period_end >= p_start_date)

      )

  );

END;

$$ LANGUAGE plpgsql;

```

### 2.3 Trigger pour Mettre à Jour le Statut des Fichiers

```sql

-- Synchroniser le statut des fichiers avec leur période

CREATEOR REPLACE FUNCTION sync_file_status()

RETURNS TRIGGER AS $$

BEGIN

  UPDATE files

  SET processing_status = NEW.status

  WHERE batch_id = NEW.batch_id;

  

  RETURN NEW;

END;

$$ LANGUAGE plpgsql;


CREATE TRIGGER period_status_change

AFTERUPDATEON comptable_periods

FOR EACH ROW

WHEN (OLD.status IS DISTINCT FROM NEW.status)

EXECUTE FUNCTION sync_file_status();

```

---

## 3️⃣ Modifications ClickHouse

### 3.1 Structure Existante (à confirmer)

Vous avez déjà :

-**Tables de dimension** : `PlanTiers`, `PlanComptable`, `CodeJournal`

-**Table de faits** : `GrandLivre`

### 3.2 Ajout de Colonnes pour Multi-Tenant

```sql

-- Ajouter sur TOUTES les tables ClickHouse

ALTERTABLE PlanTiers ADD COLUMN IFNOTEXISTS client_id String;

ALTERTABLE PlanComptable ADD COLUMN IFNOTEXISTS client_id String;

ALTERTABLE CodeJournal ADD COLUMN IFNOTEXISTS client_id String;

ALTERTABLE GrandLivre ADD COLUMN IFNOTEXISTS client_id String;

ALTERTABLE GrandLivre ADD COLUMN IFNOTEXISTS batch_id String;


-- Index pour optimiser les requêtes par client

ALTERTABLE GrandLivre ADD INDEX idx_client_id client_id TYPE bloom_filter GRANULARITY 1;

```

### 3.3 Table de Métadonnées pour Suivi

```sql

CREATETABLEIFNOTEXISTS etl_metadata (

    batch_id String,

    client_id String,

    period_start Date,

    period_end Date,

    processing_start DateTime,

    processing_end Nullable(DateTime),

    status Enum8('running' = 1, 'success' = 2, 'failed' = 3),

    records_inserted UInt64,

    error_message Nullable(String)

) ENGINE = MergeTree()

ORDER BY (batch_id, processing_start);

```

---

## 4️⃣ Modifications Airflow ETL

### 4.1 Architecture du DAG

```python

# dags/process_comptable_files.py


from airflow import DAG

from airflow.operators.python import PythonOperator

from datetime import datetime, timedelta


default_args = {

    'owner': 'envol',

    'retries': 1,

    'retry_delay': timedelta(minutes=5),

}


dag = DAG(

    'process_comptable_files',

    default_args=default_args,

    description='ETL multi-tenant pour fichiers comptables',

    schedule_interval=None,  # Déclenché manuellement

    start_date=datetime(2024, 1, 1),

    catchup=False,

    params={

        "batch_id": "",

        "client_id": "",

        "s3_prefix": ""

    }

)

```

### 4.2 Tasks du DAG

```python

# Task 1: Télécharger les fichiers depuis S3

download_files = PythonOperator(

    task_id='download_files_from_s3',

    python_callable=download_s3_files,

    dag=dag

)


# Task 2: Valider l'intégrité des fichiers

validate_files = PythonOperator(

    task_id='validate_files',

    python_callable=validate_excel_files,

    dag=dag

)


# Task 3: Traiter les dimensions (parallèle)

process_plan_tiers = PythonOperator(

    task_id='process_plan_tiers',

    python_callable=process_dimension_table,

    op_kwargs={'table_type': 'PLAN_TIERS'},

    dag=dag

)


process_plan_comptes = PythonOperator(

    task_id='process_plan_comptes',

    python_callable=process_dimension_table,

    op_kwargs={'table_type': 'PLAN_COMPTES'},

    dag=dag

)


process_code_journal = PythonOperator(

    task_id='process_code_journal',

    python_callable=process_dimension_table,

    op_kwargs={'table_type': 'CODE_JOURNAL'},

    dag=dag

)


# Task 4: Traiter les faits (après les dimensions)

process_grand_livre = PythonOperator(

    task_id='process_grand_livre',

    python_callable=process_fact_table,

    dag=dag

)


# Task 5: Déplacer les fichiers vers success/

move_files = PythonOperator(

    task_id='move_files_to_success',

    python_callable=move_processed_files,

    dag=dag

)


# Task 6: Notifier PostgreSQL

notify_postgres = PythonOperator(

    task_id='notify_postgres_completion',

    python_callable=update_postgres_status,

    dag=dag

)


# Définir l'ordre

download_files >> validate_files

validate_files >> [process_plan_tiers, process_plan_comptes, process_code_journal]

[process_plan_tiers, process_plan_comptes, process_code_journal] >> process_grand_livre

process_grand_livre >> move_files >> notify_postgres

```

### 4.3 Gestion du Multi-Tenant

```python

defprocess_dimension_table(**context):

    """

    Traite une table de dimension en isolant par client_id

    """

    params = context['dag_run'].conf

    batch_id = params['batch_id']

    client_id = params['client_id']

    table_type = context['op_kwargs']['table_type']

  

    # 1. Lire le fichier Excel correspondant

    df = read_excel_file(table_type, batch_id)

  

    # 2. Ajouter la colonne client_id

    df['client_id'] = client_id

    df['batch_id'] = batch_id

  

    # 3. Nettoyer et transformer

    df_cleaned = clean_dimension_data(df, table_type)

  

    # 4. Insérer dans ClickHouse (UPSERT)

    # Stratégie : DELETE + INSERT pour simplifier

    clickhouse_client.query(f"""

        DELETE FROM {get_table_name(table_type)}

        WHERE client_id = '{client_id}'

    """)

  

    clickhouse_client.insert_dataframe(

        f"INSERT INTO {get_table_name(table_type)} VALUES",

        df_cleaned

    )

  

    # 5. Sauvegarder le résultat sur S3

    save_result_to_s3(df_cleaned, table_type, batch_id)

```

### 4.4 Communication avec PostgreSQL

```python

defupdate_postgres_status(**context):

    """

    Mise à jour du statut dans PostgreSQL après traitement

    """

    import psycopg2

  

    params = context['dag_run'].conf

    batch_id = params['batch_id']

  

    conn = psycopg2.connect(os.getenv('DATABASE_URL'))

    cursor = conn.cursor()

  

    try:

        # Mettre à jour la période

        cursor.execute("""

            UPDATE comptable_periods

            SET status = 'COMPLETED',

                processed_at = NOW()

            WHERE batch_id = %s

        """, (batch_id,))

      

        # Mettre à jour les fichiers

        cursor.execute("""

            UPDATE files

            SET processing_status = 'COMPLETED',

                processed_at = NOW()

            WHERE batch_id = %s

        """, (batch_id,))

      

        conn.commit()

      

        # Envoyer une notification WebSocket (optionnel)

        send_websocket_notification(batch_id, 'COMPLETED')

      

    exceptExceptionas e:

        conn.rollback()

        raise

    finally:

        cursor.close()

        conn.close()

```

### 4.5 Gestion des Backups

```python

defhandle_existing_period(**context):

    """

    Gérer les backups avant écrasement

    """

    import boto3

    from datetime import datetime

  

    params = context['dag_run'].conf

    s3_prefix = params['s3_prefix']  # {clientId}/declaration/{year}/periode-{start}-{end}/

  

    s3_client = boto3.client('s3')

    bucket = os.getenv('S3_BUCKET')

  

    # Vérifier si des fichiers existent déjà

    existing_files = s3_client.list_objects_v2(

        Bucket=bucket,

        Prefix=s3_prefix

    )

  

    if existing_files.get('Contents'):

        # Créer un backup avec timestamp

        backup_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        backup_prefix = f"{s3_prefix}backup/{backup_timestamp}/"

      

        # Copier les fichiers existants vers backup/

        for obj in existing_files['Contents']:

            ifnot obj['Key'].startswith(f"{s3_prefix}backup/"):

                copy_source = {'Bucket': bucket, 'Key': obj['Key']}

                new_key = obj['Key'].replace(s3_prefix, backup_prefix)

                s3_client.copy_object(

                    CopySource=copy_source,

                    Bucket=bucket,

                    Key=new_key

                )

```

---

## 5️⃣ Flux Complet de Traitement

### Diagramme de Séquence

```

Utilisateur          Next.js API         PostgreSQL         S3         Airflow         ClickHouse

    |                    |                   |               |            |                |

    |--Upload 5 fichiers->|                  |               |            |                |

    |                    |--Valider période->|               |            |                |

    |                    |                   |               |            |                |

    |                    |--Upload S3--------|-------------->|            |                |

    |                    |                   |               |            |                |

    |                    |--Create Period--->|               |            |                |

    |<--batchId----------|                   |               |            |                |

    |                    |                   |               |            |                |

    |--Lancer ETL------->|                   |               |            |                |

    |                    |--Check overlap--->|               |            |                |

    |                    |                   |               |            |                |

    |                    |--Trigger DAG------|---------------|----------->|                |

    |                    |                   |               |            |                |

    |                    |--Update status--->|               |            |                |

    |                    |   (PROCESSING)    |               |            |                |

    |<--dagRunId---------|                   |               |            |                |

    |                    |                   |               |            |                |

    |                    |                   |               |<--Download-|                |

    |                    |                   |               |            |                |

    |                    |                   |               |            |--Process------>|

    |                    |                   |               |            |   Dimensions   |

    |                    |                   |               |            |                |

    |                    |                   |               |            |--Process------>|

    |                    |                   |               |            |   Faits        |

    |                    |                   |               |            |                |

    |                    |                   |               |<--Upload---|                |

    |                    |                   |               |  success/  |                |

    |                    |                   |               |            |                |

    |                    |                   |<--Update status-----------|                |

    |                    |                   |   (COMPLETED) |            |                |

    |                    |                   |               |            |                |

    |--Poll status------>|                   |               |            |                |

    |<--COMPLETED--------|                   |               |            |                |

```

---

## 6️⃣ Points Critiques à Implémenter

### 6.1 Extraction de Période depuis Excel

```python

import pandas as pd

import re

from datetime import datetime


defextract_period_from_excel(file_path):

    """

    Extraire la période depuis un fichier Excel Grand Livre

    """

    df = pd.read_excel(file_path, header=None)

  

    period_start = None

    period_end = None

  

    for idx, row in df.iterrows():

        row_str = ' '.join([str(cell) for cell in row if pd.notna(cell)])

      

        # Chercher "Période du"

        if'Période du'in row_str or'Periode du'in row_str:

            # Extraire la date (format DD/MM/YYYY ou DD/MM/YY)

            dates = re.findall(r'(\d{2}/\d{2}/\d{2,4})', row_str)

            if dates:

                period_start = parse_french_date(dates[0])

      

        # Chercher "au" seul sur une ligne

        if period_start and row_str.strip().lower() == 'au':

            # La date de fin est sur la ligne suivante

            next_row = df.iloc[idx + 1]

            next_row_str = ' '.join([str(cell) for cell in next_row if pd.notna(cell)])

            dates = re.findall(r'(\d{2}/\d{2}/\d{2,4})', next_row_str)

            if dates:

                period_end = parse_french_date(dates[0])

                break

  

    return period_start, period_end


defparse_french_date(date_str):

    """

    Parser une date française DD/MM/YYYY ou DD/MM/YY

    """

    for fmt in ['%d/%m/%Y', '%d/%m/%y']:

        try:

            return datetime.strptime(date_str, fmt)

        exceptValueError:

            continue

    raiseValueError(f"Format de date invalide: {date_str}")

```

### 6.2 Validation de Cohérence

```typescript

// Dans Next.js API

asyncfunctionvalidatePeriodConsistency(files: File[]) {

  constgrandLivreComptes = files.find(f=>f.type === 'GRAND_LIVRE_COMPTES');

  constgrandLivreTiers = files.find(f=>f.type === 'GRAND_LIVRE_TIERS');

  

  // Extraire les périodes (appel Python via subprocess ou API)

  constperiod1 = awaitextractPeriod(grandLivreComptes);

  constperiod2 = awaitextractPeriod(grandLivreTiers);

  

  if (

    period1.start.getTime() !== period2.start.getTime() ||

    period1.end.getTime() !== period2.end.getTime()

  ) {

    thrownewError('Les périodes des deux Grand Livres ne correspondent pas');

  }

  

  returnperiod1;

}

```

### 6.3 Déclenchement Airflow depuis Next.js

```typescript

// utils/airflow.ts

importaxiosfrom'axios';


exportasyncfunctiontriggerAirflowDAG(batchId: string, clientId: string, s3Prefix: string) {

  constairflowUrl = process.env.AIRFLOW_API_URL; // http://localhost:8080/api/v1

  constauth = {

    username:process.env.AIRFLOW_USERNAME,

    password:process.env.AIRFLOW_PASSWORD

  };

  

  constresponse = awaitaxios.post(

    `${airflowUrl}/dags/process_comptable_files/dagRuns`,

    {

      conf: {

        batch_id:batchId,

        client_id:clientId,

        s3_prefix:s3Prefix

      }

    },

    { auth }

  );

  

  returnresponse.data.dag_run_id;

}

```

---

## 7️⃣ Monitoring en Temps Réel

### Option 1 : Polling (Simple)

```typescript

// Côté client Next.js

asyncfunctionpollProcessingStatus(batchId: string) {

  constinterval = setInterval(async () => {

    constresponse = awaitfetch(`/api/files/comptable/status/${batchId}`);

    constdata = awaitresponse.json();

  

    if (data.status === 'COMPLETED' || data.status === 'FAILED') {

      clearInterval(interval);

      // Mettre à jour l'UI

    }

  }, 5000); // Toutes les 5 secondes

}

```

### Option 2 : WebSocket (Avancé)

```typescript

// Airflow envoie des notifications via Redis PubSub

// Next.js écoute via WebSocket

```

---

## 8️⃣ Checklist d'Implémentation

### Phase 1 : Base de données

- [ ] Ajouter les nouvelles tables Prisma
- [ ] Migrer la base de données
- [ ] Créer les fonctions SQL de validation
- [ ] Ajouter les colonnes `client_id` dans ClickHouse

### Phase 2 : Next.js

- [ ] Créer l'API d'upload comptable avec validation
- [ ] Créer l'API de déclenchement ETL
- [ ] Créer l'API de statut
- [ ] Développer le composant UI de déclaration
- [ ] Développer la timeline des périodes

### Phase 3 : Airflow

- [ ] Adapter le DAG pour accepter les paramètres `batch_id`, `client_id`
- [ ] Ajouter la logique de backup
- [ ] Implémenter la notification PostgreSQL
- [ ] Tester le traitement parallèle (plusieurs clients simultanés)

### Phase 4 : Tests

- [ ] Tester l'upload avec validation de période
- [ ] Tester le chevauchement de périodes
- [ ] Tester le traitement multi-tenant
- [ ] Tester les backups
- [ ] Tester la restauration

---

## 🚀 Résumé de l'Approche

1.**Séparation des fichiers** : catégorie `NORMAL` vs `COMPTABLE` dans Postgres

2.**Validation stricte** : extraction automatique de période, vérification de cohérence

3.**Multi-tenant** : isolation par `client_id` dans toutes les tables ClickHouse

4.**ETL paramétré** : Airflow reçoit `batch_id` et `client_id` pour chaque run

5.**Communication bidirectionnelle** : Next.js → Airflow (trigger), Airflow → Postgres (statut)

6.**Historisation** : backup automatique avant écrasement

7.**Monitoring** : polling simple du statut de traitement

Cette approche minimise les modifications tout en garantissant l'isolation des données et le traitement parallèle.
