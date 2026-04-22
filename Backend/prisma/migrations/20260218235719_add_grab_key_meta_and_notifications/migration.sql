-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discordWebhookUrl" TEXT,
ADD COLUMN     "notifyOnAllEvents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GrabKeyMeta" (
    "key" TEXT NOT NULL,
    "programId" INTEGER,

    CONSTRAINT "GrabKeyMeta_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "GrabKeyMeta_programId_idx" ON "GrabKeyMeta"("programId");

-- AddForeignKey
ALTER TABLE "GrabKeyMeta" ADD CONSTRAINT "GrabKeyMeta_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
