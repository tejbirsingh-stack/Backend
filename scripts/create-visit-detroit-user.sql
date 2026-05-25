-- SQL script to create Visit Detroit organization and users
-- Run this directly against the Railway PostgreSQL database

-- Create Visit Detroit organization
INSERT INTO organizations (id, name, slug, "planType", "storageQuotaBytes", "maxUsers", features, "createdAt", "updatedAt") 
VALUES (
  gen_random_uuid(),
  'Visit Detroit',
  'visit-detroit',
  'enterprise',
  10995116277760, -- 10TB in bytes
  100,
  '{"backblazeStorage": true, "videoProcessing": true, "analytics": true, "customBranding": true}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (slug) DO NOTHING;

-- Get the organization ID for reference
-- (You'll need to get this ID to insert users)

-- Create admin user (password hash for 'VisitDetroit2024!')
-- Note: You'll need to generate proper argon2 hash for production
INSERT INTO users (id, "orgId", email, name, "passwordHash", role, status, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  o.id,
  'admin@visitdetroit.com',
  'Visit Detroit Admin',
  '$argon2id$v=19$m=65536,t=3,p=4$placeholder_replace_with_real_hash',
  'admin',
  'active',
  NOW(),
  NOW()
FROM organizations o 
WHERE o.slug = 'visit-detroit'
ON CONFLICT (email) DO NOTHING;

-- Create demo user (password: 'demo123')
INSERT INTO users (id, "orgId", email, name, "passwordHash", role, status, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  o.id,
  'demo@visitdetroit.com',
  'Demo User',
  '$argon2id$v=19$m=65536,t=3,p=4$placeholder_replace_with_real_hash',
  'user', 
  'active',
  NOW(),
  NOW()
FROM organizations o 
WHERE o.slug = 'visit-detroit'
ON CONFLICT (email) DO NOTHING;

-- Verify the inserts
SELECT 'Organizations created:' as info;
SELECT id, name, slug FROM organizations WHERE slug = 'visit-detroit';

SELECT 'Users created:' as info;
SELECT u.id, u.email, u.name, u.role, o.name as organization 
FROM users u 
JOIN organizations o ON u."orgId" = o.id 
WHERE o.slug = 'visit-detroit';