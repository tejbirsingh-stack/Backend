# Noah Platform - Organization-Based Media Management

## Organization Hierarchy

```
System
├── Platform Admin (super admin - manages all orgs)
└── Organizations
    └── Visit Detroit (Organization)
        ├── Organization Admin (manages org settings, users)
        ├── Team Members (regular users)
        └── Viewers (read-only access)
```

## Role Definitions

### 1. Platform Admin
- Full access to all organizations
- Manage system settings
- Create/delete organizations
- Monitor usage across all orgs
- Access all media for support/troubleshooting

### 2. Organization Admin
- Manage organization settings
- Add/remove users from organization
- Create shared folders
- Set organization-wide permissions
- View all media within organization
- Manage billing/subscription

### 3. Team Member
- Upload/edit/delete own media
- Access shared organization folders
- Create personal folders
- Share media within organization
- Annotate and comment on shared media

### 4. Viewer
- View shared media only
- Add comments (if permitted)
- Cannot upload or delete
- Cannot create folders

## Database Schema Updates

```prisma
// Updated schema for organization-based structure

model Organization {
  id              String   @id @default(uuid())
  name            String
  slug            String   @unique // e.g., "visit-detroit"
  domain          String?  // Custom domain if applicable
  
  // Billing
  subscriptionTier String  @default("free") // free, pro, enterprise
  storageLimit    BigInt   @default(10737418240) // 10GB default
  storageUsed     BigInt   @default(0)
  
  // Settings
  settings        Json     @default("{}")
  features        Json     @default("[]") // Enabled features
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  users           OrganizationUser[]
  folders         Folder[]
  mediaAssets     MediaAsset[]
  
  @@index([slug])
}

model OrganizationUser {
  id              String   @id @default(uuid())
  userId          String
  organizationId  String
  role            String   // 'admin' | 'member' | 'viewer'
  
  // Permissions override
  permissions     Json     @default("{}") // Custom permissions
  
  joinedAt        DateTime @default(now())
  lastActiveAt    DateTime @default(now())
  
  user            User     @relation(fields: [userId], references: [id])
  organization    Organization @relation(fields: [organizationId], references: [id])
  
  @@unique([userId, organizationId])
  @@index([organizationId, role])
}

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  name            String
  avatar          String?
  
  // System role
  isSystemAdmin   Boolean  @default(false)
  
  // Auth
  password        String
  emailVerified   Boolean  @default(false)
  mfaEnabled      Boolean  @default(false)
  mfaSecret       String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastLoginAt     DateTime?
  
  organizations   OrganizationUser[]
  ownedAssets     MediaAsset[] @relation("AssetOwner")
  annotations     Annotation[]
  sessions        UserSession[]
  
  @@index([email])
}

model Folder {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  path            String   // e.g., "/projects/2024/campaign"
  
  // Ownership
  ownerId         String?  // Null for org-wide folders
  isOrgFolder     Boolean  @default(false)
  
  // Sharing
  sharedWith      Json     @default("[]") // Array of user IDs
  permissions     Json     @default("{}") // {userId: ['read', 'write', 'delete']}
  
  parentId        String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  organization    Organization @relation(fields: [organizationId], references: [id])
  parent          Folder?  @relation("FolderHierarchy", fields: [parentId], references: [id])
  children        Folder[] @relation("FolderHierarchy")
  mediaAssets     MediaAsset[]
  
  @@unique([organizationId, path])
  @@index([organizationId, ownerId])
}

model MediaAsset {
  id              String   @id @default(uuid())
  organizationId  String
  folderId        String?
  uploadedById    String
  
  // File info
  fileName        String
  displayName     String
  mimeType        String
  size            BigInt
  
  // Storage
  storageProvider String   @default("b2") // 'b2' | 's3' | 'local'
  bucketName      String
  objectKey       String   // org-{orgId}/folder-{folderId}/{filename}
  thumbnailKey    String?
  
  // Sharing
  isOrgAsset      Boolean  @default(false) // Available to all org members
  sharedWith      Json     @default("[]") // Specific user IDs
  publicShareToken String? @unique
  publicShareExpiry DateTime?
  
  // Metadata
  metadata        Json     @default("{}")
  width           Int?
  height          Int?
  duration        Float?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  organization    Organization @relation(fields: [organizationId], references: [id])
  folder          Folder?  @relation(fields: [folderId], references: [id])
  uploadedBy      User     @relation("AssetOwner", fields: [uploadedById], references: [id])
  annotations     Annotation[]
  
  @@index([organizationId, folderId])
  @@index([publicShareToken])
}

model Annotation {
  id              String   @id @default(uuid())
  assetId         String
  userId          String
  
  timestamp       Float    // Video timestamp in seconds
  type            String   // 'comment' | 'drawing' | 'marker'
  content         Json     // Text or drawing data
  
  resolved        Boolean  @default(false)
  resolvedBy      String?
  resolvedAt      DateTime?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  asset           MediaAsset @relation(fields: [assetId], references: [id])
  user            User     @relation(fields: [userId], references: [id])
  
  @@index([assetId, timestamp])
}
```

## Test Data: Visit Detroit Organization

```typescript
// seed.ts - Test data setup

async function seedVisitDetroit() {
  // 1. Create Organization
  const visitDetroit = await prisma.organization.create({
    data: {
      name: 'Visit Detroit',
      slug: 'visit-detroit',
      subscriptionTier: 'pro',
      storageLimit: 107374182400, // 100GB
      settings: {
        brandColors: {
          primary: '#004B87',
          secondary: '#C8102E'
        },
        allowPublicSharing: true,
        requireMfa: false
      }
    }
  });

  // 2. Create Users
  const users = await Promise.all([
    // Platform Admin
    prisma.user.create({
      data: {
        email: 'admin@noah.app',
        name: 'Platform Admin',
        password: await hash('SystemAdmin123!'),
        isSystemAdmin: true,
        emailVerified: true
      }
    }),
    
    // Organization Admin
    prisma.user.create({
      data: {
        email: 'sarah@visitdetroit.com',
        name: 'Sarah Johnson',
        password: await hash('Detroit2024!'),
        emailVerified: true
      }
    }),
    
    // Team Members
    prisma.user.create({
      data: {
        email: 'mike@visitdetroit.com',
        name: 'Mike Chen',
        password: await hash('Detroit2024!'),
        emailVerified: true
      }
    }),
    
    prisma.user.create({
      data: {
        email: 'jessica@visitdetroit.com',
        name: 'Jessica Williams',
        password: await hash('Detroit2024!'),
        emailVerified: true
      }
    })
  ]);

  // 3. Add users to organization with roles
  await Promise.all([
    // Sarah - Org Admin
    prisma.organizationUser.create({
      data: {
        userId: users[1].id,
        organizationId: visitDetroit.id,
        role: 'admin',
        permissions: {
          canManageUsers: true,
          canManageBilling: true,
          canDeleteOrg: false
        }
      }
    }),
    
    // Mike - Team Member
    prisma.organizationUser.create({
      data: {
        userId: users[2].id,
        organizationId: visitDetroit.id,
        role: 'member',
        permissions: {
          canUpload: true,
          canShare: true,
          canDelete: true
        }
      }
    }),
    
    // Jessica - Team Member
    prisma.organizationUser.create({
      data: {
        userId: users[3].id,
        organizationId: visitDetroit.id,
        role: 'member',
        permissions: {
          canUpload: true,
          canShare: true,
          canDelete: true
        }
      }
    })
  ]);

  // 4. Create Folder Structure
  const folders = await Promise.all([
    // Organization-wide folders
    prisma.folder.create({
      data: {
        organizationId: visitDetroit.id,
        name: 'Marketing Campaigns',
        path: '/marketing-campaigns',
        isOrgFolder: true,
        permissions: {
          all: ['read'],
          admins: ['read', 'write', 'delete'],
          members: ['read', 'write']
        }
      }
    }),
    
    prisma.folder.create({
      data: {
        organizationId: visitDetroit.id,
        name: 'Event Coverage',
        path: '/event-coverage',
        isOrgFolder: true,
        permissions: {
          all: ['read'],
          admins: ['read', 'write', 'delete'],
          members: ['read', 'write']
        }
      }
    }),
    
    // Personal folders
    prisma.folder.create({
      data: {
        organizationId: visitDetroit.id,
        name: "Mike's Projects",
        path: '/personal/mike',
        ownerId: users[2].id,
        isOrgFolder: false,
        sharedWith: [users[3].id], // Shared with Jessica
        permissions: {
          [users[3].id]: ['read']
        }
      }
    })
  ]);

  console.log('✅ Visit Detroit organization seeded successfully');
  console.log('📧 Test accounts:');
  console.log('  - admin@noah.app (Platform Admin)');
  console.log('  - sarah@visitdetroit.com (Org Admin)');
  console.log('  - mike@visitdetroit.com (Team Member)');
  console.log('  - jessica@visitdetroit.com (Team Member)');
  console.log('🔐 Password for all: Detroit2024!');
}
```

## Cloud Storage Structure

```
b2-bucket/
└── org-visit-detroit/
    ├── shared/              # Organization-wide media
    │   ├── marketing-campaigns/
    │   │   ├── 2024-summer/
    │   │   └── 2024-fall/
    │   └── event-coverage/
    │       ├── auto-show-2024/
    │       └── jazz-festival/
    └── users/              # Personal folders
        ├── user-{mike-id}/
        │   └── projects/
        └── user-{jessica-id}/
            └── drafts/
```

## API Endpoints for Organization Management

```typescript
// Organization routes
GET    /api/organizations/:slug
GET    /api/organizations/:slug/users
POST   /api/organizations/:slug/users/invite
DELETE /api/organizations/:slug/users/:userId
PATCH  /api/organizations/:slug/users/:userId/role

// Folder management
GET    /api/organizations/:slug/folders
POST   /api/organizations/:slug/folders
PATCH  /api/folders/:folderId/permissions
POST   /api/folders/:folderId/share

// Media within organization
GET    /api/organizations/:slug/media
GET    /api/organizations/:slug/media/shared
GET    /api/organizations/:slug/media/recent
POST   /api/organizations/:slug/media/upload

// Inter-org sharing
POST   /api/media/:assetId/share
{
  shareWith: 'users' | 'organization' | 'public',
  userIds?: string[],
  expiresAt?: Date,
  permissions: ['view', 'comment', 'download']
}
```

## Access Control Logic

```typescript
// middleware/orgAccess.ts
async function checkOrgAccess(req, res, next) {
  const { slug } = req.params;
  const userId = req.user.id;
  
  // Platform Admin has access to everything
  if (req.user.isSystemAdmin) {
    req.role = 'system_admin';
    return next();
  }
  
  // Check user's role in organization
  const orgUser = await prisma.organizationUser.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: req.organization.id
      }
    }
  });
  
  if (!orgUser) {
    return res.status(403).json({ error: 'Not a member of this organization' });
  }
  
  req.role = orgUser.role;
  req.permissions = orgUser.permissions;
  next();
}

// Check media access within org
async function checkMediaAccess(req, res, next) {
  const { assetId } = req.params;
  const userId = req.user.id;
  
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      organizationId: req.organization.id,
      OR: [
        { uploadedById: userId },              // Owner
        { isOrgAsset: true },                  // Org-wide asset
        { sharedWith: { has: userId } },       // Explicitly shared
        { folder: { sharedWith: { has: userId } } } // In shared folder
      ]
    }
  });
  
  if (!asset && req.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  req.asset = asset;
  next();
}
```

## Frontend Organization Context

```typescript
// stores/organizationStore.ts
interface OrganizationStore {
  currentOrg: Organization | null;
  userRole: 'admin' | 'member' | 'viewer' | null;
  users: OrganizationUser[];
  
  // Actions
  switchOrganization: (slug: string) => Promise<void>;
  inviteUser: (email: string, role: string) => Promise<void>;
  updateUserRole: (userId: string, role: string) => Promise<void>;
  
  // Permissions
  canUpload: () => boolean;
  canShare: () => boolean;
  canManageUsers: () => boolean;
}

// components/OrgSwitcher.tsx
function OrgSwitcher() {
  const { organizations, currentOrg, switchOrg } = useOrgStore();
  
  return (
    <Select value={currentOrg?.slug} onValueChange={switchOrg}>
      {organizations.map(org => (
        <SelectItem key={org.id} value={org.slug}>
          {org.name}
        </SelectItem>
      ))}
    </Select>
  );
}
```

## Testing Scenarios

### 1. Organization Admin (Sarah)
- ✅ Can see all media in organization
- ✅ Can add/remove users
- ✅ Can create organization folders
- ✅ Can change user roles
- ✅ Can delete any media

### 2. Team Member (Mike)
- ✅ Can upload to shared folders
- ✅ Can create personal folders
- ✅ Can share with other team members
- ✅ Can only delete own media
- ❌ Cannot change org settings

### 3. Team Member (Jessica)
- ✅ Can view Mike's shared folder
- ✅ Can comment on shared media
- ❌ Cannot edit Mike's files
- ✅ Can upload to org folders

### 4. Cross-Organization Sharing
- Generate public link with expiration
- Share with specific external emails
- Track who accessed shared content

## Implementation Priority

1. **Phase 1**: Set up database schema and seed data
2. **Phase 2**: Implement organization middleware
3. **Phase 3**: Create folder structure and permissions
4. **Phase 4**: Build organization UI (switcher, user management)
5. **Phase 5**: Test sharing scenarios
6. **Phase 6**: Add analytics and usage tracking