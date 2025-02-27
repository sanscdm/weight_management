/*
  Warnings:

  - You are about to drop the column `variantAttribute` on the `Material` table. All the data in the column will be lost.
  - You are about to drop the column `variantValue` on the `Material` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "totalWeight" REAL NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "runningBalance" REAL NOT NULL,
    "threshold" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Material_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("createdAt", "id", "materialName", "runningBalance", "shopDomain", "threshold", "totalWeight", "updatedAt", "weightUnit") SELECT "createdAt", "id", "materialName", "runningBalance", "shopDomain", "threshold", "totalWeight", "updatedAt", "weightUnit" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
