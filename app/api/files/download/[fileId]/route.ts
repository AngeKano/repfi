// app/api/files/download/[fileId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
// import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
      include: {
        client: true,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 }
      );
    }

    if (!file.s3Key) {
      return NextResponse.json(
        { error: "Fichier non disponible" },
        { status: 400 }
      );
    }

    // Générer une URL signée valide pour 1 heure
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: file.s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 heure
    });

    return NextResponse.json({
      url: signedUrl,
      fileName: file.fileName,
    });
  } catch (error) {
    console.error("Erreur génération URL signée:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du lien de téléchargement" },
      { status: 500 }
    );
  }
}
