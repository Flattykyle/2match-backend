#!/bin/bash

###############################################################################
# Production Database Migration Script
#
# This script safely migrates the production database using Prisma.
# It includes safety checks and backup creation before migration.
#
# Usage: ./scripts/migrate-production.sh
###############################################################################

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  2-Match Production Migration Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if we're in production
if [ "$NODE_ENV" != "production" ]; then
    echo -e "${YELLOW}Warning: NODE_ENV is not set to 'production'${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Migration cancelled${NC}"
        exit 1
    fi
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL is not set${NC}"
    echo "Please set the DATABASE_URL environment variable"
    exit 1
fi

echo -e "${GREEN}✓${NC} Environment checks passed"
echo ""

# Create backup before migration
echo -e "${YELLOW}Creating database backup...${NC}"
./scripts/backup-database.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Backup failed. Migration aborted.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Backup created successfully"
echo ""

# Generate Prisma Client
echo -e "${YELLOW}Generating Prisma Client...${NC}"
npx prisma generate

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to generate Prisma Client${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prisma Client generated"
echo ""

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
echo ""

npx prisma migrate deploy

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Migration failed${NC}"
    echo -e "${YELLOW}Please check the error above and restore from backup if necessary${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓${NC} Migrations completed successfully"
echo ""

# Verify database connection
echo -e "${YELLOW}Verifying database connection...${NC}"
npx prisma db pull --force

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Warning: Could not verify database connection${NC}"
else
    echo -e "${GREEN}✓${NC} Database connection verified"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Migration completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Verify the application is working correctly"
echo "2. Monitor error logs for any issues"
echo "3. Keep the backup in case you need to rollback"
echo ""
