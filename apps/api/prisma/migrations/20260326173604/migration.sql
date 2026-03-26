/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `workload_metrics` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "workload_metrics" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workload_metrics_idempotencyKey_key" ON "workload_metrics"("idempotencyKey");
