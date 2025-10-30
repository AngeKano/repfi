// app/api/auth/signup/route.ts
/**
 * Route d'inscription - Crée entreprise, admin et client
 * Endpoint: POST /api/auth/signup
 */

import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { z } from 'zod';
import { PrismaClient, CompanyType, PackType } from '@prisma/client';

const prisma = new PrismaClient();

// Schéma de validation
const signUpSchema = z.object({
  // Entreprise
  companyName: z.string().min(2).max(100),
  companyEmail: z.string().email().toLowerCase(),
  companyType: z.nativeEnum(CompanyType),
  packType: z.nativeEnum(PackType),
  companyPhone: z.string().optional(),
  companyWebsite: z.string().url().optional().or(z.literal('')),
  companyDescription: z.string().max(1000).optional(),
  companyDenomination: z.string().max(100).optional(),

  // Admin
  adminEmail: z.string().email().toLowerCase(),
  adminPassword: z.string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Mot de passe faible'),
  adminPasswordConfirm: z.string(),
  adminFirstName: z.string().min(2).max(50).optional(),
  adminLastName: z.string().min(2).max(50).optional(),
}).refine((data) => data.adminPassword === data.adminPasswordConfirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['adminPasswordConfirm'],
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validation
    const data = signUpSchema.parse(body);

    // Vérifier email entreprise
    const existingCompany = await prisma.company.findUnique({
      where: { email: data.companyEmail },
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: 'Cette entreprise est déjà enregistrée' },
        { status: 409 }
      );
    }

    // Vérifier email admin
    const existingUser = await prisma.user.findUnique({
      where: { email: data.adminEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 409 }
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await hash(data.adminPassword, 12);

    // Transaction : créer tout en une fois
    const result = await prisma.$transaction(async (tx) => {
      // 1. Créer l'entreprise
      const company = await tx.company.create({
        data: {
          name: data.companyName,
          denomination: data.companyDenomination,
          description: data.companyDescription,
          companyType: data.companyType,
          email: data.companyEmail,
          phone: data.companyPhone,
          website: data.companyWebsite,
          packType: data.packType,
        },
      });

      // 2. Créer l'ADMIN_ROOT
      const admin = await tx.user.create({
        data: {
          email: data.adminEmail,
          password: hashedPassword,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          companyId: company.id,
          role: 'ADMIN_ROOT',
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      // 3. Créer l'entité "self"
      const selfEntity = await tx.client.create({
        data: {
          name: data.companyName,
          denomination: data.companyDenomination,
          description: data.companyDescription,
          companyType: data.companyType,
          email: data.companyEmail,
          phone: data.companyPhone,
          website: data.companyWebsite,
          companyId: company.id,
          isSelfEntity: true,
          createdById: admin.id,
        },
      });

      return {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          packType: company.packType,
        },
        admin,
        selfEntity: {
          id: selfEntity.id,
          name: selfEntity.name,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Entreprise créée avec succès',
        data: result,
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Signup error:', error);

    // Erreur de validation Zod
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { 
          error: 'Données invalides', 
          details: error.errors 
        },
        { status: 400 }
      );
    }

    // Erreur Prisma
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Email déjà utilisé' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'inscription' },
      { status: 500 }
    );
  }
}
