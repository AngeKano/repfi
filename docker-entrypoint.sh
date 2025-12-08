#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy

echo "Starting application..."
exec node server.js