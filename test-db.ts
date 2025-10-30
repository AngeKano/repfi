import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    const companies = await prisma.company.findMany();
    console.log('✅ Connexion réussie!');
    console.log(`Nombre d'entreprises : ${companies.length}`);
    companies.forEach(c => console.log(`  - ${c.name} (${c.packType})`));
  } catch (error) {
    console.error('❌ Erreur de connexion:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();