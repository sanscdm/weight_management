import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { Material } from "@prisma/client";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (!topic || !shop || !payload || !admin?.graphql) {
    return new Response("Webhook not properly authenticated", { status: 401 });
  }

  try {
    const lineItems = payload.line_items || [];
    const processedItems = [];
    const skippedItems = [];

    // For each line item, restore committed weight
    for (const item of lineItems) {
      const variantId = item.variant_id.toString();
      const quantity = item.quantity || 0;

      try {
        // Find all materials linked to this variant
        const materialVariants = await prisma.materialVariant.findMany({
          where: { variantId },
          include: { material: true }
        });

        // Process each material variant
        for (const materialVariant of materialVariants) {
          const weightToRestore = materialVariant.consumptionRequirement * quantity;
          const currentMaterial = await prisma.material.findUnique({
            where: { id: materialVariant.materialId }
          });

          if (!currentMaterial) {
            throw new Error(`Material not found for variant ${variantId}`);
          }

          // Update material weights
          const updatedMaterial = await prisma.material.update({
            where: { id: materialVariant.materialId },
            data: {
              weightCommitted: currentMaterial.weightCommitted - weightToRestore,
              stockMovements: {
                create: {
                  type: 'CANCELLED',
                  variantId,
                  quantityChange: weightToRestore,
                  remainingStock: currentMaterial.totalWeight,
                  orderId: payload.order_id?.toString()
                }
              }
            }
          });

          processedItems.push({
            materialId: materialVariant.materialId,
            variantId,
            quantity,
            weightRestored: weightToRestore,
            remainingCommitted: updatedMaterial.weightCommitted
          });

          // Check if we need to update variant availability based on available weight
          const availableWeight = currentMaterial.totalWeight - updatedMaterial.weightCommitted;
          if (availableWeight > (currentMaterial.threshold || 0)) {
            const variantGid = `gid://shopify/ProductVariant/${variantId}`;
            await admin.graphql(
              `mutation {
                productVariantUpdate(input: {
                  id: "${variantGid}",
                  availableForSale: true
                }) {
                  productVariant {
                    id
                    availableForSale
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }`
            );
          }
        }
      } catch (error) {
        console.error(`Error processing variant ${variantId}:`, error);
        skippedItems.push({
          variantId,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
        continue;
      }
    }

    console.log('Processed items:', processedItems);
    if (skippedItems.length > 0) {
      console.log('Skipped items:', skippedItems);
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(error instanceof Error ? error.message : "Server Error", {
      status: 200 // Return 200 to acknowledge receipt
    });
  }
}; 