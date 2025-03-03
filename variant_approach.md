Yes, the key is to avoid marking the variant as "Keep selling when out of stock" if you want to manage its availability based on an internal metric. Instead, you can manage inventory quantities directly using Shopify's inventory management mutations, such as inventoryAdjustQuantities or inventorySetQuantities.

Recommended Approach:
Disable "Keep Selling When Out of Stock: Ensure that the variant's inventory policy is set to stop selling when inventory reaches zero.

Manage Inventory Quantities:

Use the inventoryAdjustQuantities mutation to adjust inventory levels dynamically based on your internal metric. For example:

mutation AdjustInventory {
  inventoryAdjustQuantities(input: {
    reason: "correction",
    name: "available",
    changes: [
      {
        delta: -5, # Adjust based on your metric
        inventoryItemId: "gid://shopify/InventoryItem/30322695",
        locationId: "gid://shopify/Location/124656943"
      }
    ]
  }) {
    inventoryAdjustmentGroup {
      createdAt
      reason
      changes {
        name
        delta
      }
    }
    userErrors {
      field
      message
    }
  }
}