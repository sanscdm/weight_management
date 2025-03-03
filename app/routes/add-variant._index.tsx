import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  FormLayout,
  AppProvider,
  Banner,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { createMaterial } from "app/services/materialManagement.server";
import { WeightUnit } from "app/utils/weightConversion";

type ShopifyVariant = {
  id: string;
  title: string;
  product: {
    title: string;
  };
};

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");

  if (!variantId) {
    return redirect("/app");
  }

  // Fetch the specific variant details
  const response = await admin.graphql(
    `#graphql
      query getVariant($id: ID!) {
        productVariant(id: $id) {
          id
          title
          product {
            title
          }
        }
      }
    `,
    {
      variables: {
        id: variantId,
      },
    }
  );

  const responseJson = await response.json();
  const variant = responseJson.data.productVariant;

  if (!variant) {
    return redirect("/app");
  }

  return json({ 
    variant,
    polarisTranslations,
    apiKey: process.env.SHOPIFY_API_KEY || "" 
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const variantId = formData.get("variantId");
  const materialQuantity = formData.get("materialQuantity");
  const threshold = formData.get("threshold");
  const variantWeight = formData.get("variantWeight");
  const weightUnit = formData.get("weightUnit");

  if (!variantId || !materialQuantity || !threshold || !variantWeight || !weightUnit) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  try {
    await createMaterial({
      shopDomain: session.shop,
      materialName: `Material for ${formData.get("colorName")?.toString() || "Variant"}`,
      totalWeight: parseFloat(materialQuantity.toString()),
      weightUnit: weightUnit.toString() as WeightUnit,
      threshold: parseFloat(threshold.toString()),
      variants: [{
        id: variantId.toString(),
        consumptionRequirement: parseFloat(variantWeight.toString()),
        unitWeightUnit: weightUnit.toString() as WeightUnit
      }],
      request
    });

    return redirect("/app");
  } catch (error) {
    return json({ error: "Failed to create variant" }, { status: 500 });
  }
};

export default function AddVariant() {
  const { variant, polarisTranslations } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  
  const [formState, setFormState] = useState({
    materialQuantity: "",
    threshold: "",
    variantWeight: "",
    weightUnit: "kg"
  });

  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!formState.materialQuantity || !formState.threshold || !formState.variantWeight) {
      setError("All fields are required");
      return;
    }

    const formData = new FormData();
    formData.append("variantId", variant.id);
    formData.append("colorName", variant.title);
    formData.append("materialQuantity", formState.materialQuantity);
    formData.append("threshold", formState.threshold);
    formData.append("variantWeight", formState.variantWeight);
    formData.append("weightUnit", formState.weightUnit);

    submit(formData, { method: "post" });
  };

  return (
    <AppProvider i18n={polarisTranslations}>
      <Page
        title="Start Tracking Variant"
        backAction={{ content: "Back to Dashboard", onAction: () => navigate("/app") }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {error && (
                <Banner tone="critical">
                  <p>{error}</p>
                </Banner>
              )}
              <Card>
                <BlockStack gap="400">
                  <FormLayout>
                    <Text as="h2" variant="headingMd">
                      {variant.product.title} - {variant.title}
                    </Text>
                    <TextField
                      label="Weight per Unit"
                      type="number"
                      value={formState.variantWeight}
                      onChange={(value) => setFormState(prev => ({ ...prev, variantWeight: value }))}
                      autoComplete="off"
                      suffix={formState.weightUnit}
                      helpText="Enter the weight of one unit of this variant"
                    />
                    <TextField
                      label="Material Stock"
                      type="number"
                      value={formState.materialQuantity}
                      onChange={(value) => setFormState(prev => ({ ...prev, materialQuantity: value }))}
                      autoComplete="off"
                      suffix={formState.weightUnit}
                      helpText="Enter the current amount of material available for this variant"
                    />
                    <TextField
                      label="Threshold"
                      type="number"
                      value={formState.threshold}
                      onChange={(value) => setFormState(prev => ({ ...prev, threshold: value }))}
                      autoComplete="off"
                      suffix={formState.weightUnit}
                      helpText="Enter the minimum amount of material required before marking as out of stock"
                    />
                  </FormLayout>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <Button variant="primary" onClick={handleSubmit}>Start Tracking</Button>
                    <Button variant="plain" onClick={() => navigate("/app")}>Cancel</Button>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
} 