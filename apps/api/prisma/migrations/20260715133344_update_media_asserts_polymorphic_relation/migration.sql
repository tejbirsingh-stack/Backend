/*
  Warnings:

  - You are about to drop the column `workspaceId` on the `media_assets` table. All the data in the column will be lost.
  - Added the required column `ownerId` to the `media_assets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerType` to the `media_assets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."MediaAssetOwnerType" AS ENUM ('WORKSPACE');

-- DropForeignKey
ALTER TABLE "public"."media_assets" DROP CONSTRAINT "media_assets_workspaceId_fkey";

-- AlterTable
ALTER TABLE "public"."media_assets" DROP COLUMN "workspaceId",
ADD COLUMN     "ownerId" UUID NOT NULL,
ADD COLUMN     "ownerType" "public"."MediaAssetOwnerType" NOT NULL;
