import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getMaterial } from "../services/materialManagement.server";
import type { Material, MaterialVariant, StockMovement } from "@prisma/client";

interface MaterialWithVariants extends Material {
  variants: MaterialVariant[];
  stockMovements: StockMovement[];
}

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

export default function MaterialDetails() {
  const { material } = useLoaderData<{ material: MaterialWithVariants }>();
  const navigate = useNavigate();
  const variantRows = material.variants.map((variant) => [
    variant.variantName,
    `${variant.consumptionRequirement} ${variant.unitWeightUnit}`,
    <Badge
      key={variant.id}
      tone={
        material.runningBalance >= variant.consumptionRequirement
          ? "success"
          : "critical"
      }
    >
      {material.runningBalance >= variant.consumptionRequirement
        ? "Available"
        : "Insufficient Material"}
    </Badge>,
  ]);

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
                  Running Balance: {material.runningBalance} {material.weightUnit}
                </Text>
                <Text variant="bodyMd" as="p">
                  Threshold: {material.threshold || "Not set"} {material.weightUnit}
                </Text>
              </div>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {material.runningBalance <= (material.threshold || 0) && (
            <Banner tone="critical" title="Low Stock Alert">
              <p>
                The material stock is below the threshold. Consider restocking
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
                columnContentTypes={["text", "text", "text"]}
                headings={[
                  "Variant Name",
                  "Weight per Unit",
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