import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createClientFoldersInS3 } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const { email, password, name, company, type } = await req.json();

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json(
        { error: "Email déjà utilisé" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, company, type },
    });

    // Créer les dossiers S3 pour les clients
    if (type === "client") {
      try {
        await createClientFoldersInS3(company);
      } catch (error) {
        console.error("Erreur création dossiers S3:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}