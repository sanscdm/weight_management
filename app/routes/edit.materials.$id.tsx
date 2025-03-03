/**
 * Edit Material Page
 * 
 * Purpose:
 * - Edit existing material details
 * - Manage linked variants (view, unlink, add new)
 * - Update consumption requirements
 * 
 * Behavior:
 * 1. Material Details Section:
 *    - Edit basic material information
 *    - Set/update threshold and variant filters
 * 
 * 2. Linked Variants Section:
 *    - Shows currently linked variants
 *    - Allows unlinking variants
 *    - Displays consumption requirements
 * 
 * 3. Variant Selector:
 *    - Search and filter available variants
 *    - Add new variants to the material
 *    - Set consumption requirements for newly added variants
 * 
 * Note: Changes are only saved when clicking "Save Changes"
 * 
 * IMPORTANT IMPLEMENTATION DETAILS:
 * 
 * 1. Variant Data Structure:
 *    - variantId: The Shopify variant ID (without gid:// prefix)
 *    - variantName: Must be formatted as "Product Title - Variant Title"
 *    - consumptionRequirement: Number representing material usage per variant
 *    - unitWeight: Base weight of the variant (default 0)
 * 
 * 2. Data Flow for Variants:
 *    a) Loading:
 *       - Fetch existing material variants with names
 *       - Fetch all available Shopify variants
 *       - Both should have proper variantName format
 * 
 *    b) Selection:
 *       - When adding new variant: Use variantName from shopifyVariants
 *       - When unlinking: Remove from selectedVariants state
 *       - Always maintain consumptionRequirement value
 * 
 *    c) Saving:
 *       - Must fetch fresh variant data from Shopify
 *       - Must include complete variant information
 *       - Must format variantName as "Product Title - Variant Title"
 * 
 * 3. Critical Points:
 *    - Never save just the variant ID as the name
 *    - Always fetch fresh data before saving
 *    - Maintain proper name format throughout
 */

import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Text,
  Form,
  Toast,
  BlockStack,
  DataTable,
  ButtonGroup,
  Icon,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type SerializeFrom } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import type { Material, MaterialVariant } from "@prisma/client";
import { getMaterial, updateMaterial } from "../services/materialManagement.server";
import { VariantSelector } from "../components/VariantSelector";
import { LinkedVariantsSection } from "../components/LinkedVariantsSection";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { WeightUnit } from "../utils/weightConversion";
import { estimateQuantity } from "../utils/weightConversion";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const WEIGHT_UNITS = [
  { label: "Kilograms", value: "kg" },
  { label: "Grams", value: "g" },
  { label: "Pounds", value: "lb" },
  { label: "Ounces", value: "oz" },
];

// GraphQL query to fetch variants with their options
const VARIANTS_QUERY = `
  query getVariants($first: Int!) {
    productVariants(first: $first) {
      edges {
        node {
          id
          title
          selectedOptions {
            name
            value
          }
          product {
            title
          }
        }
      }
    }
  }
`;

const VARIANT_QUERY = `
  query getVariant($id: ID!) {
    productVariant(id: $id) {
      id
      title
      product {
        title
      }
    }
  }
`;

interface MaterialWithVariants extends Material {
  variants: MaterialVariant[];
}

type SerializedMaterialVariant = SerializeFrom<MaterialVariant>;

interface ShopifyVariant {
  variantId: string;
  variantName: string;
}

interface SelectedVariant {
  id: string;
  variantName: string;
  consumptionRequirement: number;
  unitWeightUnit: WeightUnit;
}

interface ProcessedVariant {
  id: string;
  variantId: string;
  variantName: string;
  consumptionRequirement: number;
  unitWeightUnit: WeightUnit;
  estimatedQuantity: number;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!params.id) {
    throw new Error("Material ID is required");
  }

  const material = await getMaterial(params.id);
  
  if (!material || material.shopDomain !== session.shop) {
    throw new Error("Material not found");
  }

  // Fetch all available variants from Shopify
  try {
    // First, fetch the names for existing variants
    const variantPromises = material.variants.map(async (variant) => {
      const variantGid = variant.variantId.startsWith('gid://') 
        ? variant.variantId 
        : `gid://shopify/ProductVariant/${variant.variantId}`;

      const response = await admin.graphql(VARIANT_QUERY, {
        variables: { id: variantGid },
      });

      const responseJson = await response.json();
      if (responseJson?.data?.productVariant) {
        const { productVariant } = responseJson.data;
        return {
          ...variant,
          variantName: `${productVariant.product.title} - ${productVariant.title}`,
        };
      }
      return variant;
    });

    const updatedVariants = await Promise.all(variantPromises);
    material.variants = updatedVariants;

    // Then fetch all available variants
    const response = await admin.graphql(VARIANTS_QUERY, {
      variables: { first: 100 },
    });

    const data = await response.json();
    const shopifyVariants = data.data.productVariants.edges.map(
      ({ node }: any) => ({
        id: node.id.replace('gid://shopify/ProductVariant/', ''),
        variantId: node.id.replace('gid://shopify/ProductVariant/', ''),
        variantName: `${node.product.title} - ${node.title}`,
        options: node.selectedOptions,
        unitWeight: 0,
        consumptionRequirement: 0,
      })
    );

    return json({ material, shopifyVariants });
  } catch (error) {
    console.error("Error fetching variants:", error);
    return json({ material, shopifyVariants: [], error: "Failed to fetch variants" });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const materialName = formData.get("materialName");
    const totalWeightStr = formData.get("totalWeight");
    const weightUnit = formData.get("weightUnit");
    const thresholdStr = formData.get("threshold");
    const selectedVariantsStr = formData.get("selectedVariants");

    if (!materialName || !totalWeightStr || !weightUnit || !selectedVariantsStr || 
        typeof materialName !== 'string' || typeof weightUnit !== 'string') {
      return json(
        { status: "error", error: "Material name, total weight, and variants are required" },
        { status: 400 }
      );
    }

    const totalWeight = parseFloat(totalWeightStr.toString());

    let selectedVariants;
    try {
      selectedVariants = JSON.parse(selectedVariantsStr.toString());
      
      if (!Array.isArray(selectedVariants)) {
        throw new Error("Invalid variant data");
      }

      const processedVariants: ProcessedVariant[] = selectedVariants.map(variant => ({
        id: variant.id,
        variantId: variant.id,
        variantName: variant.variantName,
        consumptionRequirement: variant.consumptionRequirement,
        unitWeightUnit: variant.unitWeightUnit,
        estimatedQuantity: estimateQuantity(
          totalWeight,
          weightUnit as WeightUnit,
          variant.consumptionRequirement,
          variant.unitWeightUnit
        )
      }));

      const material = await updateMaterial({
        id: params.id as string,
        shopDomain: session.shop,
        materialName,
        totalWeight,
        weightUnit: weightUnit as WeightUnit,
        threshold: thresholdStr ? parseFloat(thresholdStr.toString()) : undefined,
        variants: processedVariants,
      });

      if (!material) {
        throw new Error("Failed to update material");
      }

      return redirect(`/app/materials/${material.id}`);
    } catch (error) {
      console.error('Action: Error processing variants:', error);
      return json(
        { status: "error", error: "Failed to process variant data" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Action: Error:', error);
    return json(
      { status: "error", error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
};

type ActionData = 
  | { status: "success"; material: MaterialWithVariants }
  | { status: "error"; error: string };

export default function EditMaterial() {
  const { material: initialMaterial, shopifyVariants } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [materialName, setMaterialName] = useState(initialMaterial.materialName);
  const [totalWeight, setTotalWeight] = useState(initialMaterial.totalWeight.toString());
  const [weightUnit, setWeightUnit] = useState<WeightUnit>((initialMaterial.weightUnit as WeightUnit) || "kg");
  const [threshold, setThreshold] = useState(initialMaterial.threshold?.toString() || "");
  const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>(
    initialMaterial.variants.map((variant: any) => ({
      id: variant.variantId,
      variantName: variant.variantName,
      consumptionRequirement: variant.consumptionRequirement,
      unitWeightUnit: (variant.unitWeightUnit as WeightUnit) || "kg"
    }))
  );

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    if (actionData) {
      if (actionData.status === "success") {
        setToastMessage("Material updated successfully");
        setToastError(false);
      } else {
        setToastMessage(actionData.error);
        setToastError(true);
      }
      setToastActive(true);
    }
  }, [actionData]);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("materialName", materialName);
    formData.append("totalWeight", totalWeight);
    formData.append("weightUnit", weightUnit);
    if (threshold) {
      formData.append("threshold", threshold);
    }
    formData.append("selectedVariants", JSON.stringify(selectedVariants));

    submit(formData, { method: "post" });
  }, [materialName, totalWeight, weightUnit, threshold, selectedVariants, submit]);

  const handleVariantSelect = useCallback((variantId: string) => {
    if (!initialMaterial.variants.some((v) => v.variantId === variantId)) {
      const shopifyVariant = shopifyVariants.find((v: ShopifyVariant) => v.variantId === variantId);
      if (shopifyVariant) {
        const newVariant: SelectedVariant = {
          id: variantId,
          variantName: shopifyVariant.variantName,
          consumptionRequirement: 0,
          unitWeightUnit: weightUnit
        };
        setSelectedVariants(prev => [...prev, newVariant]);
      }
    }
  }, [initialMaterial.variants, shopifyVariants, weightUnit]);

  const handleConsumptionUpdate = useCallback((variantId: string, consumption: string) => {
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, consumptionRequirement: parseFloat(consumption) || 0 }
          : v
      )
    );
  }, []);

  const handleUnitWeightUnitUpdate = useCallback((variantId: string, unit: WeightUnit) => {
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, unitWeightUnit: unit }
          : v
      )
    );
  }, []);

  const handleUnlinkVariant = useCallback((variantId: string) => {
    setSelectedVariants((prev) => prev.filter((v) => v.id !== variantId));
  }, []);

  const linkedVariantRows = initialMaterial.variants.map((variant) => [
    variant.variantName,
    variant.consumptionRequirement.toString() + " " + weightUnit,
    <ButtonGroup key={variant.variantId}>
      <Button
        tone="critical"
        onClick={() => handleUnlinkVariant(variant.variantId)}
      >
        Unlink
      </Button>
    </ButtonGroup>
  ]);

  return (
    <Page
      title="Edit Material"
      backAction={{ content: "Back to Material", url: `/app/materials/${initialMaterial.id}` }}
    >
      <Layout>
        <Layout.Section>
          {toastActive && (
            <Toast
              content={toastMessage}
              error={toastError}
              onDismiss={() => setToastActive(false)}
            />
          )}

          <Form onSubmit={handleSubmit}>
            <FormLayout>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Material Details</Text>
                  <FormLayout>
                    <TextField
                      label="Material Name*"
                      value={materialName}
                      onChange={setMaterialName}
                      autoComplete="off"
                    />
                    <FormLayout.Group>
                      <TextField
                        label="Total Weight*"
                        value={totalWeight}
                        onChange={setTotalWeight}
                        type="number"
                        autoComplete="off"
                        disabled={selectedVariants.length > 0}
                        helpText={selectedVariants.length > 0 ? "Total weight cannot be modified when variants are linked" : undefined}
                      />
                      <Select
                        label="Weight Unit"
                        options={WEIGHT_UNITS}
                        value={weightUnit}
                        onChange={(value) => setWeightUnit(value as WeightUnit)}
                        name="weightUnit"
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Threshold"
                      value={threshold}
                      onChange={setThreshold}
                      type="number"
                      autoComplete="off"
                      helpText="Set a minimum threshold for low stock alerts"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <LinkedVariantsSection
                variants={initialMaterial.variants}
                onUnlinkVariant={handleUnlinkVariant}
                weightUnit={weightUnit}
              />

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Linked Variants</Text>
                  <VariantSelector
                    variants={shopifyVariants}
                    selectedVariants={selectedVariants}
                    onVariantSelect={handleVariantSelect}
                    onConsumptionUpdate={handleConsumptionUpdate}
                    onUnitWeightUnitUpdate={handleUnitWeightUnitUpdate}
                    weightUnit={weightUnit}
                    materialQuantity={parseFloat(totalWeight)}
                  />
                </BlockStack>
              </Card>

              <Button submit variant="primary">
                Save Changes
              </Button>
            </FormLayout>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 