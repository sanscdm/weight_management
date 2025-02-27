import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { processMaterialAndInventory } from "../services/materialManagement.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log('Received webhook for shop:', shop);
  console.log('Webhook topic:', topic);
  console.log('Payload:', payload);

  if (!topic || !shop || !payload || !admin?.graphql) {
    return new Response("Webhook not properly authenticated or missing admin API access", { status: 401 });
  }

  try {
    const lineItems = payload.line_items || [];
    const processedItems = [];
    const skippedItems = [];

    // For each line item, find associated material and update stock
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
          const result = await processMaterialAndInventory(
            materialVariant.materialId,
            variantId,
            quantity,
            'FULFILLMENT',
            admin
          );

          processedItems.push({
            materialId: materialVariant.materialId,
            variantId,
            quantity,
            isOutOfStock: result?.isOutOfStock,
            inventoryUpdated: result?.inventoryUpdated
          });
        }
      } catch (error) {
        console.error(`Error processing variant ${variantId}:`, error);
        skippedItems.push({
          variantId,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue processing other items
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
    // Return 200 to acknowledge receipt of webhook, even if processing failed
    return new Response(error instanceof Error ? error.message : "Server Error", {
      status: 200
    });
  }
}; 