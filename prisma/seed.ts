// prisma/seed.ts
// Script de seed pour données de test

import {
  PrismaClient,
  PackType,
  UserRole,
  CompanyType,
  FileType,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Nettoyer la base (ATTENTION: uniquement en développement!)
  if (process.env.NODE_ENV === "development") {
    console.log("🧹 Cleaning existing data...");
    await prisma.fileHistory.deleteMany();
    await prisma.file.deleteMany();
    await prisma.clientAssignment.deleteMany();
    await prisma.socialNetwork.deleteMany();
    await prisma.client.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    // Ne pas supprimer file_type_patterns car ils sont insérés via SQL
  }

  // ========================================
  // ENTREPRISE 1 - Cabinet Comptable "FinExpert"
  // Pack ENTREPRISE avec plusieurs clients
  // ========================================

  console.log("📊 Creating Company 1: FinExpert...");

  const company1 = await prisma.company.create({
    data: {
      name: "FinExpert Conseil",
      denomination: "FinExpert SAS",
      description: "Cabinet comptable spécialisé dans les PME technologiques",
      companyType: CompanyType.FINANCE,
      email: "contact@finexpert.com",
      phone: "+225 1 23 45 67 89",
      website: "https://www.finexpert.com",
      packType: PackType.ENTREPRISE,
    },
  });

  // Admin Root de FinExpert
  const hashedPassword1 = await bcrypt.hash("AdminRoot123!", 10);
  const adminRoot1 = await prisma.user.create({
    data: {
      email: "admin@finexpert.com",
      password: hashedPassword1,
      firstName: "Jean",
      lastName: "Dupont",
      companyId: company1.id,
      role: UserRole.ADMIN_ROOT,
    },
  });

  console.log(`✅ ADMIN_ROOT created: ${adminRoot1.email}`);

  // Entité "self" de FinExpert
  const selfEntity1 = await prisma.client.create({
    data: {
      name: "FinExpert Conseil",
      denomination: "FinExpert SAS",
      companyType: CompanyType.FINANCE,
      email: "contact@finexpert.com",
      phone: "+225 1 23 45 67 89",
      website: "https://www.finexpert.com",
      companyId: company1.id,
      isSelfEntity: true,
      createdById: adminRoot1.id,
      socialNetworks: {
        create: [
          { type: "LINKEDIN", url: "https://linkedin.com/company/finexpert" },
          { type: "TWITTER", url: "https://twitter.com/finexpert" },
        ],
      },
    },
  });

  console.log(`✅ Self entity created for FinExpert`);

  // Admin supplémentaire
  const hashedPassword2 = await bcrypt.hash("Admin123!", 10);
  const admin1 = await prisma.user.create({
    data: {
      email: "marie.martin@finexpert.com",
      password: hashedPassword2,
      firstName: "Marie",
      lastName: "Martin",
      companyId: company1.id,
      role: UserRole.ADMIN,
    },
  });

  console.log(`✅ ADMIN created: ${admin1.email}`);

  // Users simples
  const hashedPassword3 = await bcrypt.hash("User123!", 10);
  const user1 = await prisma.user.create({
    data: {
      email: "pierre.dubois@finexpert.com",
      password: hashedPassword3,
      firstName: "Pierre",
      lastName: "Dubois",
      companyId: company1.id,
      role: UserRole.USER,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: "sophie.bernard@finexpert.com",
      password: hashedPassword3,
      firstName: "Sophie",
      lastName: "Bernard",
      companyId: company1.id,
      role: UserRole.USER,
    },
  });

  console.log(`✅ USERS created: ${user1.email}, ${user2.email}`);

  // Client 1: TechStartup Inc.
  const client1 = await prisma.client.create({
    data: {
      name: "TechStartup Inc.",
      denomination: "TechStartup SARL",
      description: "Startup spécialisée dans l'IA",
      companyType: CompanyType.TECHNOLOGIE,
      email: "contact@techstartup.com",
      phone: "+225 1 98 76 54 32",
      website: "https://www.techstartup.com",
      companyId: company1.id,
      createdById: adminRoot1.id,
      socialNetworks: {
        create: [
          { type: "LINKEDIN", url: "https://linkedin.com/company/techstartup" },
        ],
      },
    },
  });

  console.log(`✅ Client created: ${client1.name}`);

  // Assigner Pierre à TechStartup avec rôle USER
  await prisma.clientAssignment.create({
    data: {
      userId: user1.id,
      clientId: client1.id,
      role: UserRole.USER,
    },
  });

  // Client 2: GreenAgro SARL
  const client2 = await prisma.client.create({
    data: {
      name: "GreenAgro SARL",
      denomination: "GreenAgro",
      description: "Agriculture biologique et durable",
      companyType: CompanyType.AGRICULTURE,
      email: "info@greenagro.fr",
      phone: "+225 2 45 67 89 01",
      companyId: company1.id,
      createdById: admin1.id,
      socialNetworks: {
        create: [
          { type: "FACEBOOK", url: "https://facebook.com/greenagro" },
          { type: "TWITTER", url: "https://twitter.com/greenagro" },
        ],
      },
    },
  });

  console.log(`✅ Client created: ${client2.name}`);

  // Assigner Sophie à GreenAgro avec rôle ADMIN
  await prisma.clientAssignment.create({
    data: {
      userId: user2.id,
      clientId: client2.id,
      role: UserRole.ADMIN,
    },
  });

  // Client 3: HealthCare Plus
  const client3 = await prisma.client.create({
    data: {
      name: "HealthCare Plus",
      companyType: CompanyType.SANTE,
      email: "contact@healthcareplus.com",
      companyId: company1.id,
      createdById: adminRoot1.id,
    },
  });

  console.log(`✅ Client created: ${client3.name}`);

  // Assigner Pierre et Sophie à HealthCare Plus
  await prisma.clientAssignment.createMany({
    data: [
      { userId: user1.id, clientId: client3.id, role: UserRole.USER },
      { userId: user2.id, clientId: client3.id, role: UserRole.USER },
    ],
  });

  // ========================================
  // FICHIERS EXEMPLES pour TechStartup
  // ========================================

  console.log("📁 Creating example files...");

  const file1 = await prisma.file.create({
    data: {
      fileName: "20240101_GrandLivre_Comptes_TechStartup.xlsx",
      fileType: FileType.GRAND_LIVRE_COMPTES,
      fileYear: 2024,
      s3Key: `${client1.id}/2024/sample_grand_livre_comptes.xlsx`,
      s3Url: `https://example-bucket.s3.eu-west-1.amazonaws.com/${client1.id}/2024/sample_grand_livre_comptes.xlsx`,
      fileSize: 2048576, // 2MB
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: "SUCCES",
      clientId: client1.id,
      uploadedById: user1.id,
      processedAt: new Date(),
    },
  });

  const file2 = await prisma.file.create({
    data: {
      fileName: "20240101_PlanComptable_TechStartup.xlsx",
      fileType: FileType.PLAN_COMPTES_TIERS,
      fileYear: 2024,
      s3Key: `${client1.id}/2024/sample_plan_comptable.xlsx`,
      s3Url: `https://example-bucket.s3.eu-west-1.amazonaws.com/${client1.id}/2024/sample_plan_comptable.xlsx`,
      fileSize: 1024768,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: "SUCCES",
      clientId: client1.id,
      uploadedById: user1.id,
      processedAt: new Date(),
    },
  });

  // Fichier en erreur
  const file3 = await prisma.file.create({
    data: {
      fileName: "20240101_CodeJournal_Corrupt.xlsx",
      fileType: FileType.CODE_JOURNAL,
      fileYear: 2024,
      s3Key: `${client1.id}/2024/corrupt_file.xlsx`,
      s3Url: `https://example-bucket.s3.eu-west-1.amazonaws.com/${client1.id}/2024/corrupt_file.xlsx`,
      fileSize: 512,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: "ERROR",
      errorMessage: "Le fichier est corrompu et ne peut pas être traité",
      clientId: client1.id,
      uploadedById: user1.id,
    },
  });

  console.log(
    `✅ Files created: ${file1.fileName}, ${file2.fileName}, ${file3.fileName}`
  );

  // ========================================
  // ENTREPRISE 2 - PACK SIMPLE
  // "AutoEntrepreneur Martin"
  // ========================================

  console.log("📊 Creating Company 2: AutoEntrepreneur Martin...");

  const company2 = await prisma.company.create({
    data: {
      name: "Martin Consulting",
      companyType: CompanyType.COMMERCE,
      email: "lucas.martin@consulting.fr",
      phone: "+225 6 12 34 56 78",
      packType: PackType.SIMPLE,
    },
  });

  const hashedPassword4 = await bcrypt.hash("Martin123!", 10);
  const adminRoot2 = await prisma.user.create({
    data: {
      email: "lucas.martin@consulting.fr",
      password: hashedPassword4,
      firstName: "Lucas",
      lastName: "Martin",
      companyId: company2.id,
      role: UserRole.ADMIN_ROOT,
    },
  });

  // Entité "self" automatique
  const selfEntity2 = await prisma.client.create({
    data: {
      name: "Martin Consulting",
      companyType: CompanyType.COMMERCE,
      email: "lucas.martin@consulting.fr",
      companyId: company2.id,
      isSelfEntity: true,
      createdById: adminRoot2.id,
    },
  });

  console.log(`✅ PACK SIMPLE company created: ${company2.name}`);

  // User assistant pour le pack simple
  const hashedPassword5 = await bcrypt.hash("Assistant123!", 10);
  const assistant = await prisma.user.create({
    data: {
      email: "assistant@consulting.fr",
      password: hashedPassword5,
      firstName: "Emma",
      lastName: "Petit",
      companyId: company2.id,
      role: UserRole.USER,
    },
  });

  // Assigner l'assistant à l'entité self
  await prisma.clientAssignment.create({
    data: {
      userId: assistant.id,
      clientId: selfEntity2.id,
      role: UserRole.USER,
    },
  });

  console.log(`✅ Assistant created and assigned: ${assistant.email}`);

  // ========================================
  // RÉSUMÉ
  // ========================================

  console.log("\n========================================");
  console.log("🎉 Database seeding completed!");
  console.log("========================================\n");

  console.log("📊 ENTREPRISE 1: FinExpert (PACK ENTREPRISE)");
  console.log("   - Admin Root: admin@finexpert.com / AdminRoot123!");
  console.log("   - Admin: marie.martin@finexpert.com / Admin123!");
  console.log("   - User 1: pierre.dubois@finexpert.com / User123!");
  console.log("   - User 2: sophie.bernard@finexpert.com / User123!");
  console.log("   - Clients: 4 (dont 1 self entity)");
  console.log("   - Fichiers: 3\n");

  console.log("📊 ENTREPRISE 2: Martin Consulting (PACK SIMPLE)");
  console.log("   - Admin Root: lucas.martin@consulting.fr / Martin123!");
  console.log("   - Assistant: assistant@consulting.fr / Assistant123!");
  console.log("   - Clients: 1 (self entity uniquement)\n");

  console.log("========================================");
  console.log("🔑 Utilisez ces identifiants pour tester!");
  console.log("========================================\n");

  // Afficher quelques statistiques
  const stats = await prisma.company.findMany({
    include: {
      _count: {
        select: {
          members: true,
          clients: true,
        },
      },
    },
  });

  stats.forEach((company) => {
    console.log(`${company.name}:`);
    console.log(`  - ${company._count.members} membres`);
    console.log(`  - ${company._count.clients} clients`);
  });
}

main()
  .catch((e) => {
    console.error("❌ Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
