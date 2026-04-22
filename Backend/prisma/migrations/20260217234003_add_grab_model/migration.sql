-- CreateTable
CREATE TABLE "Grab" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "headers" TEXT NOT NULL,
    "query" TEXT,
    "body" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Grab_key_idx" ON "Grab"("key");

-- CreateIndex
CREATE INDEX "Grab_createdAt_idx" ON "Grab"("createdAt");
