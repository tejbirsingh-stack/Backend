-- AlterEnum
ALTER TYPE "public"."MediaAssetOwnerType" ADD VALUE 'FOLDER';

-- CreateTable
CREATE TABLE "public"."folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_ownerType_ownerId_idx" ON "public"."folders"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "public"."folders"("parentId");

-- AddForeignKey
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
