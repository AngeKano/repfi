// app/api/files/comptable/trigger-etl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, ProcessingStatus } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "../../auth/[...nextauth]/route";
import axios from "axios";

const prisma = new PrismaClient();

const triggerETLSchema = z.object({
  batchId: z.string().uuid(),
});

/**
 * Déclenche le DAG Airflow pour traiter les fichiers comptables
 */
async function triggerAirflowDAG(
  batchId: string,
  clientId: string,
  clientName: string,
  s3Prefix: string
): Promise<string> {
  const airflowUrl = process.env.AIRFLOW_API_URL; // http://localhost:8080/api/v1
  const airflowUsername = process.env.AIRFLOW_USERNAME;
  const airflowPassword = process.env.AIRFLOW_PASSWORD;

  if (!airflowUrl || !airflowUsername || !airflowPassword) {
    throw new Error("Configuration Airflow manquante dans les variables d'environnement");
  }

  try {
    const response = await axios.post(
      `${airflowUrl}/dags/process_comptable_files/dagRuns`,
      {
        conf: {
          batch_id: batchId,
          client_id: clientId,
          client_name: clientName,
          s3_prefix: s3Prefix,
          s3_bucket: process.env.AWS_S3_BUCKET_NAME,
        },
      },
      {
        auth: {
          username: airflowUsername,
          password: airflowPassword,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.dag_run_id;
  } catch (error: any) {
    console.error("Erreur lors du déclenchement Airflow:", error.response?.data || error.message);
    throw new Error(`Échec du déclenchement Airflow: ${error.response?.data?.detail || error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { batchId } = triggerETLSchema.parse(body);

    // Récupérer la période comptable
    const comptablePeriod = await prisma.comptablePeriod.findUnique({
      where: {
        batchId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyId: true,
          },
        },
      },
    });

    if (!comptablePeriod) {
      return NextResponse.json(
        { error: "Période comptable non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier que l'utilisateur a accès à ce client
    if (comptablePeriod.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Vérifier que la période n'est pas déjà en cours de traitement
    if (comptablePeriod.status === ProcessingStatus.PROCESSING) {
      return NextResponse.json(
        {
          error: "Cette période est déjà en cours de traitement",
          status: comptablePeriod.status,
        },
        { status: 409 }
      );
    }

    // Vérifier que la période n'est pas déjà traitée
    if (comptablePeriod.status === ProcessingStatus.COMPLETED) {
      return NextResponse.json(
        {
          error: "Cette période a déjà été traitée avec succès",
          status: comptablePeriod.status,
        },
        { status: 409 }
      );
    }

    // Vérifier qu'il n'y a pas de chevauchement avec des périodes en cours
    const overlappingProcessing = await prisma.comptablePeriod.findFirst({
      where: {
        clientId: comptablePeriod.clientId,
        status: ProcessingStatus.PROCESSING,
        id: { not: comptablePeriod.id },
        OR: [
          {
            AND: [
              { periodStart: { lte: comptablePeriod.periodEnd } },
              { periodEnd: { gte: comptablePeriod.periodStart } },
            ],
          },
        ],
      },
    });

    if (overlappingProcessing) {
      return NextResponse.json(
        {
          error: "Une période chevauchante est déjà en cours de traitement",
          existingPeriod: {
            batchId: overlappingProcessing.batchId,
            start: overlappingProcessing.periodStart.toISOString(),
            end: overlappingProcessing.periodEnd.toISOString(),
          },
        },
        { status: 409 }
      );
    }

    // Récupérer les fichiers associés
    const files = await prisma.file.findMany({
      where: {
        batchId,
      },
    });

    if (files.length !== 5) {
      return NextResponse.json(
        {
          error: `Nombre de fichiers invalide: ${files.length}/5`,
        },
        { status: 400 }
      );
    }

    // Construire le préfixe S3
    const year = comptablePeriod.periodStart.getFullYear();
    const formatDateYYYYMMDD = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };
    const periodFolder = `periode-${formatDateYYYYMMDD(comptablePeriod.periodStart)}-${formatDateYYYYMMDD(comptablePeriod.periodEnd)}`;
    const s3Prefix = `${comptablePeriod.clientId}/declaration/${year}/${periodFolder}/`;

    // Déclencher le DAG Airflow
    let dagRunId: string;
    try {
      dagRunId = await triggerAirflowDAG(
        batchId,
        comptablePeriod.client.id,
        comptablePeriod.client.name,
        s3Prefix
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Erreur lors du déclenchement de l'ETL",
          details: error.message,
        },
        { status: 500 }
      );
    }

    // Mettre à jour le statut de la période à PROCESSING
    await prisma.comptablePeriod.update({
      where: {
        id: comptablePeriod.id,
      },
      data: {
        status: ProcessingStatus.PROCESSING,
      },
    });

    // Mettre à jour le statut des fichiers à PROCESSING
    await prisma.file.updateMany({
      where: {
        batchId,
      },
      data: {
        processingStatus: ProcessingStatus.PROCESSING,
      },
    });

    // Créer un historique pour chaque fichier
    for (const file of files) {
      await prisma.fileHistory.create({
        data: {
          fileId: file.id,
          fileName: file.fileName,
          action: "ETL_TRIGGERED",
          details: `Traitement ETL déclenché - DAG Run ID: ${dagRunId}`,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    }

    return NextResponse.json(
      {
        message: "Traitement ETL déclenché avec succès",
        batchId,
        dagRunId,
        status: ProcessingStatus.PROCESSING,
        period: {
          start: comptablePeriod.periodStart.toISOString(),
          end: comptablePeriod.periodEnd.toISOString(),
        },
        s3Prefix,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Trigger ETL error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: "Erreur lors du déclenchement de l'ETL",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    // Récupérer les périodes en cours de traitement
    const processingPeriods = await prisma.comptablePeriod.findMany({
      where: {
        client: {
          companyId: session.user.companyId,
        },
        ...(clientId && { clientId }),
        status: {
          in: [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING, ProcessingStatus.VALIDATING],
        },
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      processingPeriods,
    });
  } catch (error) {
    console.error("GET processing periods error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des périodes en traitement" },
      { status: 500 }
    );
  }
}