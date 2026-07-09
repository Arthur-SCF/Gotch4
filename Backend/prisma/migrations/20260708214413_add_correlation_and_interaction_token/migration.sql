-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "correlationToken" TEXT,
ADD COLUMN     "dnsAnswer" TEXT,
ADD COLUMN     "dnsRebindStrategy" TEXT;

-- CreateTable
CREATE TABLE "InteractionToken" (
    "token" TEXT NOT NULL,
    "programId" INTEGER,
    "strategy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "InteractionToken_programId_idx" ON "InteractionToken"("programId");

-- CreateIndex
CREATE INDEX "Event_correlationToken_idx" ON "Event"("correlationToken");

-- AddForeignKey
ALTER TABLE "InteractionToken" ADD CONSTRAINT "InteractionToken_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
