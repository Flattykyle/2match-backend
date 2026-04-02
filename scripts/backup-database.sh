#!/bin/bash

###############################################################################
# Database Backup Script
#
# This script creates a backup of the PostgreSQL database.
# Backups are stored in the backups/ directory with timestamps.
#
# Usage: ./scripts/backup-database.sh
###############################################################################

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  2-Match Database Backup Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL is not set${NC}"
    echo "Please set the DATABASE_URL environment variable"
    exit 1
fi

# Parse DATABASE_URL to extract connection details
# Format: postgresql://user:password@host:port/database

# Extract using regex
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    echo -e "${RED}Error: Could not parse DATABASE_URL${NC}"
    echo "Expected format: postgresql://user:password@host:port/database"
    exit 1
fi

# Create backups directory if it doesn't exist
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/2match_backup_$TIMESTAMP.sql"

echo -e "${YELLOW}Database details:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

echo -e "${YELLOW}Creating backup...${NC}"
echo "  File: $BACKUP_FILE"
echo ""

# Set password for pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Create the backup
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Backup failed${NC}"
    exit 1
fi

# Compress the backup
echo -e "${YELLOW}Compressing backup...${NC}"
gzip "$BACKUP_FILE"

COMPRESSED_FILE="$BACKUP_FILE.gz"

# Get file size
if [ -f "$COMPRESSED_FILE" ]; then
    FILE_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
    echo -e "${GREEN}✓${NC} Backup created successfully"
    echo "  File: $COMPRESSED_FILE"
    echo "  Size: $FILE_SIZE"
else
    echo -e "${RED}Error: Compressed backup file not found${NC}"
    exit 1
fi

echo ""

# Clean up old backups (keep last 7 days)
echo -e "${YELLOW}Cleaning up old backups (keeping last 7 days)...${NC}"
find "$BACKUP_DIR" -name "2match_backup_*.sql.gz" -type f -mtime +7 -delete

REMAINING_BACKUPS=$(ls -1 "$BACKUP_DIR"/2match_backup_*.sql.gz 2>/dev/null | wc -l)
echo -e "${GREEN}✓${NC} Cleanup complete. $REMAINING_BACKUPS backup(s) remaining"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Backup completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "To restore this backup, run:"
echo "  gunzip -c $COMPRESSED_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo ""

# Unset password
unset PGPASSWORD
