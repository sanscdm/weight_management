/**
 * New Material Page
 * 
 * Purpose:
 * - Register new materials
 * - Link variants to the material
 * - Set consumption requirements
 * 
 * Behavior:
 * 1. Material Details Section:
 *    - Enter basic material information
 *    - Set threshold and variant filters
 * 
 * 2. Linked Variants Section:
 *    - Shows variants selected for linking
 *    - Allows removing variants before saving
 *    - Displays consumption requirements
 * 
 * 3. Variant Selector:
 *    - Search and filter available variants
 *    - Select variants to link
 *    - Set consumption requirements
 *    - Auto-selects variants based on attribute matching
 * 
 * Note: Changes are only saved when clicking "Register Material"
 *
 * Loading and Filtering Behavior:
 * 1. Initial Load:
 *    - Fetches all available Shopify variants
 *    - Displays them in the VariantSelector
 * 
 * 2. Filtering Logic:
 *    - By Search: Direct text search in variant names
 *    - By Attribute: When variantAttribute and variantValue are set
 *      - First tries to match variant options (e.g., Color = Red)
 *      - Then tries to match in variant name
 *    - Auto-selection: Automatically selects variants matching the attribute criteria
 * 
 * 3. Data Flow:
 *    - Loader → All variants available
 *    - VariantSelector → Filtered view based on search/attributes
 *    - LinkedVariantsSection → Shows selected variants
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Form,
  FormLayout,
  TextField,
  Card,
  Button,
  Select,
  Text,
  Banner,
  Toast,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState, useCallback, useEffect } from "react";
import { createMaterial } from "../services/materialManagement.server";
import type { Material, MaterialVariant, StockMovement } from "@prisma/client";
import { VariantSelector } from "../components/VariantSelector";
import { LinkedVariantsSection } from "../components/LinkedVariantsSection";

interface ShopifyVariant {
  id: string;
  title: string;
  options?: {
    name: string;
    value: string;
  }[];
}

interface MaterialWithVariants extends Material {
  variants: MaterialVariant[];
  stockMovements: StockMovement[];
}

const WEIGHT_UNITS = [
  { label: "Kilograms (kg)", value: "kg" },
  { label: "Grams (g)", value: "g" },
  { label: "Pounds (lb)", value: "lb" },
  { label: "Ounces (oz)", value: "oz" },
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // Fetch variants from Shopify
    const response = await admin.graphql(VARIANTS_QUERY, {
      variables: { first: 100 },
    });

    const data = await response.json();
    const variants = data.data.productVariants.edges.map(
      ({ node }: any) => ({
        id: node.id.replace('gid://shopify/ProductVariant/', ''),
        variantName: `${node.product.title} - ${node.title}`,
        options: node.selectedOptions.map((opt: any) => ({
          name: opt.name,
          value: opt.value
        }))
      })
    );

    return json({ 
      variants,
      status: "success" 
    });
  } catch (error) {
    console.error("Error fetching variants:", error);
    return json({ 
      variants: [], 
      status: "error",
      error: "Failed to fetch variants" 
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const materialName = formData.get("materialName") as string;
    const totalWeight = parseFloat(formData.get("totalWeight") as string);
    const weightUnit = formData.get("weightUnit") as string;
    const threshold = formData.get("threshold") as string;
    const variantAttribute = formData.get("variantAttribute") as string;
    const variantValue = formData.get("variantValue") as string;
    
    // Validate required fields
    if (!materialName || !totalWeight || !weightUnit) {
      return json(
        { 
          status: "error", 
          error: "Material name, total weight, and weight unit are required" 
        },
        { status: 400 }
      );
    }

    // Parse and validate selected variants
    const selectedVariantsStr = formData.get("selectedVariants");
    if (!selectedVariantsStr) {
      return json(
        { 
          status: "error", 
          error: "No variants selected" 
        },
        { status: 400 }
      );
    }

    let selectedVariants;
    try {
      selectedVariants = JSON.parse(selectedVariantsStr as string);
      
      // Validate variant data
      if (!Array.isArray(selectedVariants) || !selectedVariants.length) {
        throw new Error("Invalid variant data");
      }

      // Fetch variant names from Shopify for each selected variant
      const variantPromises = selectedVariants.map(async (variant) => {
        const variantGid = variant.id.startsWith('gid://') 
          ? variant.id 
          : `gid://shopify/ProductVariant/${variant.id}`;

        const response = await admin.graphql(
          `query getVariant($id: ID!) {
            productVariant(id: $id) {
              id
              title
              product {
                title
              }
            }
          }`,
          { variables: { id: variantGid } }
        );

        const responseJson = await response.json();
        const variantData = responseJson.data.productVariant;

        return {
          id: variant.id,
          variantName: `${variantData.product.title} - ${variantData.title}`,
          consumptionRequirement: variant.consumptionRequirement || 0,
          unitWeight: 0 // This could be fetched from Shopify if needed
        };
      });

      const processedVariants = await Promise.all(variantPromises);

      // Create the material with the processed variants
      const material = await createMaterial({
        shopDomain: session.shop,
        materialName,
        totalWeight,
        weightUnit,
        threshold: threshold ? parseFloat(threshold) : undefined,
        variantAttribute: variantAttribute || undefined,
        variantValue: variantValue || undefined,
        variants: processedVariants,
        request,
      });

      if (!material) {
        throw new Error("Failed to create material");
      }

      return redirect(`/app/materials/${material.id}`);
    } catch (error: any) {
      console.error('Error processing variants:', error);
      return json(
        { 
          status: "error", 
          error: error.message || "Failed to process variant data" 
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error creating material:", error);
    return json(
      { 
        status: "error", 
        error: error.message || "Failed to create material" 
      },
      { status: 400 }
    );
  }
};

type ActionData = 
  | { status: "success"; material: MaterialWithVariants }
  | { status: "error"; error: string };

export default function NewMaterial() {
  const { variants } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [materialName, setMaterialName] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [threshold, setThreshold] = useState("");
  const [variantAttribute, setVariantAttribute] = useState("");
  const [variantValue, setVariantValue] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Array<{ id: string; consumptionRequirement: number }>>([]);
  const [showErrorToast, setShowErrorToast] = useState(false);

  useEffect(() => {
    if (actionData?.status === "error") {
      setShowErrorToast(true);
    }
  }, [actionData]);

  const handleSubmit = useCallback(() => {
    // Validate form data
    if (!materialName || !totalWeight || !weightUnit) {
      setShowErrorToast(true);
      return;
    }

    if (!selectedVariants.length) {
      setShowErrorToast(true);
      return;
    }

    const formData = new FormData();
    formData.append("materialName", materialName);
    formData.append("totalWeight", totalWeight);
    formData.append("weightUnit", weightUnit);
    
    if (threshold) {
      formData.append("threshold", threshold);
    }
    if (variantAttribute) {
      formData.append("variantAttribute", variantAttribute);
    }
    if (variantValue) {
      formData.append("variantValue", variantValue);
    }
    
    // Ensure all variants have consumption requirements
    const validatedVariants = selectedVariants.map(v => ({
      ...v,
      consumptionRequirement: v.consumptionRequirement || 0
    }));
    
    formData.append("selectedVariants", JSON.stringify(validatedVariants));

    submit(formData, { method: "post" });
  }, [materialName, totalWeight, weightUnit, threshold, variantAttribute, variantValue, selectedVariants, submit]);

  const handleVariantSelect = useCallback((variantId: string) => {
    setSelectedVariants((prev) => {
      const isSelected = prev.some((v) => v.id === variantId);
      if (isSelected) {
        return prev.filter((v) => v.id !== variantId);
      }
      return [...prev, { id: variantId, consumptionRequirement: 0 }];
    });
  }, []);

  const handleConsumptionUpdate = useCallback((variantId: string, consumption: string) => {
    setSelectedVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, consumptionRequirement: parseFloat(consumption) || 0 }
          : v
      )
    );
  }, []);

  const handleUnlinkVariant = useCallback((variantId: string) => {
    setSelectedVariants((prev) => prev.filter((v) => v.id !== variantId));
  }, []);

  return (
    <Page
      title="Register New Material"
      backAction={{ content: "Materials", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {showErrorToast && (
            <Toast
              content={actionData?.status === "error" ? actionData.error : "Please fill in all required fields"}
              error
              onDismiss={() => setShowErrorToast(false)}
            />
          )}

          <Form onSubmit={handleSubmit}>
            <FormLayout>
              <Card>
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
                    />
                    <Select
                      label="Weight Unit*"
                      options={WEIGHT_UNITS}
                      value={weightUnit}
                      onChange={setWeightUnit}
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
                  <FormLayout.Group>
                    <TextField
                      label="Variant Attribute"
                      value={variantAttribute}
                      onChange={setVariantAttribute}
                      autoComplete="off"
                      placeholder="e.g., Color, Size"
                      helpText="The type of variant attribute to filter by"
                    />
                    <TextField
                      label="Variant Value"
                      value={variantValue}
                      onChange={setVariantValue}
                      autoComplete="off"
                      placeholder="e.g., Red, Large"
                      helpText="The specific value of the variant attribute"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </Card>

              <LinkedVariantsSection
                variants={selectedVariants.map(v => {
                  const matchingVariant = variants.find((variant: ShopifyVariant) => variant.id === v.id);
                  return {
                    variantId: v.id,
                    variantName: matchingVariant?.variantName || '',
                    consumptionRequirement: v.consumptionRequirement,
                    materialId: '',
                    id: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    unitWeight: 0
                  };
                })}
                onUnlinkVariant={handleUnlinkVariant}
                weightUnit={weightUnit}
              />

              <VariantSelector
                variants={variants}
                selectedVariants={selectedVariants}
                onVariantSelect={handleVariantSelect}
                onConsumptionUpdate={handleConsumptionUpdate}
                variantAttribute={variantAttribute}
                variantValue={variantValue}
                weightUnit={weightUnit}
              />

              <Button submit variant="primary">
                Register Material
              </Button>
            </FormLayout>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 