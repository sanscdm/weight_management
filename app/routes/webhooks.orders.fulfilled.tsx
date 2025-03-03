import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { Material } from "@prisma/client";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log('Received fulfillment webhook for shop:', shop);
  console.log('Webhook topic:', topic);

  if (!topic || !shop || !payload || !admin?.graphql) {
    return new Response("Webhook not properly authenticated or missing admin API access", { status: 401 });
  }

  try {
    const lineItems = payload.line_items || [];
    const processedItems = [];
    const skippedItems = [];

    // For each line item, update material weights
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
          const weightToDeduct = materialVariant.consumptionRequirement * quantity;
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
              totalWeight: currentMaterial.totalWeight - weightToDeduct,
              stockMovements: {
                create: {
                  type: 'FULFILLMENT',
                  variantId,
                  quantityChange: -weightToDeduct,
                  remainingStock: currentMaterial.totalWeight - weightToDeduct,
                  orderId: payload.order_id?.toString()
                }
              }
            }
          });

          processedItems.push({
            materialId: materialVariant.materialId,
            variantId,
            quantity,
            weightDeducted: weightToDeduct,
            remainingWeight: updatedMaterial.totalWeight
          });

          // Check if we need to update variant availability based on remaining weight
          if (updatedMaterial.totalWeight <= (updatedMaterial.threshold || 0)) {
            const variantGid = `gid://shopify/ProductVariant/${variantId}`;
            // First, get the product ID for this variant
            const variantResponse = await admin.graphql(
              `query getVariantProduct($id: ID!) {
                productVariant(id: $id) {
                  id
                  product {
                    id
                  }
                }
              }`,
              { variables: { id: variantGid } }
            );
            
            const variantData = await variantResponse.json();
            const productId = variantData.data.productVariant.product.id;

            // Now update the variant availability using productSet
            await admin.graphql(
              `mutation productSetAvailability($input: ProductSetInput!) {
                productSet(input: $input) {
                  productSetOperation {
                    status
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  input: {
                    id: productId,
                    variants: [
                      {
                        id: variantGid,
                        availableForSale: false
                      }
                    ]
                  }
                }
              }
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