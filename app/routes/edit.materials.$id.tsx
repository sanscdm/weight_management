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
import { VariantSelectorEdit } from "../components/VariantSelectorEdit";
import { LinkedVariantsSection } from "../components/LinkedVariantsSection";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
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
  id: string;
  title: string;
  options?: {
    name: string;
    value: string;
  }[];
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
  const { session, admin } = await authenticate.admin(request);
  
  if (!params.id) {
    throw new Error("Material ID is required");
  }

  try {
    const formData = await request.formData();
    const materialName = formData.get("materialName") as string;
    const totalWeight = parseFloat(formData.get("totalWeight") as string);
    const weightUnit = formData.get("weightUnit") as string;
    const threshold = formData.get("threshold") as string;
    const variantAttribute = formData.get("variantAttribute") as string;
    const variantValue = formData.get("variantValue") as string;
    const selectedVariantsStr = formData.get("selectedVariants") as string;

    console.log('Action: Received selectedVariants:', selectedVariantsStr);

    let selectedVariants;
    try {
      selectedVariants = JSON.parse(selectedVariantsStr);
      console.log('Action: Parsed selectedVariants:', selectedVariants);

      if (!Array.isArray(selectedVariants)) {
        throw new Error("Invalid variant data");
      }

      // Fetch fresh variant data from Shopify for all variants
      const variantPromises = selectedVariants.map(async (variant) => {
        console.log('Action: Processing variant:', variant);

        const variantGid = variant.id.startsWith('gid://') 
          ? variant.id 
          : `gid://shopify/ProductVariant/${variant.id}`;

        const response = await admin.graphql(VARIANT_QUERY, {
          variables: { id: variantGid },
        });

        const responseJson = await response.json();
        console.log('Action: Shopify response for variant:', responseJson);

        if (!responseJson?.data?.productVariant) {
          throw new Error(`Failed to fetch variant data for ${variant.id}`);
        }

        const { productVariant } = responseJson.data;
        const processedVariant = {
          id: variant.id,
          variantId: variant.id,
          variantName: `${productVariant.product.title} - ${productVariant.title}`,
          consumptionRequirement: variant.consumptionRequirement || 0,
          unitWeight: 0
        };
        console.log('Action: Processed variant:', processedVariant);
        return processedVariant;
      });

      const processedVariants = await Promise.all(variantPromises);
      console.log('Action: All processed variants:', processedVariants);

      const material = await updateMaterial({
        id: params.id,
        shopDomain: session.shop,
        materialName,
        totalWeight,
        weightUnit,
        threshold: threshold ? parseFloat(threshold) : undefined,
        variantAttribute: variantAttribute || undefined,
        variantValue: variantValue || undefined,
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
  } catch (error: any) {
    console.error("Error updating material:", error);
    return json(
      { status: "error", error: error.message || "Failed to update material" },
      { status: 400 }
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
  const [weightUnit, setWeightUnit] = useState(initialMaterial.weightUnit);
  const [threshold, setThreshold] = useState(initialMaterial.threshold?.toString() || "");
  const [variantAttribute, setVariantAttribute] = useState(initialMaterial.variantAttribute || "");
  const [variantValue, setVariantValue] = useState(initialMaterial.variantValue || "");
  const [material, setMaterial] = useState(initialMaterial);
  const [selectedVariants, setSelectedVariants] = useState(
    initialMaterial.variants.map(v => ({
      id: v.variantId,
      consumptionRequirement: v.consumptionRequirement
    }))
  );
  const [showErrorToast, setShowErrorToast] = useState(false);

  useEffect(() => {
    if (actionData?.status === "error") {
      setShowErrorToast(true);
    }
  }, [actionData]);

  const handleSubmit = useCallback(() => {
    if (!materialName || !totalWeight || !weightUnit) {
      setShowErrorToast(true);
      return;
    }

    console.log('Current material state:', material);
    console.log('Selected variants before submit:', selectedVariants);

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
    
    // Include variant names from the current material state
    const validatedVariants = selectedVariants.map(v => {
      // Find the variant in material.variants to get its name
      const materialVariant = material.variants.find(mv => mv.variantId === v.id);
      // If not found in material variants, look in shopifyVariants
      const shopifyVariant = shopifyVariants.find((sv: typeof shopifyVariants[0]) => sv.variantId === v.id);
      
      console.log('Processing variant:', {
        id: v.id,
        materialVariant,
        shopifyVariant
      });

      return {
        ...v,
        variantName: materialVariant?.variantName || shopifyVariant?.variantName,
        consumptionRequirement: v.consumptionRequirement || 0
      };
    });
    
    console.log('Validated variants before save:', validatedVariants);
    formData.append("selectedVariants", JSON.stringify(validatedVariants));

    submit(formData, { method: "post" });
  }, [materialName, totalWeight, weightUnit, threshold, variantAttribute, variantValue, selectedVariants, material, shopifyVariants, submit]);

  const handleVariantSelect = useCallback((variantId: string) => {
    setSelectedVariants((prev) => {
      const isSelected = prev.some((v) => v.id === variantId);
      if (isSelected) {
        return prev.filter((v) => v.id !== variantId);
      }
      
      // Find the variant in shopifyVariants to get its name
      const shopifyVariant = shopifyVariants.find((v: typeof shopifyVariants[0]) => v.variantId === variantId);
      if (!shopifyVariant) return prev;

      // Add to selectedVariants with consumption requirement
      return [...prev, { id: variantId, consumptionRequirement: 0 }];
    });

    // Also update the material.variants state when adding a new variant
    if (!material.variants.some((v: SerializedMaterialVariant) => v.variantId === variantId)) {
      const shopifyVariant = shopifyVariants.find((v: typeof shopifyVariants[0]) => v.variantId === variantId);
      if (shopifyVariant) {
        setMaterial(prev => ({
          ...prev,
          variants: [...prev.variants, {
            id: '',  // This will be set by the database
            materialId: material.id,
            variantId: variantId,
            variantName: shopifyVariant.variantName,
            unitWeight: 0,
            consumptionRequirement: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }]
        }));
      }
    }
  }, [material, shopifyVariants]);

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
    
    setMaterial((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.variantId !== variantId)
    }));
  }, []);

  const linkedVariantRows = material.variants.map((variant) => [
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
      backAction={{ content: "Back to Material", url: `/app/materials/${material.id}` }}
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
                </BlockStack>
              </Card>

              <LinkedVariantsSection
                variants={material.variants}
                onUnlinkVariant={handleUnlinkVariant}
                weightUnit={weightUnit}
              />

              <VariantSelectorEdit
                variants={shopifyVariants}
                selectedVariants={selectedVariants}
                onVariantSelect={handleVariantSelect}
                onConsumptionUpdate={handleConsumptionUpdate}
                variantAttribute={variantAttribute}
                variantValue={variantValue}
                weightUnit={weightUnit}
              />

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