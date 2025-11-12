// app/api/files/comptable/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, FileType, FileCategory, ProcessingStatus } from "@prisma/client";
import { S3Client, PutObjectCommand, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { authOptions } from "../../auth/[...nextauth]/route";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const uploadComptableSchema = z.object({
  clientId: z.string(),
});

const REQUIRED_FILE_TYPES = [
  FileType.GRAND_LIVRE_COMPTES,
  FileType.GRAND_LIVRE_TIERS,
  FileType.PLAN_COMPTES,
  FileType.PLAN_TIERS,
  FileType.CODE_JOURNAL,
];

interface PeriodExtraction {
  start: Date;
  end: Date;
}

/**
 * Extrait la période depuis un fichier Excel Grand Livre
 * Recherche "Période du" et "au" pour extraire les dates
 */
async function extractPeriodFromExcel(buffer: Buffer): Promise<PeriodExtraction> {
  const XLSX = require('xlsx');
  
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir en JSON pour parcourir les lignes
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowStr = row.join(' ').toLowerCase();
    
    // Chercher "Période du" ou "Periode du"
    if (rowStr.includes('période du') || rowStr.includes('periode du')) {
      const dateMatch = rowStr.match(/(\d{2}\/\d{2}\/\d{2,4})/);
      if (dateMatch) {
        periodStart = parseFrenchDate(dateMatch[1]);
      }
    }
    
    // Chercher "au" isolé
    if (periodStart && rowStr.trim() === 'au' && i + 1 < data.length) {
      const nextRow = data[i + 1];
      const nextRowStr = nextRow.join(' ');
      const dateMatch = nextRowStr.match(/(\d{2}\/\d{2}\/\d{2,4})/);
      if (dateMatch) {
        periodEnd = parseFrenchDate(dateMatch[1]);
        break;
      }
    }
  }
  
  if (!periodStart || !periodEnd) {
    throw new Error("Impossible d'extraire la période du fichier");
  }
  
  return { start: periodStart, end: periodEnd };
}

/**
 * Parse une date française DD/MM/YYYY ou DD/MM/YY
 */
function parseFrenchDate(dateStr: string): Date {
  const parts = dateStr.split('/');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Les mois commencent à 0
  let year = parseInt(parts[2], 10);
  
  // Si année sur 2 chiffres, ajouter 2000
  if (year < 100) {
    year += 2000;
  }
  
  return new Date(year, month, day);
}

/**
 * Vérifie que deux périodes sont identiques
 */
function periodsMatch(period1: PeriodExtraction, period2: PeriodExtraction): boolean {
  return (
    period1.start.getTime() === period2.start.getTime() &&
    period1.end.getTime() === period2.end.getTime()
  );
}

/**
 * Formate une date en YYYYMMDD
 */
function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formate une période pour le nom de répertoire
 */
function formatPeriodFolder(start: Date, end: Date): string {
  return `periode-${formatDateYYYYMMDD(start)}-${formatDateYYYYMMDD(end)}`;
}

/**
 * Crée un backup des fichiers existants si nécessaire
 */
async function createBackupIfNeeded(s3Prefix: string): Promise<void> {
  const bucket = process.env.AWS_S3_BUCKET_NAME!;
  
  try {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: s3Prefix,
        MaxKeys: 10,
      })
    );
    
    // Si des fichiers existent, créer un backup
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const now = new Date();
      const timestamp = `${formatDateYYYYMMDD(now)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const backupPrefix = `${s3Prefix}backup/${timestamp}/`;
      
      // Copier chaque fichier vers le backup
      for (const obj of listResponse.Contents) {
        if (!obj.Key?.includes('backup/') && !obj.Key?.includes('success/')) {
          const fileName = obj.Key.split('/').pop();
          await s3Client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${obj.Key}`,
              Key: `${backupPrefix}${fileName}`,
            })
          );
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors de la création du backup:', error);
    // Ne pas bloquer si le backup échoue
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const clientId = formData.get("clientId") as string;
    
    // Récupérer les 5 fichiers
    const files: { file: File; fileType: FileType }[] = [];
    for (const fileType of REQUIRED_FILE_TYPES) {
      const file = formData.get(fileType) as File;
      if (!file) {
        return NextResponse.json(
          { error: `Fichier manquant: ${fileType}` },
          { status: 400 }
        );
      }
      files.push({ file, fileType });
    }

    // Validation du schéma
    const data = uploadComptableSchema.parse({ clientId });

    // Vérifier que le client existe
    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    // Vérifier que tous les fichiers sont Excel
    const validExcelTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    for (const { file } of files) {
      if (!validExcelTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `Le fichier ${file.name} doit être un fichier Excel` },
          { status: 400 }
        );
      }
    }

    // Vérifier qu'il n'y a pas de doublons de type
    const fileTypes = files.map(f => f.fileType);
    const uniqueTypes = new Set(fileTypes);
    if (uniqueTypes.size !== fileTypes.length) {
      return NextResponse.json(
        { error: "Types de fichiers dupliqués détectés" },
        { status: 400 }
      );
    }

    // Extraire les périodes des deux Grand Livres
    const grandLivreComptesFile = files.find(f => f.fileType === FileType.GRAND_LIVRE_COMPTES)!;
    const grandLivreTiersFile = files.find(f => f.fileType === FileType.GRAND_LIVRE_TIERS)!;

    const bufferComptes = Buffer.from(await grandLivreComptesFile.file.arrayBuffer());
    const bufferTiers = Buffer.from(await grandLivreTiersFile.file.arrayBuffer());

    let periodComptes: PeriodExtraction;
    let periodTiers: PeriodExtraction;

    try {
      periodComptes = await extractPeriodFromExcel(bufferComptes);
      periodTiers = await extractPeriodFromExcel(bufferTiers);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Erreur d'extraction de période: ${error.message}` },
        { status: 400 }
      );
    }

    // Vérifier que les périodes correspondent
    if (!periodsMatch(periodComptes, periodTiers)) {
      return NextResponse.json(
        {
          error: "Les périodes des deux Grand Livres ne correspondent pas",
          details: {
            grandLivreComptes: {
              start: periodComptes.start.toISOString(),
              end: periodComptes.end.toISOString(),
            },
            grandLivreTiers: {
              start: periodTiers.start.toISOString(),
              end: periodTiers.end.toISOString(),
            },
          },
        },
        { status: 400 }
      );
    }

    const period = periodComptes;
    const year = period.start.getFullYear();

    // Vérifier qu'il n'y a pas de chevauchement avec des périodes existantes
    const overlappingPeriod = await prisma.comptablePeriod.findFirst({
      where: {
        clientId: data.clientId,
        status: ProcessingStatus.COMPLETED,
        OR: [
          {
            AND: [
              { periodStart: { lte: period.end } },
              { periodEnd: { gte: period.start } },
            ],
          },
        ],
      },
    });

    if (overlappingPeriod) {
      return NextResponse.json(
        {
          error: "Cette période chevauche une période déjà traitée",
          existingPeriod: {
            start: overlappingPeriod.periodStart.toISOString(),
            end: overlappingPeriod.periodEnd.toISOString(),
          },
        },
        { status: 409 }
      );
    }

    // Générer un batchId unique
    const batchId = randomUUID();

    // Définir le préfixe S3
    const periodFolder = formatPeriodFolder(period.start, period.end);
    const s3Prefix = `${data.clientId}/declaration/${year}/${periodFolder}/`;

    // Créer un backup si des fichiers existent déjà
    await createBackupIfNeeded(s3Prefix);

    // Uploader les fichiers sur S3
    const uploadedFiles: any[] = [];

    for (const { file, fileType } of files) {
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      // Générer le nom de fichier: YYYYMMDD_TYPE_ClientName.xlsx
      const dateStr = formatDateYYYYMMDD(period.end);
      const ext = file.name.split(".").pop();
      const fileName = `${dateStr}_${fileType}_${client.name}.${ext}`;

      const s3Key = `${s3Prefix}${fileName}`;
      const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      // Upload vers S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        })
      );

      // Créer l'enregistrement dans la base
      const fileRecord = await prisma.file.create({
        data: {
          fileName: fileName,
          fileType: fileType,
          fileYear: year,
          category: FileCategory.COMPTABLE,
          s3Key,
          s3Url,
          fileSize: file.size,
          mimeType: file.type,
          status: FileStatus.SUCCES,
          processingStatus: ProcessingStatus.PENDING,
          batchId,
          periodStart: period.start,
          periodEnd: period.end,
          clientId: data.clientId,
          uploadedById: session.user.id,
          processedAt: new Date(),
        },
      });

      uploadedFiles.push(fileRecord);

      // Créer l'historique
      await prisma.fileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName: fileName,
          action: "UPLOAD_COMPTABLE",
          details: `Fichier comptable uploadé - Période: ${formatDateYYYYMMDD(period.start)} au ${formatDateYYYYMMDD(period.end)}`,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    }

    // Créer l'enregistrement de la période
    const comptablePeriod = await prisma.comptablePeriod.create({
      data: {
        clientId: data.clientId,
        periodStart: period.start,
        periodEnd: period.end,
        year,
        batchId,
        status: ProcessingStatus.PENDING,
      },
    });

    return NextResponse.json(
      {
        message: "Fichiers comptables uploadés avec succès",
        batchId,
        period: {
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          year,
        },
        s3Prefix,
        files: uploadedFiles,
        comptablePeriod,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Upload comptable error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de l'upload des fichiers comptables", details: error.message },
      { status: 500 }
    );
  }
}