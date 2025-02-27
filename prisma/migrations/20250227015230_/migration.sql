/*
  Warnings:

  - You are about to drop the column `unitWeight` on the `MaterialVariant` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaterialVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "consumptionRequirement" REAL NOT NULL,
    "unitWeightUnit" TEXT NOT NULL DEFAULT 'kg',
    "estimatedQuantity" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialVariant_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MaterialVariant" ("consumptionRequirement", "createdAt", "estimatedQuantity", "id", "materialId", "unitWeightUnit", "updatedAt", "variantId", "variantName") SELECT "consumptionRequirement", "createdAt", "estimatedQuantity", "id", "materialId", "unitWeightUnit", "updatedAt", "variantId", "variantName" FROM "MaterialVariant";
DROP TABLE "MaterialVariant";
ALTER TABLE "new_MaterialVariant" RENAME TO "MaterialVariant";
CREATE UNIQUE INDEX "MaterialVariant_variantId_key" ON "MaterialVariant"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
