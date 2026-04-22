-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "dnsQuery" TEXT,
ADD COLUMN     "dnsType" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'http',
ALTER COLUMN "method" DROP NOT NULL,
ALTER COLUMN "path" DROP NOT NULL,
ALTER COLUMN "fullUrl" DROP NOT NULL,
ALTER COLUMN "headers" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "dnsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dnsMode" TEXT NOT NULL DEFAULT 'local',
    "dnsBaseDomain" TEXT,
    "dnsTtl" INTEGER NOT NULL DEFAULT 0,
    "dnsResponseIp" TEXT,
    "dnsVpsUrl" TEXT,
    "dnsWebhookUrl" TEXT,
    "dnsAuthToken" TEXT,
    "webhookUrl" TEXT NOT NULL DEFAULT 'http://localhost:3000/webhook',
    "webhookDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_dnsQuery_idx" ON "Event"("dnsQuery");
