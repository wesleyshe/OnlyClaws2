#!/bin/sh
set -e

# Push Prisma schema to database (creates tables if needed)
npx prisma db push --skip-generate

# Start the Next.js server
exec npx next start
