-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "chatWidgetToken" TEXT;
ALTER TABLE "businesses" ADD COLUMN "allowedChatOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "businesses_chatWidgetToken_key" ON "businesses"("chatWidgetToken");
