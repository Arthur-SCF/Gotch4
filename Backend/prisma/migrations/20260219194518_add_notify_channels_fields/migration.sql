-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "emailSmtpHost" TEXT,
ADD COLUMN     "emailSmtpPass" TEXT,
ADD COLUMN     "emailSmtpPort" INTEGER DEFAULT 587,
ADD COLUMN     "emailSmtpUser" TEXT,
ADD COLUMN     "emailTo" TEXT,
ADD COLUMN     "notifyFieldConfig" TEXT,
ADD COLUMN     "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slackWebhookUrl" TEXT;
