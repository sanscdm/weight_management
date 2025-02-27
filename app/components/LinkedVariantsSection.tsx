import {
  Card,
  BlockStack,
  Text,
  DataTable,
  ButtonGroup,
  Button,
} from "@shopify/polaris";
import type { MaterialVariant } from "@prisma/client";
import type { SerializeFrom } from "@remix-run/node";

interface LinkedVariantsSectionProps {
  variants: SerializeFrom<MaterialVariant[]>;
  onUnlinkVariant: (variantId: string) => void;
  weightUnit: string;
}

export function LinkedVariantsSection({
  variants,
  onUnlinkVariant,
  weightUnit,
}: LinkedVariantsSectionProps) {
  const linkedVariantRows = variants.map((variant) => [
    variant.variantName,
    variant.consumptionRequirement.toString() + " " + weightUnit,
    <ButtonGroup key={variant.variantId}>
      <Button
        tone="critical"
        onClick={() => onUnlinkVariant(variant.variantId)}
      >
        Unlink
      </Button>
    </ButtonGroup>
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h3">Currently Linked Variants</Text>
        {linkedVariantRows.length > 0 ? (
          <DataTable
            columnContentTypes={["text", "text", "text"]}
            headings={["Variant Name", "Consumption Requirement", "Actions"]}
            rows={linkedVariantRows}
          />
        ) : (
          <Text tone="subdued" as="p">No variants are currently linked to this material.</Text>
        )}
      </BlockStack>
    </Card>
  );
} 