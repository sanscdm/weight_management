import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { Material } from "@prisma/client";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log('Received order creation webhook for shop:', shop);
  console.log('Webhook topic:', topic);

  if (!topic || !shop || !payload || !admin?.graphql) {
    return new Response("Webhook not properly authenticated or missing admin API access", { status: 401 });
  }

  try {
    const lineItems = payload.line_items || [];
    const processedItems = [];
    const skippedItems = [];

    // For each line item, commit required weight
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
          const weightToCommit = materialVariant.consumptionRequirement * quantity;
          const currentMaterial = await prisma.material.findUnique({
            where: { id: materialVariant.materialId }
          });

          if (!currentMaterial) {
            throw new Error(`Material not found for variant ${variantId}`);
          }

          // Check if we have enough weight available
          const newCommittedWeight = currentMaterial.weightCommitted + weightToCommit;
          if (newCommittedWeight > currentMaterial.totalWeight) {
            throw new Error(`Insufficient weight available for variant ${variantId}`);
          }

          // Update material weights
          const updatedMaterial = await prisma.material.update({
            where: { id: materialVariant.materialId },
            data: {
              weightCommitted: newCommittedWeight,
              stockMovements: {
                create: {
                  type: 'ORDER_CREATED',
                  variantId,
                  quantityChange: weightToCommit,
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
            weightCommitted: weightToCommit,
            totalCommitted: updatedMaterial.weightCommitted
          });

          // Check if we need to update variant availability
          const remainingWeight = currentMaterial.totalWeight - newCommittedWeight;
          if (remainingWeight <= (currentMaterial.threshold || 0)) {
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