/*
  Warnings:

  - You are about to drop the `user_activities` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."user_activities" DROP CONSTRAINT "user_activities_orgId_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_activities" DROP CONSTRAINT "user_activities_userId_fkey";

-- DropTable
DROP TABLE "public"."user_activities";

-- CreateTable
CREATE TABLE "public"."audit_logs" (
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

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_orgId_idx" ON "public"."audit_logs"("orgId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_idx" ON "public"."audit_logs"("actorType");

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
