import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Badge,
  BlockStack,
  Banner,
  Text,
  InlineStack,
  Box,
  Popover,
  ActionList,
  LegacyCard,
  LegacyStack,
  TextContainer,
  ProgressBar,
  TextField,
  Select,
  Filters,
  ButtonGroup,
} from "@shopify/polaris";
import { useEffect, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, Link, useNavigate, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import type { MaterialWithVariants } from "../services/materialManagement.server";
import { getAllMaterials } from "../services/materialManagement.server";

type MaterialStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

type SerializedMaterial = SerializeFrom<MaterialWithVariants>;

function getMaterialStatus(material: SerializedMaterial): MaterialStatus {
  const availableWeight = material.totalWeight - material.weightCommitted;
  if (availableWeight <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (material.threshold && availableWeight <= material.threshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const materials = await getAllMaterials(session.shop);

  return json({ materials });
};

export default function MaterialsList() {
  const { materials } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MaterialStatus>('all');

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.materialName.toLowerCase().includes(searchValue.toLowerCase());
    const materialStatus = getMaterialStatus(material);
    const matchesStatus = statusFilter === 'all' || materialStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const rows = filteredMaterials.map((material) => [
    <Link to={`/app/materials/${material.id}`} key={material.id}>
      <Text variant="bodyMd" as="span">
        {material.materialName}
      </Text>
    </Link>,
    `${material.totalWeight} ${material.weightUnit}`,
    `${material.weightCommitted} ${material.weightUnit}`,
    material.variants.length.toString(),
    <Badge
      key={material.id}
      tone={
        material.totalWeight - material.weightCommitted <= (material.threshold || 0)
          ? "critical"
          : material.totalWeight - material.weightCommitted <= (material.threshold || 0) * 1.2
          ? "warning"
          : "success"
      }
    >
      {material.totalWeight - material.weightCommitted <= (material.threshold || 0)
        ? "Out of Stock"
        : material.totalWeight - material.weightCommitted <= (material.threshold || 0) * 1.2
        ? "Low Stock"
        : "In Stock"}
    </Badge>,
    <ButtonGroup key={`actions-${material.id}`}>
      <Button onClick={() => navigate(`/app/materials/${material.id}`)}>
        View
      </Button>
      <Button onClick={() => navigate(`/edit/materials/${material.id}`)}>
        Edit
      </Button>
    </ButtonGroup>
  ]);

  return (
    <Page
      title="Materials"
      primaryAction={
        <Button variant="primary" onClick={() => navigate("/app/materials/new")}>
          Register New Material
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          {materials.length === 0 ? (
            <Banner
              title="Get started by registering your first material"
              action={{ content: "Register Material", onAction: () => navigate("/app/materials/new") }}
              tone="info"
            >
              <p>
                Track your material inventory by registering materials and linking
                them to your product variants.
              </p>
            </Banner>
          ) : (
            <LegacyCard>
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                headings={[
                  "Material Name",
                  "Total Weight",
                  "Weight Committed",
                  "Linked Variants",
                  "Status",
                  "Actions"
                ]}
                rows={rows}
              />
            </LegacyCard>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
