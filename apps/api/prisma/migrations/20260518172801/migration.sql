-- CreateTable
CREATE TABLE "scout_billing_payments" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "gatewayTxid" TEXT NOT NULL,
    "externalId" TEXT,
    "gatewayName" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scout_billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scout_billing_payments_gatewayTxid_key" ON "scout_billing_payments"("gatewayTxid");

-- CreateIndex
CREATE INDEX "scout_billing_payments_scoutId_idx" ON "scout_billing_payments"("scoutId");

-- CreateIndex
CREATE UNIQUE INDEX "scout_billing_payments_scoutId_billingCycle_key" ON "scout_billing_payments"("scoutId", "billingCycle");
