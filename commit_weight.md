
ALWAYS ASK FOR CLARIFICATION BEFORE YOU MODIFY THE UI!

Core Logic Refinement
When an order is confirmed/paid

The weight committed increases (this represents weight approved for production).
If weight committed exceeds total available weight, the product is marked out of stock.
When an order is fulfilled

The weight committed is reduced.
The corresponding total weight is withdrawn.
Scenarios to Handle:

Order cancellations (restore committed weight).
Partial order fulfillment.
Bulk orders affecting stock levels.
Adjusting available weight due to supplier restocks or manual overrides.


User Stories
1️⃣ As a merchant, I want to track weight committed when an order is paid
Description:

When an order is paid, the system adds its required weight to the weight committed field.
If the weight committed exceeds the total available weight, the product is automatically set as out of stock to prevent overselling.
Acceptance Criteria:
✔️ Weight committed increases when an order is paid.
✔️ If total committed weight > total weight, product is set to "out of stock".

2️⃣ As a merchant, I want to deduct total weight when an order is fulfilled
Description:

When an order is fulfilled, the committed weight is removed, and the total available weight is reduced accordingly.
Acceptance Criteria:
✔️ Total weight decreases only after order fulfillment.
✔️ Weight committed reduces once the order is fulfilled.

3️⃣ As a merchant, I want to ensure inventory updates when an order is canceled
Description:

If an order is canceled before fulfillment, the weight committed should decrease accordingly.
Acceptance Criteria:
✔️ Weight committed reduces when an order is canceled.
✔️ Product availability is updated based on the new committed weight.

4️⃣ As a merchant, I want to handle partial order fulfillments correctly
Description:

If only a portion of the order is fulfilled, then only the corresponding portion of the weight is deducted from the total weight.
Acceptance Criteria:
✔️ Partial fulfillment updates both weight committed and total weight correctly.
✔️ System ensures remaining items still affect stock availability.

5️⃣ As a merchant, I want to manually adjust available weight (restocks, supplier updates)
Description:

If a supplier restocks or if weight needs manual adjustments, an admin should be able to update total weight directly in the app.
Acceptance Criteria:
✔️ Admin can modify total weight.
✔️ System re-evaluates stock status based on new values.

Shopify App UI → Should display weight available, weight committed, and total weight per product.


To make a product variant unavailable in Shopify regardless of its quantity, you can use the productVariantUpdate mutation to set the availableForSale field to false. This ensures the variant is not available for purchase, irrespective of its inventory levels.

mutation UpdateVariantAvailability {
  productVariantUpdate(input: {
    id: "gid://shopify/ProductVariant/123456789",
    availableForSale: false
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
}

Explanation:
Replace "gid://shopify/ProductVariant/123456789" with the ID of the variant you want to make unavailable.
The availableForSale field is set to false to make the variant unavailable for purchase.
The response includes the updated variant's ID and its availableForSale status, along with any potential user errors.
This approach ensures that the variant is unavailable for customers, regardless of its inventory quantity.

