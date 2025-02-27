import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  Session,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import prisma from "./db.server";

// Create a new session storage instance with custom implementation
class CustomSessionStorage extends PrismaSessionStorage<PrismaClient> {
  constructor(prismaClient: PrismaClient) {
    super(prismaClient);
  }

  async storeSession(session: Session) {
    try {
      // First ensure shop exists
      console.log("Storing session for shop:", session.shop);
      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        update: { 
          accessToken: session.accessToken,
          updatedAt: new Date()
        },
        create: {
          shopDomain: session.shop,
          accessToken: session.accessToken,
        },
      });

      // Then store session using parent implementation
      return super.storeSession(session);
    } catch (error) {
      console.error("Error storing session:", error);
      throw error;
    }
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new CustomSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  // hooks: {
  //   afterAuth: async ({ session }) => {
  //     try {
  //       var res = await shopify.registerWebhooks({ session });
  //       console.log("Webhooks registered:", res);
  //     } catch (error) {
  //       console.error("Error registering webhooks:", error);
  //       throw error;
  //     }
  //   },
  // },
  // webhooks: {
  //   ORDERS_FULFILLED: {
  //     deliveryMethod: DeliveryMethod.Http,
  //     callbackUrl: "/webhooks/orders/fulfilled",
  //   },
  //   ORDERS_CANCELLED: {
  //     deliveryMethod: DeliveryMethod.Http,
  //     callbackUrl: "/webhooks/orders/cancelled",
  //   },
  // },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
