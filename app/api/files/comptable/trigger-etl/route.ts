// app/api/files/comptable/trigger-etl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, ProcessingStatus } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const prisma = new PrismaClient();

const triggerETLSchema = z.object({
  batchId: z.string().uuid(),
});

async function triggerAirflowDAG(
  batchId: string,
  clientId: string,
  clientName: string,
  s3Prefix: string
): Promise<string> {
  // Déclenche le DAG Airflow pour traiter les fichiers commptables
  const airflowUrl = process.env.AIRFLOW_API_URL;
  const airflowUsername = process.env.AIRFLOW_USERNAME;
  const airflowPassword = process.env.AIRFLOW_PASSWORD;

  if (!airflowUrl || !airflowUsername || !airflowPassword) {
    throw new Error(
      "Configuration Airflow manquante dans les variables d'environnement"
    );
  }

  try {
    const basicAuth = Buffer.from(
      `${airflowUsername}:${airflowPassword}`
    ).toString("base64");
    const airflowResponse = await fetch(
      `${airflowUrl}/dags/process_comptable_files/dagRuns`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conf: {
            batch_id: batchId,
            client_id: clientId,
            client_name: clientName,
            s3_prefix: s3Prefix,
            s3_bucket: process.env.AWS_S3_BUCKET_NAME,
          },
        }),
      }
    );
    if (!airflowResponse.ok) {
      let errMsg = "";
      try {
        errMsg =
          (await airflowResponse.json()).detail || airflowResponse.statusText;
      } catch (_) {
        errMsg = airflowResponse.statusText;
      }
      throw new Error(`Échec du déclenchement Airflow: ${errMsg}`);
    }
    const response = await airflowResponse.json();
    return response.data.dag_run_id;
  } catch (error: any) {
    console.error(
      "Erreur lors du déclenchement Airflow:",
      error.response?.data || error.message
    );
    throw new Error(
      `Échec du déclenchement Airflow: ${
        error.response?.data?.detail || error.message
      }`
    );
  }
}

// Fichier commptable
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { batchId } = triggerETLSchema.parse(body);

    // Récupérer la période commptable
    const commptablePeriod = await prisma.comptablePeriod.findUnique({
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

    if (!commptablePeriod) {
      return NextResponse.json(
        { error: "Période commptable non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier que l'utilisateur a accès à ce client
    if (commptablePeriod.client.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Vérifier que la période n'est pas déjà en cours de traitement
    if (commptablePeriod.status === ProcessingStatus.PROCESSING) {
      return NextResponse.json(
        {
          error: "Cette période est déjà en cours de traitement",
          status: commptablePeriod.status,
        },
        { status: 409 }
      );
    }

    // Vérifier que la période n'est pas déjà traitée
    if (commptablePeriod.status === ProcessingStatus.COMPLETED) {
      return NextResponse.json(
        {
          error: "Cette période a déjà été traitée avec succès",
          status: commptablePeriod.status,
        },
        { status: 409 }
      );
    }

    // Vérifier qu'il n'y a pas de chevauchement avec des périodes en cours
    const overlappingProcessing = await prisma.comptablePeriod.findFirst({
      where: {
        clientId: commptablePeriod.clientId,
        status: ProcessingStatus.PROCESSING,
        id: { not: commptablePeriod.id },
        OR: [
          {
            AND: [
              { periodStart: { lte: commptablePeriod.periodEnd } },
              { periodEnd: { gte: commptablePeriod.periodStart } },
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

    // Récupérer les fichiers comptables associés à la période (table comptableFile)
    const files = await prisma.comptableFile.findMany({
      where: {
        batchId,
      },
    });

    if (files.length !== 5) {
      return NextResponse.json(
        {
          error: `Nombre de fichiers comptables invalide: ${files.length}/5`,
        },
        { status: 400 }
      );
    }

    // Construire le préfixe S3
    const year = commptablePeriod.periodStart.getFullYear();
    const formatDateYYYYMMDD = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}${month}${day}`;
    };
    const periodFolder = `periode-${formatDateYYYYMMDD(
      commptablePeriod.periodStart
    )}-${formatDateYYYYMMDD(commptablePeriod.periodEnd)}`;
    const s3Prefix = `${commptablePeriod.clientId}/declaration/${year}/${periodFolder}/`;

    // Déclencher le DAG Airflow
    let dagRunId: string;
    try {
      dagRunId = await triggerAirflowDAG(
        batchId,
        commptablePeriod.client.id,
        commptablePeriod.client.name,
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
        id: commptablePeriod.id,
      },
      data: {
        status: ProcessingStatus.PROCESSING,
      },
    });

    // Mettre à jour le statut des fichiers comptables à PROCESSING
    await prisma.comptableFile.updateMany({
      where: {
        batchId,
      },
      data: {
        processingStatus: ProcessingStatus.PROCESSING,
      },
    });

    // Créer un historique pour chaque fichier comptable
    for (const file of files) {
      await prisma.comptableFileHistory.create({
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
          start: commptablePeriod.periodStart.toISOString(),
          end: commptablePeriod.periodEnd.toISOString(),
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
          in: [
            ProcessingStatus.PENDING,
            ProcessingStatus.PROCESSING,
            ProcessingStatus.VALIDATING,
          ],
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
