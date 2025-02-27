// import prisma from "../db.server";
// import type { MaterialStock, StockMovement } from "@prisma/client";

// export async function getMaterialStock(variantId: string): Promise<MaterialStock | null> {
//   return prisma.materialStock.findUnique({
//     where: { variantId },
//     include: { movements: true }
//   });
// }

// export async function getAllMaterialStock(): Promise<MaterialStock[]> {
//   return prisma.materialStock.findMany({
//     include: { movements: true }
//   });
// }

// export async function createMaterialStock(data: {
//   variantId: string;
//   colorName: string;
//   materialQuantity: number;
//   threshold: number;
//   variantWeight: number;
//   weightUnit: string;
// }): Promise<MaterialStock> {
//   const isOutOfStock = data.materialQuantity < data.threshold;

//   return prisma.materialStock.create({
//     data: {
//       ...data,
//       isOutOfStock,
//       movements: {
//         create: {
//           type: 'MANUAL_ADJUSTMENT',
//           quantity: data.materialQuantity,
//           remainingStock: data.materialQuantity,
//         }
//       }
//     },
//     include: { movements: true }
//   });
// }

// export async function updateMaterialStock(
//   variantId: string,
//   data: {
//     materialQuantity?: number;
//     threshold?: number;
//     variantWeight?: number;
//     weightUnit?: string;
//     colorName?: string;
//   }
// ): Promise<MaterialStock> {
//   const currentStock = await getMaterialStock(variantId);
//   if (!currentStock) {
//     throw new Error(`No material stock found for variant ${variantId}`);
//   }

//   const newQuantity = data.materialQuantity ?? currentStock.materialQuantity;
//   const newThreshold = data.threshold ?? currentStock.threshold;
//   const isOutOfStock = newQuantity < newThreshold;

//   if (data.materialQuantity) {
//     await prisma.stockMovement.create({
//       data: {
//         variantId,
//         type: 'MANUAL_ADJUSTMENT',
//         quantity: data.materialQuantity - currentStock.materialQuantity,
//         remainingStock: data.materialQuantity,
//       }
//     });
//   }

//   return prisma.materialStock.update({
//     where: { variantId },
//     data: {
//       ...data,
//       isOutOfStock,
//     },
//     include: { movements: true }
//   });
// }

// export async function processFulfillment(data: {
//   variantId: string;
//   quantity: number;
//   orderId: string;
// }): Promise<MaterialStock & { isOutOfStock: boolean }> {
//   const materialStock = await getMaterialStock(data.variantId);
//   if (!materialStock) {
//     throw new Error(`No material stock found for variant ${data.variantId}`);
//   }

//   const materialNeeded = data.quantity * materialStock.variantWeight;
//   const newQuantity = materialStock.materialQuantity - materialNeeded;
//   const isOutOfStock = newQuantity < materialStock.threshold;

//   await prisma.stockMovement.create({
//     data: {
//       variantId: data.variantId,
//       type: 'FULFILLMENT',
//       quantity: -materialNeeded,
//       remainingStock: newQuantity,
//       orderId: data.orderId,
//     }
//   });

//   const updatedStock = await prisma.materialStock.update({
//     where: { variantId: data.variantId },
//     data: {
//       materialQuantity: newQuantity,
//       isOutOfStock,
//     },
//     include: { movements: true }
//   });

//   return { ...updatedStock, isOutOfStock };
// }

// export async function cancelFulfillment(data: {
//   variantId: string;
//   quantity: number;
//   orderId: string;
// }): Promise<MaterialStock> {
//   const materialStock = await getMaterialStock(data.variantId);
//   if (!materialStock) {
//     throw new Error(`No material stock found for variant ${data.variantId}`);
//   }

//   const materialToRestore = data.quantity * materialStock.variantWeight;
//   const newQuantity = materialStock.materialQuantity + materialToRestore;
//   const isOutOfStock = newQuantity < materialStock.threshold;

//   await prisma.stockMovement.create({
//     data: {
//       variantId: data.variantId,
//       type: 'FULFILLMENT_CANCELLED',
//       quantity: materialToRestore,
//       remainingStock: newQuantity,
//       orderId: data.orderId,
//     }
//   });

//   return prisma.materialStock.update({
//     where: { variantId: data.variantId },
//     data: {
//       materialQuantity: newQuantity,
//       isOutOfStock,
//     },
//     include: { movements: true }
//   });
// }

// export async function deleteMaterialStock(variantId: string): Promise<void> {
//   await prisma.stockMovement.deleteMany({
//     where: { variantId }
//   });
  
//   await prisma.materialStock.delete({
//     where: { variantId }
//   });
// } 