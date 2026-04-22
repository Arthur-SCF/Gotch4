-- CreateTable
CREATE TABLE "Program" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "urlPath" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "programId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fullUrl" TEXT NOT NULL,
    "query" TEXT,
    "headers" TEXT NOT NULL,
    "body" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "host" TEXT,
    "protocol" TEXT,
    "contentType" TEXT,
    "contentLength" INTEGER,
    "cookies" TEXT,
    "notes" TEXT,
    "programId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayloadCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayloadCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payload" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER NOT NULL,
    "tags" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "programId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");

-- CreateIndex
CREATE INDEX "Program_isFavorite_idx" ON "Program"("isFavorite");

-- CreateIndex
CREATE INDEX "Program_createdAt_idx" ON "Program"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "File_filename_key" ON "File"("filename");

-- CreateIndex
CREATE UNIQUE INDEX "File_urlPath_key" ON "File"("urlPath");

-- CreateIndex
CREATE INDEX "File_programId_idx" ON "File"("programId");

-- CreateIndex
CREATE INDEX "File_createdAt_idx" ON "File"("createdAt");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Event_programId_idx" ON "Event"("programId");

-- CreateIndex
CREATE INDEX "Event_method_idx" ON "Event"("method");

-- CreateIndex
CREATE INDEX "Event_ipAddress_idx" ON "Event"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PayloadCategory_name_key" ON "PayloadCategory"("name");

-- CreateIndex
CREATE INDEX "PayloadCategory_order_idx" ON "PayloadCategory"("order");

-- CreateIndex
CREATE INDEX "Payload_categoryId_idx" ON "Payload"("categoryId");

-- CreateIndex
CREATE INDEX "Payload_isFavorite_idx" ON "Payload"("isFavorite");

-- CreateIndex
CREATE INDEX "Payload_programId_idx" ON "Payload"("programId");

-- CreateIndex
CREATE INDEX "Payload_createdAt_idx" ON "Payload"("createdAt");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payload" ADD CONSTRAINT "Payload_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PayloadCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payload" ADD CONSTRAINT "Payload_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
