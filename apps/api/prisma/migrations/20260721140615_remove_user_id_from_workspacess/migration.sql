/*
  Warnings:

  - Added the required column `name` to the `workspaces` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."workspaces" ADD COLUMN     "color" VARCHAR(50),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT NOT NULL;
