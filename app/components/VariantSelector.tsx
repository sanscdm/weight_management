/**
 * VariantSelector Component for New Materials
 * 
 * Purpose:
 * - Displays a list of all available Shopify variants for new materials
 * - Allows filtering variants by name or attribute
 * - Enables selecting variants to link to a material
 * - Provides input for consumption requirement when a variant is selected
 * 
 * Behavior:
 * - Shows search field for filtering variants
 * - Displays checkbox for each variant
 * - When variant is selected, shows consumption requirement input
 * - Selected variants appear in the LinkedVariantsSection (managed by parent)
 * - Pre-selects variants based on attribute matching (if provided)
 * 
 * Filtering Logic:
 * 1. Initial State:
 *    - Shows all available variants
 *    - If variantAttribute and variantValue are set, pre-selects matching variants
 * 
 * 2. Search Filtering:
 *    - Filters by variant name (product title + variant title)
 *    - Takes precedence over attribute filtering
 * 
 * 3. Attribute Filtering:
 *    - Matches variant options (e.g., Color = Red)
 *    - Also matches in variant name as fallback
 *    - Used when no search query is active
 * 
 * 4. Auto-selection:
 *    - Happens when variantAttribute and variantValue change
 *    - Only selects variants that exactly match the attribute criteria
 */

import { Card, ResourceList, ResourceItem, TextField, Text, BlockStack, Box, Spinner, EmptyState, Checkbox, InlineStack } from "@shopify/polaris";
import type { MaterialVariant } from "@prisma/client";
import { useState, useCallback, useEffect } from "react";

interface ShopifyVariant {
  id: string;
  variantName: string;
  options?: {
    name: string;
    value: string;
  }[];
}

interface VariantSelectorProps {
  variants: ShopifyVariant[];
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

export function VariantSelector({
  variants,
  selectedVariants,
  onVariantSelect,
  onConsumptionUpdate,
  variantAttribute,
  variantValue,
  weightUnit,
}: VariantSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [filteredVariants, setFilteredVariants] = useState(variants);

  const isVariantSelected = (variantId: string) =>
    selectedVariants.some((v) => v.id === variantId);

  const getConsumptionRequirement = (variantId: string) =>
    selectedVariants.find((v) => v.id === variantId)?.consumptionRequirement.toString() || "";

  // Helper function to check if a variant matches the attribute criteria
  const matchesAttributeCriteria = useCallback((variant: ShopifyVariant) => {
    if (!variantAttribute || !variantValue) return true;

    // First try to match by options
    const matchingOption = variant.options?.find(
      opt => opt.name.toLowerCase() === variantAttribute.toLowerCase() &&
            opt.value.toLowerCase() === variantValue.toLowerCase()
    );
    if (matchingOption) return true;

    // Fallback to matching in name
    const searchTerm = `${variantAttribute} ${variantValue}`.toLowerCase();
    return variant.variantName.toLowerCase().includes(searchTerm);
  }, [variantAttribute, variantValue]);

  // Update filtered variants when search or attributes change
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

        // Otherwise, use attribute filtering
        return matchesAttributeCriteria(variant);
      });

      setFilteredVariants(filtered);
      setIsFiltering(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, variants, matchesAttributeCriteria]);

  // Auto-select variants when attribute criteria change
  useEffect(() => {
    if (variantAttribute && variantValue) {
      variants.forEach(variant => {
        const matchingOption = variant.options?.find(
          opt => opt.name.toLowerCase() === variantAttribute.toLowerCase() &&
                opt.value.toLowerCase() === variantValue.toLowerCase()
        );
        
        if (matchingOption && !isVariantSelected(variant.id)) {
          onVariantSelect(variant.id);
        }
      });
    }
  }, [variantAttribute, variantValue, variants, onVariantSelect]);

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
              Available Variants
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
              const isSelected = isVariantSelected(variant.id);
              return (
                <ResourceItem
                  id={variant.id}
                  onClick={(e: any) => {
                    e.preventDefault();
                    onVariantSelect(variant.id);
                  }}
                  verticalAlignment="center"
                >
                  <BlockStack gap="200">
                    <InlineStack gap="400" align="start">
                      <Checkbox
                        label=""
                        checked={isSelected}
                        onChange={() => onVariantSelect(variant.id)}
                      />
                      <Text variant="bodyMd" as="span">
                        {variant.variantName}
                      </Text>
                    </InlineStack>
                    {variant.options && variant.options.length > 0 && (
                      <Text variant="bodySm" as="p" tone="subdued">
                        {variant.options.map(opt => `${opt.name}: ${opt.value}`).join(', ')}
                      </Text>
                    )}
                    {isSelected && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <TextField
                          label={`Material Required (${weightUnit})`}
                          type="number"
                          value={getConsumptionRequirement(variant.id)}
                          onChange={(value) => onConsumptionUpdate(variant.id, value)}
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