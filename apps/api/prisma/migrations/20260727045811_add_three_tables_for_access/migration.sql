-- CreateTable
CREATE TABLE "public"."workspace_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."folder_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "folder_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."asset_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_timezones" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "type" TEXT NOT NULL DEFAULT 'workspace',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_timezones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_users_workspace_id_idx" ON "public"."workspace_users"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_users_user_id_idx" ON "public"."workspace_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_workspace_id_user_id_key" ON "public"."workspace_users"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "folder_users_folder_id_idx" ON "public"."folder_users"("folder_id");

-- CreateIndex
CREATE INDEX "folder_users_user_id_idx" ON "public"."folder_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "folder_users_folder_id_user_id_key" ON "public"."folder_users"("folder_id", "user_id");

-- CreateIndex
CREATE INDEX "asset_users_asset_id_idx" ON "public"."asset_users"("asset_id");

-- CreateIndex
CREATE INDEX "asset_users_user_id_idx" ON "public"."asset_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_users_asset_id_user_id_key" ON "public"."asset_users"("asset_id", "user_id");

-- CreateIndex
CREATE INDEX "project_users_project_id_idx" ON "public"."project_users"("project_id");

-- CreateIndex
CREATE INDEX "project_users_user_id_idx" ON "public"."project_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_users_project_id_user_id_key" ON "public"."project_users"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."workspace_users" ADD CONSTRAINT "workspace_users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workspace_users" ADD CONSTRAINT "workspace_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_users" ADD CONSTRAINT "folder_users_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_users" ADD CONSTRAINT "folder_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_users" ADD CONSTRAINT "asset_users_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."asset_users" ADD CONSTRAINT "asset_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
