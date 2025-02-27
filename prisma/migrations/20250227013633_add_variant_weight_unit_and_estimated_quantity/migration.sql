-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaterialVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "unitWeight" REAL NOT NULL,
    "unitWeightUnit" TEXT NOT NULL DEFAULT 'kg',
    "consumptionRequirement" REAL NOT NULL,
    "estimatedQuantity" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialVariant_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MaterialVariant" ("consumptionRequirement", "createdAt", "id", "materialId", "unitWeight", "updatedAt", "variantId", "variantName") SELECT "consumptionRequirement", "createdAt", "id", "materialId", "unitWeight", "updatedAt", "variantId", "variantName" FROM "MaterialVariant";
DROP TABLE "MaterialVariant";
ALTER TABLE "new_MaterialVariant" RENAME TO "MaterialVariant";
CREATE UNIQUE INDEX "MaterialVariant_variantId_key" ON "MaterialVariant"("variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
