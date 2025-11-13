import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      nom,
      denomination,
      dateFondation,
      typeEntreprise,
      parentCompanyId,
    } = body;

    // Validation des champs obligatoires
    if (
      !email ||
      !password ||
      !nom ||
      !denomination ||
      !dateFondation ||
      !typeEntreprise
    ) {
      return NextResponse.json(
        { error: "Tous les champs obligatoires doivent être remplis" },
        { status: 400 }
      );
    }

    // Vérifier si l'email existe déjà
    const existingCompany = await prisma.company.findUnique({
      where: { email },
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 }
      );
    }

    // Si c'est une filiale, vérifier l'entreprise parente
    if (parentCompanyId) {
      const parentCompany = await prisma.company.findUnique({
        where: { id: parentCompanyId },
      });

      if (!parentCompany) {
        return NextResponse.json(
          { error: "Entreprise parente introuvable" },
          { status: 404 }
        );
      }

      // Vérifier que l'entreprise parente n'est pas elle-même une filiale
      if (parentCompany.id) {
        return NextResponse.json(
          { error: "Une filiale ne peut pas créer d'autres filiales" },
          { status: 403 }
        );
      }
    }

    // Créer l'entreprise
    const company = await prisma.company.create({
      data: {
        name: nom,
        denomination,
        companyType: typeEntreprise,
        email,
      },
      select: {
        id: true,
        email: true,
        name: true,
        denomination: true,
        companyType: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Entreprise créée avec succès",
        company,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur lors de la création de l'entreprise:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de la création de l'entreprise" },
      { status: 500 }
    );
  }
}
