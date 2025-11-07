# Guide de Déploiement Next.js sur VPS Hostinger avec Coolify

## 📋 Vue d'ensemble

- **Domaine**: envolperformance.com
- **VPS**: Hostinger
- **Plateforme de déploiement**: Coolify
- **Application**: Next.js (GitHub public)
- **Base de données**: PostgreSQL (via Coolify)

---

## 🚀 Étape 1 : Installation de Coolify sur le VPS

### 1.1 Connexion au VPS

```bash
ssh root@VOTRE_IP_VPS
```

### 1.2 Mise à jour du système

```bash
apt update && apt upgrade -y
```

### 1.3 Installation de Coolify

Coolify nécessite Docker. Exécutez la commande d'installation officielle :

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Cette commande va :

- Installer Docker et Docker Compose
- Installer Coolify
- Configurer les services nécessaires

⏱️ **Temps d'installation** : 5-10 minutes

### 1.4 Vérification de l'installation

Après l'installation, Coolify sera accessible sur :

```
http://VOTRE_IP_VPS:8000
```

**Note importante** : Changez le port 8000 par défaut si nécessaire dans la configuration.

---

## 🔐 Étape 2 : Configuration initiale de Coolify

### 2.1 Premier accès

1. Ouvrez votre navigateur : `http://VOTRE_IP_VPS:8000`
2. Créez votre compte administrateur
3. Définissez un email et un mot de passe sécurisé

### 2.2 Configuration du serveur

1. Dans Coolify, allez dans **Servers**
2. Votre serveur local devrait être détecté automatiquement
3. Vérifiez que le statut est "Connected"

---

## 🌐 Étape 3 : Configuration DNS

### 3.1 Configuration du domaine principal

Dans votre panneau DNS (chez Hostinger ou votre registrar) :

**Enregistrement A** :

```
Type: A
Nom: @
Valeur: VOTRE_IP_VPS
TTL: 3600
```

**Enregistrement A pour www** :

```
Type: A
Nom: www
Valeur: VOTRE_IP_VPS
TTL: 3600
```

### 3.2 Si vous voulez utiliser un sous-domaine (optionnel)

Par exemple : `app.envolperformance.com`

```
Type: A
Nom: app
Valeur: VOTRE_IP_VPS
TTL: 3600
```

⏱️ **Propagation DNS** : 5 minutes à 48 heures (généralement 15-30 minutes)

---

## 🗄️ Étape 4 : Création de la base de données PostgreSQL

### 4.1 Dans Coolify

1. Allez dans **Databases**
2. Cliquez sur **+ Add Database**
3. Sélectionnez **PostgreSQL**

### 4.2 Configuration PostgreSQL

```yaml
Name: nextjs-postgres
PostgreSQL Version: 16 (ou la dernière stable)
Database Name: nextjs_db
Database User: nextjs_user
Database Password: [Généré automatiquement ou personnalisé]
Port: 5432
```

### 4.3 Notez les informations de connexion

Coolify va générer une URL de connexion du type :

```
postgresql://nextjs_user:PASSWORD@localhost:5432/nextjs_db
```

**⚠️ IMPORTANT** : Sauvegardez ces informations, vous en aurez besoin pour les variables d'environnement.

---

## 📦 Étape 5 : Préparation du projet Next.js

### 5.1 Configuration du projet pour le déploiement

Assurez-vous que votre `package.json` contient :

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### 5.2 Configuration Next.js (next.config.js)

Pour un déploiement optimal, ajoutez ceci si ce n'est pas déjà fait :

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Recommandé pour Docker
  // Vos autres configurations...
};

module.exports = nextConfig;
```

### 5.3 Créer un Dockerfile (optionnel mais recommandé)

À la racine de votre projet, créez `Dockerfile` :

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 5.4 Créer un .dockerignore

```
node_modules
.next
.git
.env
.env.local
```

---

## 🚢 Étape 6 : Déploiement de l'application Next.js

### 6.1 Ajouter le projet dans Coolify

1. Dans Coolify, allez dans **Projects**
2. Cliquez sur **+ New Project**
3. Donnez un nom : `nextjs-app`

### 6.2 Ajouter une nouvelle ressource

1. Dans votre projet, cliquez sur **+ New Resource**
2. Sélectionnez **Public Repository**
3. Collez l'URL de votre repo GitHub

### 6.3 Configuration du déploiement

**Build Configuration** :

```yaml
Branch: main (ou votre branche principale)
Build Pack: Dockerfile (si vous avez créé le Dockerfile)
Port: 3000
```

**Si vous n'utilisez pas de Dockerfile** :

```yaml
Build Pack: nixpacks
Build Command: npm install && npm run build
Start Command: npm start
Port: 3000
```

### 6.4 Configuration du domaine

Dans les paramètres de votre application :

1. Allez dans **Domains**
2. Ajoutez votre domaine : `envolperformance.com`
3. Activez **Generate SSL Certificate** (Let's Encrypt automatique)

---

## 🔑 Étape 7 : Configuration des variables d'environnement

### 7.1 Dans Coolify

1. Allez dans votre application
2. Cliquez sur **Environment Variables**
3. Ajoutez vos variables :

```bash
# URL de base
BASE_URL=https://envolperformance.com

# NextAuth (si utilisé)
NEXTAUTH_SECRET=votre_secret_genere_ici
NEXTAUTH_URL=https://envolperformance.com

# Base de données PostgreSQL
DATABASE_URL=postgresql://nextjs_user:PASSWORD@nextjs-postgres:5432/nextjs_db

# AWS (si utilisé)
AWS_REGION=votre_region
AWS_ACCESS_KEY_ID=votre_access_key
AWS_SECRET_ACCESS_KEY=votre_secret_key
AWS_S3_BUCKET_NAME=votre_bucket

# Node Environment
NODE_ENV=production
```

### 7.2 Générer un NEXTAUTH_SECRET

Si vous utilisez NextAuth, générez un secret sécurisé :

```bash
openssl rand -base64 32
```

---

## 🎯 Étape 8 : Déploiement final

### 8.1 Lancer le déploiement

1. Dans Coolify, retournez à votre application
2. Cliquez sur **Deploy**
3. Surveillez les logs de build

### 8.2 Vérification

Une fois le déploiement terminé :

- ✅ Vérifiez que le build s'est bien passé (pas d'erreurs rouges)
- ✅ Vérifiez que l'application est accessible sur votre domaine
- ✅ Testez la connexion à la base de données

---

## 🔧 Étape 9 : Configuration post-déploiement

### 9.1 Activer les redéploiements automatiques

Dans Coolify :

1. Allez dans **Webhooks**
2. Copiez l'URL du webhook
3. Dans GitHub, allez dans **Settings > Webhooks**
4. Ajoutez le webhook Coolify
5. Sélectionnez l'événement "Push"

Maintenant, chaque push sur votre branche principale redéploiera automatiquement !

### 9.2 Configuration du monitoring

1. Dans Coolify, activez les **Metrics**
2. Configurez les **Health Checks** :
   - Path: `/` ou `/api/health`
   - Interval: 30s

### 9.3 Backups automatiques

Pour PostgreSQL :

1. Allez dans votre base de données Coolify
2. Activez **Automatic Backups**
3. Configurez la fréquence (quotidien recommandé)

---

## 📊 Commandes utiles

### Vérifier les logs de l'application

Dans Coolify, cliquez sur **Logs** dans votre application.

### Se connecter au container

```bash
# Sur le VPS
docker ps  # Trouver l'ID du container
docker exec -it CONTAINER_ID sh
```

### Vérifier la base de données

```bash
# Dans Coolify, ouvrez un terminal pour PostgreSQL
psql -U nextjs_user -d nextjs_db
```

### Redémarrer l'application

Dans Coolify : **Actions > Restart**

---

## 🐛 Dépannage courant

### Problème : Application ne démarre pas

1. Vérifiez les logs dans Coolify
2. Vérifiez que toutes les variables d'environnement sont définies
3. Vérifiez que la base de données est accessible

### Problème : Erreur SSL/HTTPS

1. Vérifiez que le DNS pointe bien vers votre VPS
2. Attendez quelques minutes pour la génération du certificat
3. Vérifiez les logs de Traefik dans Coolify

### Problème : Base de données inaccessible

1. Vérifiez que PostgreSQL est en cours d'exécution
2. Vérifiez le `DATABASE_URL` dans les variables d'environnement
3. Utilisez le nom du service Docker (ex: `nextjs-postgres`) au lieu de `localhost`

### Problème : Build échoue

1. Testez le build en local : `npm run build`
2. Vérifiez les dépendances dans `package.json`
3. Vérifiez les logs de build dans Coolify

---

## 📚 Ressources supplémentaires

- Documentation Coolify : https://coolify.io/docs
- Documentation Next.js : https://nextjs.org/docs
- Documentation PostgreSQL : https://www.postgresql.org/docs/

---

## ✅ Checklist finale

Avant de considérer le déploiement terminé :

- [ ] Coolify installé et accessible
- [ ] Base de données PostgreSQL créée et fonctionnelle
- [ ] DNS configuré et propagé
- [ ] Application déployée et accessible
- [ ] Certificat SSL actif (HTTPS)
- [ ] Variables d'environnement configurées
- [ ] Webhook GitHub configuré pour auto-déploiement
- [ ] Backups automatiques activés
- [ ] Application testée en production

---

## 🎉 Félicitations !

Votre application Next.js est maintenant déployée sur votre VPS Hostinger avec Coolify !

**Prochaines étapes recommandées** :

1. Configurez un monitoring (Uptime Robot, etc.)
2. Configurez des alertes email
3. Testez le processus de déploiement automatique
4. Documentez votre configuration spécifique

---

**Besoin d'aide ?** N'hésite pas à me poser des questions si tu rencontres des problèmes ! 🚀
