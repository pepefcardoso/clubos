-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_key_idx" ON "message_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_channel_key" ON "message_templates"("key", "channel");
