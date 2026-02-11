-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "network" TEXT NOT NULL DEFAULT 'tcp',
ADD COLUMN     "port" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "security" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "sni" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "restrictions" JSONB;

-- CreateTable
CREATE TABLE "AdminSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultMaxConfigs" INTEGER NOT NULL DEFAULT 5,
    "defaultMaxGB" INTEGER NOT NULL DEFAULT 100,
    "defaultRestrictions" JSONB,
    "backupPanelUrl" TEXT,
    "backupPanelUser" TEXT,
    "backupPanelPass" TEXT,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);
