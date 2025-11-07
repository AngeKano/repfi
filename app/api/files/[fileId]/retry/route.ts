// app/api/files/[fileId]/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, FileStatus } from "@prisma/client";
import {
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: params.fileId,
        client: {
          companyId: session.user.companyId,
        },
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 }
      );
    }

    if (file.status !== FileStatus.ERROR) {
      return NextResponse.json(
        { error: "Seuls les fichiers en erreur peuvent être relancés" },
        { status: 400 }
      );
    }

    await prisma.file.update({
      where: { id: file.id },
      data: {
        status: FileStatus.EN_COURS,
        errorMessage: null,
      },
    });

    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: file.s3Key,
        })
      );

      const updatedFile = await prisma.file.update({
        where: { id: file.id },
        data: {
          status: FileStatus.SUCCES,
          processedAt: new Date(),
        },
      });

      await prisma.fileHistory.create({
        data: {
          fileId: file.id,
          fileName: file.fileName,
          action: "RETRY_SUCCESS",
          details: "Fichier récupéré avec succès",
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });

      return NextResponse.json({
        message: "Fichier relancé avec succès",
        file: updatedFile,
      });
    } catch (s3Error) {
      await prisma.file.update({
        where: { id: file.id },
        data: {
          status: FileStatus.ERROR,
          errorMessage: "Erreur lors de la vérification S3",
        },
      });

      await prisma.fileHistory.create({
        data: {
          fileId: file.id,
          fileName: file.fileName,
          action: "RETRY_FAILED",
          details: "Échec de la relance",
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });

      return NextResponse.json(
        { error: "Erreur lors de la relance" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Retry error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la relance" },
      { status: 500 }
    );
  }
}
