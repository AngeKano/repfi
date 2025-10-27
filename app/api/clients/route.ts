import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createClientFoldersInS3 } from "@/lib/s3";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, type: true },
  });

  if (!currentUser || currentUser.type !== "partner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { email, password, name, company } = await req.json();

  if (!email || !password || !name || !company) {
    return NextResponse.json(
      { error: "Champs requis manquant" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // Créer l'utilisateur
  const client = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      company,
      type: "client",
      partnerId: currentUser.id,
    },
  });

  // Créer les dossiers S3
  try {
    await createClientFoldersInS3(company);
  } catch (error) {
    console.error("Erreur création dossiers S3:", error);
    // L'utilisateur est créé, on continue même si S3 échoue
  }

  return NextResponse.json(client);
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, type: true },
  });

  if (!currentUser || currentUser.type !== "partner") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const clients = await prisma.user.findMany({
    where: { partnerId: currentUser.id },
  });

  return NextResponse.json(clients);
}
