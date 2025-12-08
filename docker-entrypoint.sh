#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Pushing database schema..."
npx prisma db push --skip-generate

echo "Starting application..."
exec node server.js