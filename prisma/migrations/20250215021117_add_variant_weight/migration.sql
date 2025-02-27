/*
  Warnings:

  - You are about to drop the column `productWeight` on the `MaterialStock` table. All the data in the column will be lost.
  - Added the required column `variantWeight` to the `MaterialStock` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaterialStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "materialQuantity" REAL NOT NULL,
    "threshold" REAL NOT NULL,
    "variantWeight" REAL NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MaterialStock" ("colorName", "createdAt", "id", "isOutOfStock", "materialQuantity", "threshold", "updatedAt", "variantId") SELECT "colorName", "createdAt", "id", "isOutOfStock", "materialQuantity", "threshold", "updatedAt", "variantId" FROM "MaterialStock";
DROP TABLE "MaterialStock";
ALTER TABLE "new_MaterialStock" RENAME TO "MaterialStock";
CREATE UNIQUE INDEX "MaterialStock_variantId_key" ON "MaterialStock"("variantId");
CREATE INDEX "MaterialStock_variantId_idx" ON "MaterialStock"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
