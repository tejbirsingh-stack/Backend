/*
  Warnings:

  - You are about to alter the column `title` on the `assets` table. The data in that column could be lost. The data in that column will be cast from `VarChar(500)` to `VarChar(255)`.
  - You are about to alter the column `name` on the `folders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `name` on the `organizations` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(100)`.
  - You are about to alter the column `name` on the `projects` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `name` on the `tags` table. The data in that column could be lost. The data in that column will be cast from `VarChar(100)` to `VarChar(50)`.
  - You are about to alter the column `name` on the `users` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(100)`.
  - You are about to alter the column `jobTitle` on the `users` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(100)`.
  - You are about to alter the column `description` on the `workspaces` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `name` on the `workspaces` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.

*/
-- DropIndex
DROP INDEX "public"."tags_orgId_name_key";

-- AlterTable
ALTER TABLE "public"."annotations" ADD COLUMN     "guestEmail" VARCHAR(255),
ADD COLUMN     "guestName" VARCHAR(100),
ADD COLUMN     "shareLinkToken" VARCHAR(255),
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."asset_users" ADD COLUMN     "access_level" VARCHAR(50) NOT NULL DEFAULT 'Full Access';

-- AlterTable
ALTER TABLE "public"."assets" ADD COLUMN     "compressedKey" VARCHAR(1000),
ADD COLUMN     "deletionReason" VARCHAR(500),
ALTER COLUMN "title" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "public"."folders" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "public"."organizations" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "public"."projects" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "public"."share_links" ADD COLUMN     "mode" VARCHAR(50) NOT NULL DEFAULT 'link',
ADD COLUMN     "name" VARCHAR(100),
ADD COLUMN     "revokedAt" TIMESTAMPTZ(6),
ADD COLUMN     "visibility" VARCHAR(50) NOT NULL DEFAULT 'public',
ALTER COLUMN "permissions" SET DEFAULT '{"view": true, "comment": false, "download": false, "downloadProxy": false}';

-- AlterTable
ALTER TABLE "public"."tags" ALTER COLUMN "name" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "avatarKey" VARCHAR(1000),
ADD COLUMN     "avatarUrl" VARCHAR(1000),
ADD COLUMN     "timezone" VARCHAR(100),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "jobTitle" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "public"."workspaces" ALTER COLUMN "description" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100);

-- CreateTable
CREATE TABLE "public"."asset_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "access_level" VARCHAR(50) NOT NULL DEFAULT 'Full Access',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."share_link_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shareLinkId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "share_link_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."annotation_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mediaId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."annotation_group_members" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_group_members_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "public"."user_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_group_members" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "public"."favorites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" TEXT,
    "assetId" UUID,
    "folderId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_groups_asset_id_idx" ON "public"."asset_groups"("asset_id");

-- CreateIndex
CREATE INDEX "asset_groups_group_id_idx" ON "public"."asset_groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_groups_asset_id_group_id_key" ON "public"."asset_groups"("asset_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_recipients_token_key" ON "public"."share_link_recipients"("token");

-- CreateIndex
CREATE INDEX "share_link_recipients_shareLinkId_idx" ON "public"."share_link_recipients"("shareLinkId");

-- CreateIndex
CREATE INDEX "annotation_groups_orgId_idx" ON "public"."annotation_groups"("orgId");

-- CreateIndex
CREATE INDEX "annotation_groups_workspaceId_idx" ON "public"."annotation_groups"("workspaceId");

-- CreateIndex
CREATE INDEX "annotation_groups_mediaId_idx" ON "public"."annotation_groups"("mediaId");

-- CreateIndex
CREATE INDEX "annotation_group_members_userId_idx" ON "public"."annotation_group_members"("userId");

-- CreateIndex
CREATE INDEX "user_groups_orgId_idx" ON "public"."user_groups"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "user_groups_orgId_name_key" ON "public"."user_groups"("orgId", "name");

-- CreateIndex
CREATE INDEX "user_group_members_userId_idx" ON "public"."user_group_members"("userId");

-- CreateIndex
CREATE INDEX "favorites_userId_idx" ON "public"."favorites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_assetId_key" ON "public"."favorites"("userId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_folderId_key" ON "public"."favorites"("userId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_projectId_key" ON "public"."favorites"("userId", "projectId");

-- CreateIndex
CREATE INDEX "assets_compressedKey_idx" ON "public"."assets"("compressedKey");

-- CreateIndex
CREATE INDEX "tags_orgId_idx" ON "public"."tags"("orgId");

-- AddForeignKey
ALTER TABLE "public"."asset_groups" ADD CONSTRAINT "asset_groups_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_groups" ADD CONSTRAINT "asset_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."share_link_recipients" ADD CONSTRAINT "share_link_recipients_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "public"."share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotation_groups" ADD CONSTRAINT "annotation_groups_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotation_groups" ADD CONSTRAINT "annotation_groups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotation_groups" ADD CONSTRAINT "annotation_groups_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotation_group_members" ADD CONSTRAINT "annotation_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."annotation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."annotation_group_members" ADD CONSTRAINT "annotation_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_groups" ADD CONSTRAINT "user_groups_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_groups" ADD CONSTRAINT "user_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_group_members" ADD CONSTRAINT "user_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_group_members" ADD CONSTRAINT "user_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."unique_tag_name_per_parent" RENAME TO "tags_orgId_parent_id_name_key";
