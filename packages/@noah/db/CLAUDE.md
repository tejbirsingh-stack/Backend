# CLAUDE.md - Database Package

This package contains the Prisma schema and database utilities shared across the Noah platform.

## Overview
Centralized database models and migrations using Prisma ORM with PostgreSQL and TimescaleDB.

## Structure
```
prisma/
├── schema.prisma          # Database schema definition
├── migrations/           # Migration history
└── seed.ts              # Database seeding script

src/
├── index.ts             # Prisma client export
└── utils/               # Database utilities
```

## Schema Overview

### Core Models
- **User** - User accounts with auth details
- **Organization** - Multi-tenancy support
- **MediaAsset** - Media files and metadata
- **MediaCollection** - Folders/albums for organization
- **MediaVersion** - Version tracking for assets

### Auth Models
- **UserSession** - Active sessions with expiry
- **RefreshToken** - JWT refresh tokens
- **MfaSecret** - TOTP secrets for 2FA

### Features Models
- **ShareLink** - Shareable links with permissions
- **Comment** - Comments on media assets
- **Tag** - Tagging system
- **AuditLog** - Activity tracking (TimescaleDB hypertable)
- **AnalyticsEvent** - Usage analytics (TimescaleDB)

## Commands

### Development
```bash
# Generate Prisma Client
npm run db:generate

# Create migration
npm run db:migrate:dev

# Apply migrations
npm run db:migrate

# Push schema (without migration)
npm run db:push

# Open Prisma Studio
npm run db:studio

# Seed database
npm run db:seed
```

### Production
```bash
# Deploy migrations
npm run db:migrate:deploy

# Reset database (CAUTION!)
npm run db:reset
```

## Key Features

### UUID Primary Keys
All models use UUIDs for better distribution and security:
```prisma
id String @id @default(uuid())
```

### Soft Deletes
Media assets support soft deletion:
```prisma
deletedAt DateTime?
isDeleted Boolean @default(false)
```

### Timestamps
Automatic timestamps on all models:
```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

### Multi-tenancy
Organization-based isolation:
```prisma
organizationId String
organization Organization @relation(...)
```

## TimescaleDB Integration

### Hypertables
- `AuditLog` - Partitioned by time for efficient querying
- `AnalyticsEvent` - Time-series data for analytics

### Setup
```sql
-- Run after migrations
SELECT create_hypertable('audit_logs', 'timestamp');
SELECT create_hypertable('analytics_events', 'timestamp');
```

## Usage in Apps

### Import Client
```typescript
import { prisma } from '@noah/db';

// Use in API
const users = await prisma.user.findMany();
```

### Type Safety
```typescript
import type { User, MediaAsset } from '@noah/db';
```

## Environment Variables
Required in `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/noah_dev"
```

## Common Queries

### Find Media with Relations
```typescript
await prisma.mediaAsset.findMany({
  where: { organizationId, isDeleted: false },
  include: {
    tags: true,
    versions: true,
    collection: true
  }
})
```

### Session Management
```typescript
await prisma.userSession.create({
  data: {
    userId,
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
})
```

## Migrations

### Creating a Migration
```bash
npx prisma migrate dev --name add_new_field
```

### Migration Best Practices
- Always backup before production migrations
- Test migrations on staging first
- Use descriptive migration names
- Don't edit existing migrations

## Troubleshooting

### Connection Issues
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Check network/firewall settings

### Migration Failures
- Check for data conflicts
- Verify schema syntax
- Review migration SQL in `prisma/migrations/`

### Performance
- Add indexes for frequently queried fields
- Use `findFirst` instead of `findMany` when possible
- Implement pagination for large datasets