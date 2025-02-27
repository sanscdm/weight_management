import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        // Handle customer data request
        const customerDataPayload = payload as {
          customer: { id: number; email: string; phone: string };
          orders_requested: number[];
          shop_id: number;
          shop_domain: string;
        };

        // Here you would gather all data related to this customer
        // For now, we'll just log it as we don't store sensitive customer data
        console.log(`Data request for customer ${customerDataPayload.customer.email}`);
        break;

      case "CUSTOMERS_REDACT":
        // Handle customer data deletion
        const customerRedactPayload = payload as {
          customer: { id: number; email: string; phone: string };
          orders_to_redact: number[];
          shop_id: number;
          shop_domain: string;
        };

        // Delete any customer-specific data you might have stored
        // In this case, we don't store customer data, but you would delete it here if you did
        console.log(`Redact request for customer ${customerRedactPayload.customer.email}`);
        break;

      case "SHOP_REDACT":
        // Handle shop data deletion (48 hours after app uninstall)
        const shopRedactPayload = payload as {
          shop_id: number;
          shop_domain: string;
        };

        // Delete all data associated with this shop
        await prisma.materialStock.deleteMany({
          where: { variantId: { startsWith: shopRedactPayload.shop_domain } }
        });

        await prisma.stockMovement.deleteMany({
          where: { variantId: { startsWith: shopRedactPayload.shop_domain } }
        });

        console.log(`Shop data deleted for ${shopRedactPayload.shop_domain}`);
        break;

      default:
        console.log(`Unhandled compliance webhook topic: ${topic}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`Error processing ${topic} webhook:`, error);
    return new Response(null, { status: 500 });
  }
}; 