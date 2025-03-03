import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, useSubmit, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  Badge,
  Banner,
  LegacyCard,
  Button,
  Box,
  FormLayout,
  Select,
  TextField,
  BlockStack,
  InlineStack,
  Toast,
  Grid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getMaterial, processMaterialAndInventory, adjustMaterialStock } from "../services/materialManagement.server";
import type { Material, MaterialVariant, StockMovement } from "@prisma/client";
import { estimateQuantity, convertWeight, type WeightUnit } from "../utils/weightConversion";
import { useState, useCallback, useEffect } from "react";
import { PrismaClient } from "@prisma/client";

interface MaterialWithVariants extends Material {
  variants: MaterialVariant[];
  stockMovements: StockMovement[];
}

const WEIGHT_UNITS: { label: string; value: WeightUnit }[] = [
  { label: "Kilograms (kg)", value: "kg" },
  { label: "Grams (g)", value: "g" },
  { label: "Pounds (lb)", value: "lb" },
  { label: "Ounces (oz)", value: "oz" },
];

const prisma = new PrismaClient();

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!params.id) {
    throw new Error("Material ID is required");
  }

  const material = await getMaterial(params.id);
  
  if (!material || material.shopDomain !== session.shop) {
    throw new Error("Material not found");
  }

  return json({ material });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const materialId = params.id;
  const variantId = formData.get("variantId")?.toString();
  const quantity = parseFloat(formData.get("quantity")?.toString() || "0");
  const fromUnit = formData.get("fromUnit")?.toString() as WeightUnit;
  const toUnit = formData.get("toUnit")?.toString() as WeightUnit;
  const type = "ADJUSTMENT";

  if (!materialId || !quantity || !fromUnit || !toUnit) {
    return json({ error: "Invalid form data" }, { status: 400 });
  }

  try {
    // Convert the quantity to the material's unit
    const convertedQuantity = convertWeight(quantity, fromUnit, toUnit);

    // Get current material state
    const currentMaterial = await prisma.material.findUnique({
      where: { id: materialId }
    });

    if (!currentMaterial) {
      return json({ error: "Material not found" }, { status: 404 });
    }

    // For negative adjustments, check if we have enough available weight
    if (convertedQuantity < 0) {
      const availableWeight = currentMaterial.totalWeight - currentMaterial.weightCommitted;
      if (Math.abs(convertedQuantity) > availableWeight) {
        return json({ 
          error: "Cannot reduce total weight below committed amount" 
        }, { status: 400 });
      }
    }

    // Update material weights
    const updatedMaterial = await prisma.material.update({
      where: { id: materialId },
      data: {
        totalWeight: currentMaterial.totalWeight + convertedQuantity,
        stockMovements: {
          create: {
            type,
            variantId,
            quantityChange: convertedQuantity,
            remainingStock: currentMaterial.totalWeight + convertedQuantity,
            orderId: null
          }
        }
      }
    });

    // Check if we need to update variant availability
    if (variantId) {
      const availableWeight = updatedMaterial.totalWeight - currentMaterial.weightCommitted;
      const materialVariant = await prisma.materialVariant.findUnique({
        where: { variantId }
      });

      if (materialVariant) {
        const shouldBeAvailable = availableWeight >= materialVariant.consumptionRequirement;
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
                    availableForSale: shouldBeAvailable
                  }
                ]
              }
            }
          }
        );
      }
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to update stock" }, { status: 500 });
  }
};

export default function MaterialDetails() {
  const { material } = useLoaderData<{ material: MaterialWithVariants }>();
  const actionData = useActionData<{ success?: boolean; error?: string }>();
  const navigate = useNavigate();
  const submit = useSubmit();

  // Form state
  const [selectedVariant, setSelectedVariant] = useState("");
  const [quantity, setQuantity] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<WeightUnit>(material.weightUnit as WeightUnit);
  const [convertedQuantity, setConvertedQuantity] = useState<number | null>(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Calculate converted quantity when input changes
  useEffect(() => {
    if (quantity && selectedUnit) {
      const converted = convertWeight(
        parseFloat(quantity),
        selectedUnit,
        material.weightUnit as WeightUnit
      );
      setConvertedQuantity(converted);
    } else {
      setConvertedQuantity(null);
    }
  }, [quantity, selectedUnit, material.weightUnit]);

  // Handle form submission
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData();
      formData.append("variantId", selectedVariant);
      formData.append("quantity", quantity);
      formData.append("fromUnit", selectedUnit);
      formData.append("toUnit", material.weightUnit);
      submit(formData, { method: "post" });
    },
    [selectedVariant, quantity, selectedUnit, material.weightUnit, submit]
  );

  // Show toast on action completion
  const toggleToast = useCallback(() => setToastActive((active) => !active), []);

  // Handle action results
  if (actionData?.success && !toastActive) {
    setToastMessage("Stock adjustment applied successfully");
    setToastError(false);
    setToastActive(true);
    // Reset form
    setSelectedVariant("");
    setQuantity("");
  } else if (actionData?.error && !toastActive) {
    setToastMessage(actionData.error);
    setToastError(true);
    setToastActive(true);
  }

  const variantRows = material.variants.map((variant) => {
    const estimatedUnits = estimateQuantity(
      material.totalWeight - material.weightCommitted,
      material.weightUnit as WeightUnit,
      variant.consumptionRequirement,
      variant.unitWeightUnit as WeightUnit
    );

    return [
      variant.variantName,
      `${variant.consumptionRequirement} ${variant.unitWeightUnit}`,
      estimatedUnits.toString(),
      <Badge
        key={variant.id}
        tone={
          material.totalWeight - material.weightCommitted >= variant.consumptionRequirement
            ? "success"
            : "critical"
        }
      >
        {material.totalWeight - material.weightCommitted >= variant.consumptionRequirement
          ? "Available"
          : "Insufficient Material"}
      </Badge>,
    ];
  });

  const stockMovementRows = material.stockMovements.map((movement) => {
    const variant = material.variants.find(
      (v) => v.variantId === movement.variantId
    );

    return [
      new Date(movement.createdAt).toLocaleString(),
      movement.type,
      variant?.variantName || "N/A",
      movement.quantityChange.toString(),
      movement.remainingStock.toString(),
    ];
  });

  return (
    <Page
      title={material.materialName}
      backAction={{ content: "Materials", url: "/app" }}
      primaryAction={
        <Button variant="primary" onClick={() => navigate(`/edit/materials/${material.id}`)}>
          Edit Material
        </Button>
      }
    >
      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={toggleToast}
          duration={4000}
        />
      )}
      <Layout>
        <Layout.Section>
          <Card>
            <div>
              <Text variant="headingMd" as="h3">Material Details</Text>
              <div style={{ marginTop: "1rem" }}>
                <Text variant="bodyMd" as="p">
                  Total Weight: {material.totalWeight} {material.weightUnit}
                </Text>
                <Text variant="bodyMd" as="p">
                  Weight Committed: {material.weightCommitted} {material.weightUnit}
                </Text>
                <Text variant="bodyMd" as="p">
                  Available Weight: {material.totalWeight - material.weightCommitted} {material.weightUnit}
                </Text>
                <Text variant="bodyMd" as="p">
                  Threshold: {material.threshold || "Not set"} {material.weightUnit}
                </Text>
              </div>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">Stock Adjustment</Text>
              <Form method="post" onSubmit={handleSubmit}>
                <FormLayout>
                  <Select
                    label="Variant (Optional)"
                    options={[
                      { label: "No Variant", value: "" },
                      ...material.variants.map(variant => ({
                        label: variant.variantName,
                        value: variant.variantId
                      }))
                    ]}
                    onChange={setSelectedVariant}
                    value={selectedVariant}
                    helpText="Leave empty for general stock adjustments (e.g., new cargo arrival)"
                  />
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6 }}>
                      <TextField
                        label="Quantity Change"
                        type="number"
                        value={quantity}
                        onChange={setQuantity}
                        autoComplete="off"
                        helpText="Positive numbers add stock, negative numbers reduce it"
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 6 }}>
                      <Select
                        label="Unit"
                        options={WEIGHT_UNITS}
                        onChange={(value) => setSelectedUnit(value as WeightUnit)}
                        value={selectedUnit}
                      />
                    </Grid.Cell>
                  </Grid>
                  {convertedQuantity !== null && (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Will {convertedQuantity >= 0 ? "add" : "remove"} {Math.abs(convertedQuantity)} {material.weightUnit} {convertedQuantity >= 0 ? "to" : "from"} total weight
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Current total weight: {material.totalWeight} {material.weightUnit}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Weight committed: {material.weightCommitted} {material.weightUnit}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Available weight: {material.totalWeight - material.weightCommitted} {material.weightUnit}
                      </Text>
                      {convertedQuantity < 0 && Math.abs(convertedQuantity) > (material.totalWeight - material.weightCommitted) && (
                        <Banner tone="warning">
                          Warning: This adjustment will result in insufficient available weight for committed orders.
                        </Banner>
                      )}
                    </BlockStack>
                  )}
                  <InlineStack gap="300">
                    <Button submit disabled={!quantity}>Apply Adjustment</Button>
                  </InlineStack>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {material.totalWeight - material.weightCommitted <= (material.threshold || 0) && (
            <Banner tone="critical" title="Low Stock Alert">
              <p>
                The available material weight is below the threshold. Consider restocking
                soon.
              </p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h3">Linked Variants</Text>
            <Box>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "text"]}
                headings={[
                  "Variant Name",
                  "Weight per Unit",
                  "Estimated Units",
                  "Status",
                ]}
                rows={variantRows}
              />
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h3">Stock Movement History</Text>
            <Box>
              <DataTable
              columnContentTypes={[
                "text",
                "text",
                "text",
                "numeric",
                "numeric",
              ]}
              headings={[
                "Date",
                "Type",
                "Variant",
                "Quantity Change",
                "Remaining Stock",
              ]}
                rows={stockMovementRows}
              />
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 