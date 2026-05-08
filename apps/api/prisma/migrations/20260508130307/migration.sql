-- CreateTable
CREATE TABLE "pos_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "category" TEXT,
    "stock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_products_isActive_idx" ON "pos_products"("isActive");

-- CreateIndex
CREATE INDEX "pos_products_category_idx" ON "pos_products"("category");
