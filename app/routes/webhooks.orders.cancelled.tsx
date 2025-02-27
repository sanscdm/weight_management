import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { updateMaterialStock, checkAndUpdateVariantAvailability } from "../services/materialManagement.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!topic || !shop || !payload) {
    return new Response("Webhook not properly authenticated", { status: 401 });
  }

  try {
    // Get all line items from the cancelled order
    const lineItems = payload.line_items || [];

    // For each line item, find associated material and update stock
    for (const item of lineItems) {
      const variantId = item.variant_id.toString();
      const quantity = item.quantity || 0;

      // Find all materials linked to this variant
      const materialVariants = await prisma.materialVariant.findMany({
        where: { variantId },
        include: { material: true }
      });

      // Update stock for each material (adding back the materials)
      for (const materialVariant of materialVariants) {
        await updateMaterialStock(
          materialVariant.materialId,
          variantId,
          quantity,
          'CANCELLED'
        );

        // Check and update variant availability
        await checkAndUpdateVariantAvailability(
          materialVariant.materialId,
          shop
        );
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(error instanceof Error ? error.message : "Server Error", {
      status: 500
    });
  }
}; 