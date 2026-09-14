-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "customDomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_customDomain_key" ON "businesses"("customDomain");
