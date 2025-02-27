/**
 * VariantSelectorEdit Component
 * 
 * Purpose:
 * - Displays a list of all available Shopify variants
 * - Allows filtering variants by name or attribute
 * - Enables selecting variants to link to a material
 * - Provides input for consumption requirement when a variant is selected
 * 
 * Behavior:
 * - Shows search field for filtering variants
 * - Displays checkbox for each variant
 * - When variant is selected, shows consumption requirement input
 * - Selected variants appear in the LinkedVariantsSection (managed by parent)
 */

import { Card, ResourceList, ResourceItem, TextField, Text, BlockStack, Box, Spinner, EmptyState, Checkbox, InlineStack } from "@shopify/polaris";
import type { MaterialVariant } from "@prisma/client";
import type { SerializeFrom } from "@remix-run/node";
import { useState, useCallback, useEffect } from "react";

interface VariantSelectorEditProps {
  variants: SerializeFrom<MaterialVariant[]>;
  selectedVariants: Array<{
    id: string;
    consumptionRequirement: number;
  }>;
  onVariantSelect: (variantId: string) => void;
  onConsumptionUpdate: (variantId: string, consumption: string) => void;
  variantAttribute?: string;
  variantValue?: string;
  weightUnit: string;
}

export function VariantSelectorEdit({
  variants,
  selectedVariants,
  onVariantSelect,
  onConsumptionUpdate,
  variantAttribute,
  variantValue,
  weightUnit,
}: VariantSelectorEditProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [filteredVariants, setFilteredVariants] = useState(variants);

  const isVariantSelected = (variantId: string) =>
    selectedVariants.some((v) => v.id === variantId);

  const getConsumptionRequirement = (variantId: string) =>
    selectedVariants.find((v) => v.id === variantId)?.consumptionRequirement.toString() || "";

  useEffect(() => {
    setIsFiltering(true);
    const timeoutId = setTimeout(() => {
      const filtered = variants.filter(variant => {
        const variantNameLower = variant.variantName.toLowerCase();
        const searchQueryLower = searchQuery.toLowerCase();

        // If there's a search query, use it exclusively
        if (searchQueryLower !== "") {
          return variantNameLower.includes(searchQueryLower);
        }

        // Otherwise, use variant attribute and value if provided
        if (variantAttribute && variantValue) {
          const attributeValueLower = variantValue.toLowerCase();
          return variantNameLower.includes(attributeValueLower);
        }

        // If no filters are active, show all variants
        return true;
      });

      setFilteredVariants(filtered);
      setIsFiltering(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, variants, variantAttribute, variantValue]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const renderEmptyState = (message: string) => (
    <EmptyState
      heading="No variants found"
      image=""
    >
      <p>{message}</p>
    </EmptyState>
  );

  const activeFilter = searchQuery 
    ? `Searching for: "${searchQuery}"`
    : variantAttribute && variantValue 
      ? `Filtering by: ${variantAttribute} = ${variantValue}`
      : null;

  return (
    <Card>
      <BlockStack gap="400">
        <Box padding="400">
          <BlockStack gap="400">
            <Text variant="headingMd" as="h3">
              Link Product Variants
            </Text>
            <TextField
              label="Search variants"
              value={searchQuery}
              onChange={handleSearchChange}
              autoComplete="off"
              placeholder="Search by product name, variant name, or attributes"
              clearButton
              onClearButtonClick={() => setSearchQuery("")}
              helpText="Search will override attribute filters"
            />
            {activeFilter && (
              <Text variant="bodyMd" as="p" tone="subdued">
                {activeFilter}
              </Text>
            )}
          </BlockStack>
        </Box>
        {isFiltering ? (
          <Box padding="400">
            <div style={{ textAlign: 'center' }}>
              <Spinner accessibilityLabel="Loading variants" size="large" />
            </div>
          </Box>
        ) : filteredVariants.length === 0 ? (
          <Box padding="400">
            {renderEmptyState("Try adjusting your search or filter criteria")}
          </Box>
        ) : (
          <ResourceList
            resourceName={{ singular: "variant", plural: "variants" }}
            items={filteredVariants}
            renderItem={(variant) => {
              const isSelected = isVariantSelected(variant.variantId);
              return (
                <ResourceItem
                  id={variant.variantId}
                  onClick={(e: any) => {
                    e.preventDefault();
                    onVariantSelect(variant.variantId);
                  }}
                  verticalAlignment="center"
                >
                  <BlockStack gap="200">
                    <InlineStack gap="400" align="start">
                      <Checkbox
                        label=""
                        checked={isSelected}
                        onChange={() => onVariantSelect(variant.variantId)}
                      />
                      <Text variant="bodyMd" as="span">
                        {variant.variantName}
                      </Text>
                    </InlineStack>
                    {isSelected && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <TextField
                          label={`Material Required (${weightUnit})`}
                          type="number"
                          value={getConsumptionRequirement(variant.variantId)}
                          onChange={(value) => onConsumptionUpdate(variant.variantId, value)}
                          autoComplete="off"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    )}
                  </BlockStack>
                </ResourceItem>
              );
            }}
          />
        )}
      </BlockStack>
    </Card>
  );
} 