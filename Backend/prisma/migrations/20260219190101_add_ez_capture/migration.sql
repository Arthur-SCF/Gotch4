-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "ezCollectCookies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ezCollectDom" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ezCollectLocalStorage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ezCollectScreenshot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ezCollectSessionStorage" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EzCapture" (
    "id" SERIAL NOT NULL,
    "uri" TEXT,
    "origin" TEXT,
    "referer" TEXT,
    "userAgent" TEXT,
    "cookies" TEXT,
    "localStorage" TEXT,
    "sessionStorage" TEXT,
    "dom" TEXT,
    "screenshotPath" TEXT,
    "extra" TEXT,
    "ipAddress" TEXT,
    "programId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EzCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EzCapture_createdAt_idx" ON "EzCapture"("createdAt");

-- CreateIndex
CREATE INDEX "EzCapture_origin_idx" ON "EzCapture"("origin");

-- CreateIndex
CREATE INDEX "EzCapture_programId_idx" ON "EzCapture"("programId");

-- AddForeignKey
ALTER TABLE "EzCapture" ADD CONSTRAINT "EzCapture_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
