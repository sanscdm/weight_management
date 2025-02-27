import prisma from "../db.server";
import type { Material, MaterialVariant, StockMovement } from "@prisma/client";
import shopify from "../shopify.server";
import { GraphqlQueryError } from "@shopify/shopify-api";
import { authenticate } from "../shopify.server";

export interface MaterialWithVariants extends Material {
  variants: MaterialVariant[];
  stockMovements: StockMovement[];
}

interface ShopifyGraphQLResponse {
  body: {
    data: {
      productVariant: {
        id: string;
        title: string;
        product: {
          title: string;
          handle: string;
        };
      };
    };
  };
}

const VARIANT_QUERY = `
  query getVariant($id: ID!) {
    productVariant(id: $id) {
      id
      title
      product {
        title
        handle
      }
    }
  }
`;

export async function getMaterial(id: string): Promise<MaterialWithVariants | null> {
  try {
    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        variants: true,
        stockMovements: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    return material;
  } catch (error) {
    console.error('Error fetching material:', error);
    throw error;
  }
}

export async function getAllMaterials(shopDomain: string): Promise<MaterialWithVariants[]> {
  return prisma.material.findMany({
    where: { shopDomain },
    include: {
      variants: true,
      stockMovements: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createMaterial(data: {
  shopDomain: string;
  materialName: string;
  totalWeight: number;
  weightUnit: string;
  threshold?: number;
  variantAttribute?: string;
  variantValue?: string;
  variants: Array<{
    id: string;
    consumptionRequirement: number;
  }>;
  request: Request;
}) {
  const { 
    shopDomain, 
    materialName, 
    totalWeight, 
    weightUnit, 
    threshold, 
    variantAttribute,
    variantValue,
    variants,
    request 
  } = data;


  try {
    return await prisma.$transaction(async (tx) => {
      // Create the material
      const material = await tx.material.create({
        data: {
          shopDomain,
          materialName,
          totalWeight,
          weightUnit,
          threshold,
          variantAttribute,
          variantValue,
          runningBalance: totalWeight,
        },
      });

      // Create material variants with names fetched from Shopify
      const variantPromises = variants.map(async (variant) => {
        
        const session = await shopify.sessionStorage.findSessionsByShop(shopDomain);
        if (!session?.length) throw new Error("No session found for shop");

        // Format the variant ID for Shopify GraphQL API
        if (!variant.id) {
          throw new Error('Variant ID is undefined or null');
        }

        const variantGid = variant.id.startsWith('gid://') 
          ? variant.id 
          : `gid://shopify/ProductVariant/${variant.id}`;



        const { admin } = await authenticate.admin(request);
        
        const response = await admin.graphql(VARIANT_QUERY, {
          variables: { id: variantGid },
        });

        const responseJson = await response.json();
        

        if (!responseJson?.data?.productVariant) {
          throw new Error(`Failed to fetch variant data for ${variant.id}`);
        }

        const { productVariant } = responseJson.data;
        

        try {
          return await tx.materialVariant.create({
            data: {
              materialId: material.id,
              variantId: variant.id,
              variantName: `${productVariant.product.title} - ${productVariant.title}`,
              unitWeight: 0,
              consumptionRequirement: variant.consumptionRequirement,
            },
          });
        } catch (error: any) {
          console.error('Error creating material variant:', error);
          throw new Error(`Failed to create material variant: ${error.message}`);
        }
      });

      const createdVariants = await Promise.all(variantPromises);


      // Create initial stock movement
      const stockMovement = await tx.stockMovement.create({
        data: {
          materialId: material.id,
          type: 'INITIAL',
          quantityChange: totalWeight,
          remainingStock: totalWeight,
        },
      });


      // Fetch the complete material with its relationships using the transaction
      const createdMaterial = await tx.material.findUnique({
        where: { id: material.id },
        include: {
          variants: true,
          stockMovements: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!createdMaterial) {
        throw new Error('Failed to fetch created material');
      }

      return createdMaterial;
    });
  } catch (error) {
    console.error('Transaction error:', error);
    throw error;
  }
}

export async function updateMaterial(data: {
  id: string;
  shopDomain: string;
  materialName: string;
  totalWeight: number;
  weightUnit: string;
  threshold?: number;
  variantAttribute?: string;
  variantValue?: string;
  variants: Array<{
    id: string;
    variantId: string;
    variantName: string;
    consumptionRequirement: number;
    unitWeight: number;
  }>;
}) {
  const { 
    id,
    shopDomain, 
    materialName, 
    totalWeight, 
    weightUnit, 
    threshold, 
    variantAttribute,
    variantValue,
    variants,
  } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      // Update the material
      const material = await tx.material.update({
        where: { id },
        data: {
          materialName,
          totalWeight,
          weightUnit,
          threshold,
          variantAttribute,
          variantValue,
        },
      });

      // Get existing variants
      const existingVariants = await tx.materialVariant.findMany({
        where: { materialId: id },
      });

      // Delete variants that are no longer selected
      const variantIds = variants.map(v => v.variantId);
      const variantsToDelete = existingVariants.filter(
        v => !variantIds.includes(v.variantId)
      );
      
      if (variantsToDelete.length > 0) {
        await tx.materialVariant.deleteMany({
          where: {
            materialId: id,
            variantId: { in: variantsToDelete.map(v => v.variantId) },
          },
        });
      }

      // Update or create variants
      const variantPromises = variants.map(async (variant) => {
        const existingVariant = existingVariants.find(
          v => v.variantId === variant.variantId
        );

        if (existingVariant) {
          // Update existing variant
          return tx.materialVariant.update({
            where: { id: existingVariant.id },
            data: {
              variantName: variant.variantName,  // Include variantName in update
              consumptionRequirement: variant.consumptionRequirement,
            },
          });
        } else {
          // Create new variant
          return tx.materialVariant.create({
            data: {
              materialId: id,
              variantId: variant.variantId,
              variantName: variant.variantName,  // Include variantName in create
              unitWeight: variant.unitWeight || 0,
              consumptionRequirement: variant.consumptionRequirement,
            },
          });
        }
      });

      await Promise.all(variantPromises);

      // Fetch and return the updated material with its relationships
      const updatedMaterial = await tx.material.findUnique({
        where: { id },
        include: {
          variants: true,
          stockMovements: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!updatedMaterial) {
        throw new Error('Failed to fetch updated material');
      }

      return updatedMaterial;
    });
  } catch (error) {
    console.error('Transaction error:', error);
    throw error;
  }
}

export async function updateMaterialStock(
  materialId: string,
  variantId: string,
  quantity: number,
  type: 'FULFILLMENT' | 'CANCELLED' | 'ADJUSTMENT'
) {
  console.log('Updating material stock for materialId:', materialId);
  console.log('Variant ID:', variantId);
  console.log('Quantity:', quantity);
  console.log('Type:', type);
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findUnique({
      where: { id: materialId },
      include: { variants: true }
    });

    if (!material) throw new Error('Material not found');

    const variant = material.variants.find(v => v.variantId === variantId);
    if (!variant) throw new Error('Variant not linked to material');

    const quantityChange = type === 'CANCELLED' ? quantity : -quantity;
    const newBalance = material.runningBalance + quantityChange * variant.consumptionRequirement;

    if (newBalance < 0) throw new Error('Insufficient material stock');

    // Update material running balance
    await tx.material.update({
      where: { id: materialId },
      data: { runningBalance: newBalance }
    });

    // Create stock movement record
    await tx.stockMovement.create({
      data: {
        materialId,
        variantId,
        type,
        quantityChange: quantityChange * variant.consumptionRequirement,
        remainingStock: newBalance,
      }
    });

    return getMaterial(materialId);
  });
}

export async function checkAndUpdateVariantAvailability(
  materialId: string,
  shopDomain: string
) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { variants: true }
  });

  if (!material) throw new Error('Material not found');

  const session = await shopify.sessionStorage.findSessionsByShop(shopDomain);
  if (!session?.length) throw new Error("No session found for shop");

  const { admin } = await authenticate.admin(new Request(''));

  // Update availability for each variant
  for (const variant of material.variants) {
    const hasEnoughMaterial = material.runningBalance >= variant.consumptionRequirement;
    
    try {
      await admin.graphql(`
        mutation inventoryActivate($inventoryItemId: ID!, $available: Boolean!) {
          inventoryActivate(inventoryItemId: $inventoryItemId, available: $available) {
            inventoryLevel {
              available
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          inventoryItemId: variant.variantId,
          available: hasEnoughMaterial,
        },
      });
    } catch (error) {
      if (error instanceof GraphqlQueryError) {
        throw new Error(`${error.message}\n${JSON.stringify(error.response, null, 2)}`);
      } else {
        throw error;
      }
    }
  }
}

// Add type definition at the top of the file after imports
type ShopifyInventoryResult = {
  inventoryUpdated: boolean;
  isOutOfStock: boolean;
  error?: any;
};

const MAX_RETRIES = 3;

async function updateShopifyInventory(
  admin: { graphql: any },
  variantGid: string,
  isOutOfStock: boolean,
  newBalance: number,
  consumptionRequirement: number
): Promise<ShopifyInventoryResult> {
  console.log(`[updateShopifyInventory] Starting inventory update process`, {
    variantGid,
    isOutOfStock,
    newBalance,
    consumptionRequirement
  });

  try {
    // STEP 1: Fetch variant and location data
    console.log(`[updateShopifyInventory] STEP 1: Fetching variant and location data`);
    const variantResponse = await admin.graphql(
      `#graphql
      query getVariantInventory($id: ID!) {
        productVariant(id: $id) {
          id
          inventoryItem {
            id
          }
          product {
            title
          }
        }
        locations(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`,
      { variables: { id: variantGid } }
    );
    
    const variantData = await variantResponse.json();
    console.log(`[updateShopifyInventory] Variant data received`);

    if (!variantData.data?.productVariant?.inventoryItem?.id) {
      throw new Error(`No inventory item found for variant ${variantGid}`);
    }

    const inventoryItemId = variantData.data.productVariant.inventoryItem.id;
    const locationId = variantData.data.locations.edges[0]?.node.id;
    
    if (!locationId) {
      throw new Error('No location found for shop');
    }

    console.log(`[updateShopifyInventory] Found inventory item ${inventoryItemId} at location ${locationId}`);

    // STEP 2: Check if inventory level exists and get current quantity
    console.log(`[updateShopifyInventory] STEP 2: Checking existing inventory level`);
    const inventoryLevelResponse = await admin.graphql(
      `#graphql
      query InventoryLevelList($inventoryItemId: ID!) {
        inventoryItem(id: $inventoryItemId) {
          inventoryLevels(first: 1) {
            nodes {
              id
              location {
                id
              }
              quantities(names: ["available"]) {
                name
                quantity
              }
              updatedAt
            }
          }
        }
      }`,
      { 
        variables: { 
          inventoryItemId
        }
      }
    );
    
    const inventoryLevelData = await inventoryLevelResponse.json();
    console.log(`[updateShopifyInventory] Inventory level data received`);

    let currentQuantity = 0;
    const inventoryLevel = inventoryLevelData.data?.inventoryItem?.inventoryLevels?.nodes?.[0];
    
    // Check for GraphQL errors
    if (inventoryLevelData.errors) {
      console.error(`[updateShopifyInventory] GraphQL errors in inventory level query:`, {
        errors: inventoryLevelData.errors,
        mutation: 'InventoryLevelList',
        variables: { inventoryItemId }
      });
      throw new Error(`GraphQL errors: ${JSON.stringify(inventoryLevelData.errors)}`);
    }

    if (inventoryLevel?.quantities?.[0]?.quantity !== undefined) {
      currentQuantity = inventoryLevel.quantities[0].quantity;
      console.log(`[updateShopifyInventory] Current quantity: ${currentQuantity}`);
    }

    // Get the location ID from the inventory level if it exists, otherwise use the one from step 1
    const inventoryLocationId = inventoryLevel?.location?.id || locationId;

    // STEP 3: If inventory level doesn't exist, create it
    if (!inventoryLevel) {
      console.log(`[updateShopifyInventory] STEP 3: Creating new inventory level`);
      try {
        const activateResponse = await admin.graphql(
          `#graphql
          mutation activateInventory($inventoryItemId: ID!, $locationId: ID!) {
            inventoryActivate(
              inventoryItemId: $inventoryItemId,
              locationId: $locationId
            ) {
              inventoryLevel {
                id
              }
              userErrors {
                field
                message
              }
            }
          }`,
          { 
            variables: { 
              inventoryItemId,
              locationId: inventoryLocationId
            }
          }
        );
        
        const activateData = await activateResponse.json();
        
        // Check for GraphQL errors
        if (activateData.errors) {
          console.error(`[updateShopifyInventory] GraphQL errors in activate mutation:`, {
            errors: activateData.errors,
            mutation: 'inventoryActivate',
            variables: { inventoryItemId, locationId: inventoryLocationId }
          });
          throw new Error(`GraphQL errors: ${JSON.stringify(activateData.errors)}`);
        }

        if (activateData.data?.inventoryActivate?.userErrors?.length > 0) {
          const errors = activateData.data.inventoryActivate.userErrors;
          // Check if error is due to inventory level already existing
          const alreadyExists = errors.some((error: any) => 
            error.message.includes('already exists') || 
            error.message.includes('already active')
          );
          
          if (!alreadyExists) {
            console.error(`[updateShopifyInventory] Failed to activate inventory:`, {
              mutation: 'inventoryActivate',
              variables: { inventoryItemId, locationId: inventoryLocationId },
              errors
            });
            throw new Error(`Failed to activate inventory: ${JSON.stringify(errors)}`);
          } else {
            console.log(`[updateShopifyInventory] Inventory level already exists, proceeding with quantity update`);
          }
        } else {
          console.log(`[updateShopifyInventory] Successfully created inventory level`);
        }
      } catch (error: unknown) {
        if (error instanceof GraphqlQueryError && error.response) {
          console.error(`[updateShopifyInventory] GraphQL error in activate mutation:`, {
            error: error.message,
            response: error.response,
            variables: { inventoryItemId, locationId: inventoryLocationId }
          });
        }
        throw error;
      }
    }

    // STEP 4: Set the quantity with retry mechanism
    console.log(`[updateShopifyInventory] STEP 4: Setting inventory quantity`);
    const targetQuantity = isOutOfStock ? 0 : 1;
    if (targetQuantity < 0) {
      throw new Error('Cannot set negative inventory quantity');
    }

    let retryCount = 0;
    let success = false;
    let lastError = null;

    while (retryCount < MAX_RETRIES && !success) {
      try {
        const setQuantityResponse = await admin.graphql(
          `#graphql
          mutation setInventoryQuantity($inventoryItemId: ID!, $locationId: ID!, $quantity: Int!, $compareQuantity: Int!) {
            inventorySetQuantities(
              input: {
                name: "available",
                quantities: [{
                  inventoryItemId: $inventoryItemId,
                  locationId: $locationId,
                  quantity: $quantity,
                  compareQuantity: $compareQuantity
                }],
                reason: "correction"
              }
            ) {
              inventoryAdjustmentGroup {
                id
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: { 
              inventoryItemId,
              locationId: inventoryLocationId,
              quantity: targetQuantity,
              compareQuantity: currentQuantity
            }
          }
        );

        const setQuantityData = await setQuantityResponse.json();
        
        // Check for GraphQL errors
        if (setQuantityData.errors) {
          console.error(`[updateShopifyInventory] GraphQL errors in setQuantities mutation:`, {
            errors: setQuantityData.errors,
            mutation: 'inventorySetQuantities',
            variables: { inventoryItemId, locationId: inventoryLocationId, quantity: targetQuantity, compareQuantity: currentQuantity }
          });
          throw new Error(`GraphQL errors: ${JSON.stringify(setQuantityData.errors)}`);
        }

        const userErrors = setQuantityData.data?.inventorySetQuantities?.userErrors || [];

        if (userErrors.length > 0) {
          const isConcurrentError = userErrors.some(
            (error: any) => error.message.includes('concurrent')
          );

          if (isConcurrentError && retryCount < MAX_RETRIES - 1) {
            const backoffTime = Math.pow(2, retryCount) * 1000;
            console.log(`[updateShopifyInventory] Retry ${retryCount + 1}/${MAX_RETRIES} due to concurrent modification. Waiting ${backoffTime}ms`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          }

          console.error(`[updateShopifyInventory] Failed to set quantity:`, {
            mutation: 'inventorySetQuantities',
            variables: { inventoryItemId, locationId: inventoryLocationId, quantity: targetQuantity, compareQuantity: currentQuantity },
            errors: userErrors,
            retryCount
          });
          throw new Error(`Failed to set quantity: ${JSON.stringify(userErrors)}`);
        }

        // Check throttle status
        const throttleStatus = setQuantityData.extensions?.cost?.throttleStatus;
        if (throttleStatus?.currentlyAvailable < throttleStatus?.maximumAvailable * 0.1) {
          console.warn(`[updateShopifyInventory] Approaching rate limit:`, throttleStatus);
        }

        success = true;
        console.log(`[updateShopifyInventory] Successfully updated inventory to quantity ${targetQuantity}`);

      } catch (error) {
        lastError = error;
        if (retryCount >= MAX_RETRIES - 1) {
          console.error(`[updateShopifyInventory] Max retries (${MAX_RETRIES}) reached:`, {
            error,
            variables: { inventoryItemId, locationId: inventoryLocationId, quantity: targetQuantity, compareQuantity: currentQuantity }
          });
          throw error;
        }
        retryCount++;
        const backoffTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }

    return { 
      inventoryUpdated: true, 
      isOutOfStock 
    };

  } catch (error) {
    console.error(`[updateShopifyInventory] Error updating inventory:`, {
      error,
      variantGid,
      isOutOfStock,
      newBalance,
      consumptionRequirement
    });
    
    return { 
      inventoryUpdated: false, 
      isOutOfStock,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function processMaterialAndInventory(
  materialId: string,
  variantId: string,
  quantity: number,
  type: 'FULFILLMENT' | 'CANCELLED' | 'ADJUSTMENT',
  admin: { graphql: any }
) {
  console.log(`Processing material ${materialId} for variant ${variantId}`);
  console.log(`Quantity: ${quantity}, Type: ${type}`);

  return await prisma.$transaction(async (tx) => {
    const material = await tx.material.findUnique({
      where: { id: materialId },
      include: { variants: true }
    });

    if (!material) throw new Error('Material not found');

    const variant = material.variants.find(v => v.variantId === variantId);
    if (!variant) throw new Error('Variant not linked to material');

    const quantityChange = type === 'CANCELLED' ? quantity : -quantity;
    const newBalance = material.runningBalance + quantityChange * variant.consumptionRequirement;

    if (newBalance < 0) {
      // Keep the current balance and mark as out of stock
      const updatedMaterial = await tx.material.update({
        where: { id: materialId },
        data: { runningBalance: material.runningBalance }
      });

      await tx.stockMovement.create({
        data: {
          materialId,
          variantId,
          type: 'OUT_OF_STOCK',
          quantityChange: 0,
          remainingStock: material.runningBalance,
        }
      });

      const variantGid = variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`;
      
      try {
        const result = await updateShopifyInventory(admin, variantGid, true, material.runningBalance, variant.consumptionRequirement);
        return { material: updatedMaterial, ...result };
      } catch (error: any) {
        console.error(`Failed to update Shopify inventory:`, error);
        return { 
          material: updatedMaterial, 
          inventoryUpdated: false, 
          isOutOfStock: true, // Always true in error case since we couldn't update inventory
          error 
        };
      }
    } else {
      // Update with new balance
      const updatedMaterial = await tx.material.update({
        where: { id: materialId },
        data: { runningBalance: newBalance }
      });

      await tx.stockMovement.create({
        data: {
          materialId,
          variantId,
          type,
          quantityChange: quantityChange * variant.consumptionRequirement,
          remainingStock: newBalance,
        }
      });

      const isOutOfStock = newBalance < variant.consumptionRequirement;
      const variantGid = variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`;

      try {
        const result = await updateShopifyInventory(admin, variantGid, isOutOfStock, newBalance, variant.consumptionRequirement);
        return { material: updatedMaterial, ...result };
      } catch (error: any) {
        console.error(`Failed to update Shopify inventory:`, error);
        return { 
          material: updatedMaterial, 
          inventoryUpdated: false, 
          isOutOfStock, // Use the calculated isOutOfStock value
          error 
        };
      }
    }
  });
} 