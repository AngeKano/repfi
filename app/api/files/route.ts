// app/api/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, FileType, FileStatus } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]/route";

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const uploadSchema = z.object({
  clientId: z.string(),
  fileType: z.nativeEnum(FileType),
  fileYear: z.coerce.number().int().min(2000).max(2100),
  fileMonth: z.coerce.number().int().min(1).max(12),
  fileDay: z.number().int().min(1).max(31),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const clientId = formData.get("clientId") as string;
    const fileType = formData.get("fileType") as FileType;
    const fileYear = parseInt(formData.get("fileYear") as string);
    const fileMonth = parseInt(formData.get("fileMonth") as string);
    const fileDay = parseInt(formData.get("fileDay") as string);

    if (!file) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const validExcelTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (!validExcelTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Le fichier doit être un fichier Excel" },
        { status: 400 }
      );
    }

    const data = uploadSchema.parse({
      clientId,
      fileType,
      fileYear,
      fileMonth,
      fileDay,
    });

    const client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        companyId: session.user.companyId,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client non trouvé" }, { status: 404 });
    }

    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Génère un nom de fichier concaténé style 20241231_GrandLivre_Envol.xlsx
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fileDateStr = `${data.fileYear}${pad(data.fileMonth)}${pad(
      data.fileDay
    )}`;
    const ext = file.name.split(".").pop();
    const nameSansExt = file.name.replace(/\.[^/.]+$/, ""); // Enlève extension
    const fileBaseName = `${fileDateStr}_${data.fileType}_${nameSansExt}`;
    const fileNameFinal = `${fileBaseName}.${ext}`;

    const s3Key = `${session.user.companyId}/${data.clientId}/${data.fileYear}/${data.fileMonth}/${fileNameFinal}`;
    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    let fileRecord = await prisma.file.create({
      data: {
        fileName: file.name,
        fileType: data.fileType,
        fileYear: data.fileYear,
        s3Key,
        s3Url,
        fileSize: file.size,
        mimeType: file.type,
        status: FileStatus.EN_COURS,
        clientId: data.clientId,
        uploadedById: session.user.id,
      },
    });

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        })
      );

      fileRecord = await prisma.file.update({
        where: { id: fileRecord.id },
        data: {
          status: FileStatus.SUCCES,
          processedAt: new Date(),
        },
      });

      await prisma.fileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName: file.name,
          action: "UPLOAD",
          details: "Fichier uploadé avec succès",
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });
    } catch (s3Error) {
      await prisma.file.update({
        where: { id: fileRecord.id },
        data: {
          status: FileStatus.ERROR,
          errorMessage: "Erreur lors du transfert vers S3",
        },
      });

      await prisma.fileHistory.create({
        data: {
          fileId: fileRecord.id,
          fileName: file.name,
          action: "ERROR",
          details: "Erreur lors du transfert vers S3",
          userId: session.user.id,
          userEmail: session.user.email ?? "",
        },
      });

      return NextResponse.json(
        { error: "Erreur lors du transfert du fichier" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Fichier uploadé avec succès",
        file: fileRecord,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Données invalides", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
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

    const files = await prisma.file.findMany({
      where: {
        client: {
          companyId: session.user.companyId,
        },
        ...(clientId && { clientId }),
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error("GET files error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des fichiers" },
      { status: 500 }
    );
  }
}
