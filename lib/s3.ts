import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const FOLDERS = [
  "PLAN DES TIERS",
  "CODE JOURNAL",
  "GRAND LIVRES COMPTE",
  "GRAND LIVRES TIERS",
  "PLAN DES COMPTES",
];

export async function createClientFoldersInS3(companyName: string) {
  const folderPrefix = companyName.toLowerCase().replace(/\s+/g, "_");

  const uploadPromises = FOLDERS.map(async (folder) => {
    const key = `${folderPrefix}/${folder}/.keep`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: key,
      Body: Buffer.from(""), // ← Utilise Buffer au lieu de ""
      ContentType: "text/plain",
    });

    try {
      await s3Client.send(command);
      console.log(`✅ Dossier créé: ${key}`);
    } catch (error) {
      console.error(`❌ Erreur création ${key}:`, error);
      throw error;
    }
  });

  await Promise.all(uploadPromises);
  console.log(`✅ Tous les dossiers créés pour: ${folderPrefix}`);
}