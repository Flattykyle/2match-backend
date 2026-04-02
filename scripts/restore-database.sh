#!/bin/bash

###############################################################################
# Database Restore Script
#
# This script restores a PostgreSQL database from a backup file.
#
# Usage: ./scripts/restore-database.sh <backup_file.sql.gz>
###############################################################################

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  2-Match Database Restore Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: No backup file specified${NC}"
    echo "Usage: ./scripts/restore-database.sh <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -1 ./backups/2match_backup_*.sql.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL is not set${NC}"
    echo "Please set the DATABASE_URL environment variable"
    exit 1
fi

# Parse DATABASE_URL
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo -e "${RED}Error: Could not parse DATABASE_URL${NC}"
    exit 1
fi

echo -e "${YELLOW}Database details:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

echo -e "${YELLOW}Backup file:${NC} $BACKUP_FILE"
echo ""

# Confirm restore
echo -e "${RED}WARNING: This will overwrite the current database!${NC}"
read -p "Are you sure you want to restore? (yes/NO): " -r
echo

if [ "$REPLY" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled${NC}"
    exit 0
fi

# Create a backup of current database before restoring
echo -e "${YELLOW}Creating backup of current database before restore...${NC}"
./scripts/backup-database.sh

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Could not create backup. Restore aborted.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Restoring database from backup...${NC}"

# Set password for psql
export PGPASSWORD="$DB_PASSWORD"

# Restore the backup
gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Restore failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓${NC} Database restored successfully"

# Run Prisma generate to update client
echo ""
echo -e "${YELLOW}Updating Prisma Client...${NC}"
npx prisma generate

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Restore completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Unset password
unset PGPASSWORD
