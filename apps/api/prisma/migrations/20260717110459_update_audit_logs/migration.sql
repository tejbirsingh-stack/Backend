-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "planType" VARCHAR(50) NOT NULL,
    "storageQuotaBytes" BIGINT NOT NULL DEFAULT 1099511627776,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "features" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(255),
    "passwordHash" VARCHAR(255),
    "phone" VARCHAR(50),
    "hubspotUtk" VARCHAR(255),
    "roleId" UUID,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "mfaSecret" VARCHAR(255),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailOTP" VARCHAR(10),
    "emailOtpExpiresAt" TIMESTAMPTZ(6),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMPTZ(6),
    "lastLoginAt" TIMESTAMPTZ(6),
    "lastActiveAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobTitle" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "ipAddress" VARCHAR(50),
    "userAgent" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "lastActiveAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "rules" JSONB,
    "thumbnailAssetId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."collection_assets" (
    "collectionId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedById" UUID,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_assets_pkey" PRIMARY KEY ("collectionId","assetId")
);

-- CreateTable
CREATE TABLE "public"."asset_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "changeDescription" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7),
    "category" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."asset_tags" (
    "assetId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "addedById" UUID,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_tags_pkey" PRIMARY KEY ("assetId","tagId")
);

-- CreateTable
CREATE TABLE "public"."share_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "assetId" UUID,
    "collectionId" UUID,
    "token" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255),
    "expiresAt" TIMESTAMPTZ(6),
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "permissions" JSONB NOT NULL DEFAULT '{"view": true, "download": false}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMPTZ(6),

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "userId" UUID,
    "eventType" VARCHAR(100) NOT NULL,
    "assetId" UUID,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "public"."annotations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "videoTimestamp" DECIMAL(10,3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "show" INTEGER,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "aiTags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "uploadedByUserId" UUID,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."asset_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "fileClass" VARCHAR(50) NOT NULL,
    "fileName" VARCHAR(500) NOT NULL,
    "filePath" VARCHAR(1000) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "cdnUrl" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."asset_metadata" (
    "assetId" UUID NOT NULL,
    "technicalSpecs" JSONB NOT NULL DEFAULT '{}',
    "customProperties" JSONB NOT NULL DEFAULT '{}',
    "checksum" VARCHAR(64),

    CONSTRAINT "asset_metadata_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "public"."transcode_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "jobId" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'queued',
    "providerMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcode_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."video_frame_hashes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "hashValue" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_frame_hashes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activityName" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "activityType" VARCHAR(100),
    "actorType" VARCHAR(20) NOT NULL DEFAULT 'user',
    "userName" VARCHAR(255),
    "userEmail" VARCHAR(255),
    "userRole" VARCHAR(50),
    "error" TEXT,
    "userId" UUID,
    "orgId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_orgId_email_key" ON "public"."users"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "public"."password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "public"."password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "public"."email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "public"."email_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_key" ON "public"."user_sessions"("token");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "public"."user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_token_idx" ON "public"."user_sessions"("token");

-- CreateIndex
CREATE INDEX "collections_orgId_idx" ON "public"."collections"("orgId");

-- CreateIndex
CREATE INDEX "collection_assets_assetId_idx" ON "public"."collection_assets"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_versions_assetId_versionNumber_key" ON "public"."asset_versions"("assetId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tags_orgId_name_key" ON "public"."tags"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "public"."share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_orgId_idx" ON "public"."share_links"("orgId");

-- CreateIndex
CREATE INDEX "analytics_events_orgId_createdAt_idx" ON "public"."analytics_events"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "annotations_orgId_idx" ON "public"."annotations"("orgId");

-- CreateIndex
CREATE INDEX "annotations_assetId_idx" ON "public"."annotations"("assetId");

-- CreateIndex
CREATE INDEX "annotations_userId_idx" ON "public"."annotations"("userId");

-- CreateIndex
CREATE INDEX "annotations_type_idx" ON "public"."annotations"("type");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name");

-- CreateIndex
CREATE INDEX "assets_orgId_idx" ON "public"."assets"("orgId");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "public"."assets"("status");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "public"."assets"("type");

-- CreateIndex
CREATE INDEX "asset_files_assetId_idx" ON "public"."asset_files"("assetId");

-- CreateIndex
CREATE INDEX "asset_files_fileClass_idx" ON "public"."asset_files"("fileClass");

-- CreateIndex
CREATE UNIQUE INDEX "transcode_jobs_jobId_key" ON "public"."transcode_jobs"("jobId");

-- CreateIndex
CREATE INDEX "transcode_jobs_assetId_idx" ON "public"."transcode_jobs"("assetId");

-- CreateIndex
CREATE INDEX "transcode_jobs_status_idx" ON "public"."transcode_jobs"("status");

-- CreateIndex
CREATE INDEX "video_frame_hashes_assetId_idx" ON "public"."video_frame_hashes"("assetId");

-- CreateIndex
CREATE INDEX "user_activities_orgId_idx" ON "public"."user_activities"("orgId");

-- CreateIndex
CREATE INDEX "user_activities_userId_idx" ON "public"."user_activities"("userId");

-- CreateIndex
CREATE INDEX "user_activities_actorType_idx" ON "public"."user_activities"("actorType");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collections" ADD CONSTRAINT "collections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collections" ADD CONSTRAINT "collections_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collections" ADD CONSTRAINT "collections_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "public"."assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collections" ADD CONSTRAINT "collections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collection_assets" ADD CONSTRAINT "collection_assets_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collection_assets" ADD CONSTRAINT "collection_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collection_assets" ADD CONSTRAINT "collection_assets_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_versions" ADD CONSTRAINT "asset_versions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_versions" ADD CONSTRAINT "asset_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tags" ADD CONSTRAINT "tags_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_tags" ADD CONSTRAINT "asset_tags_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_tags" ADD CONSTRAINT "asset_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_tags" ADD CONSTRAINT "asset_tags_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_links" ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotations" ADD CONSTRAINT "annotations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotations" ADD CONSTRAINT "annotations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotations" ADD CONSTRAINT "annotations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_files" ADD CONSTRAINT "asset_files_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_metadata" ADD CONSTRAINT "asset_metadata_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transcode_jobs" ADD CONSTRAINT "transcode_jobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."video_frame_hashes" ADD CONSTRAINT "video_frame_hashes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_activities" ADD CONSTRAINT "user_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_activities" ADD CONSTRAINT "user_activities_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
