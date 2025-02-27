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

import { Card, ResourceList, ResourceItem, TextField, Text, BlockStack, Box, Spinner, EmptyState, Checkbox, InlineStack, Select } from "@shopify/polaris";
import type { MaterialVariant } from "@prisma/client";
import type { SerializeFrom } from "@remix-run/node";
import { useState, useCallback } from "react";
import { WeightUnit, estimateQuantity } from "../utils/weightConversion";

const WEIGHT_UNITS = [
  { label: "Kilograms", value: "kg" },
  { label: "Grams", value: "g" },
  { label: "Pounds", value: "lb" },
  { label: "Ounces", value: "oz" },
];

interface VariantSelectorProps {
  variants: SerializeFrom<MaterialVariant[]>;
  selectedVariants: Array<{
    id: string;
    consumptionRequirement: number;
    unitWeightUnit: WeightUnit;
  }>;
  onVariantSelect: (variantId: string) => void;
  onConsumptionUpdate: (variantId: string, consumption: string) => void;
  onUnitWeightUnitUpdate: (variantId: string, unit: WeightUnit) => void;
  weightUnit: WeightUnit;
  materialQuantity: number;
}

export function VariantSelector({
  variants,
  selectedVariants,
  onVariantSelect,
  onConsumptionUpdate,
  onUnitWeightUnitUpdate,
  weightUnit,
  materialQuantity,
}: VariantSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const isVariantSelected = useCallback(
    (variantId: string) => selectedVariants.some((v) => v.id === variantId),
    [selectedVariants]
  );

  const getConsumptionRequirement = useCallback(
    (variantId: string) => {
      const variant = selectedVariants.find((v) => v.id === variantId);
      return variant ? variant.consumptionRequirement.toString() : "0";
    },
    [selectedVariants]
  );

  const getUnitWeightUnit = useCallback(
    (variantId: string) => {
      const variant = selectedVariants.find((v) => v.id === variantId);
      return variant ? variant.unitWeightUnit : "kg";
    },
    [selectedVariants]
  );

  const getEstimatedQuantity = useCallback(
    (variantId: string) => {
      const variant = selectedVariants.find((v) => v.id === variantId);
      if (!variant || !variant.consumptionRequirement) return 0;
      
      return estimateQuantity(
        materialQuantity,
        weightUnit as WeightUnit,
        variant.consumptionRequirement,
        variant.unitWeightUnit as WeightUnit
      );
    },
    [selectedVariants, materialQuantity, weightUnit]
  );

  return (
    <Card>
      <BlockStack gap="400">
        <TextField
          label="Search variants"
          value={searchQuery}
          onChange={setSearchQuery}
          autoComplete="off"
          placeholder="Search by name..."
        />
        {variants.length === 0 ? (
          <EmptyState heading="No variants found" image="">
            <p>No variants are available to select.</p>
          </EmptyState>
        ) : (
          <ResourceList
            resourceName={{ singular: "variant", plural: "variants" }}
            items={variants.filter((variant) =>
              variant.variantName.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            renderItem={(variant) => {
              const isSelected = isVariantSelected(variant.id);
              const estimatedQty = getEstimatedQuantity(variant.id);

              return (
                <ResourceItem 
                  id={variant.id}
                  onClick={() => {}}
                >
                  <BlockStack gap="200">
                    <InlineStack gap="200" align="space-between">
                      <Checkbox
                        label={variant.variantName}
                        checked={isSelected}
                        onChange={() => onVariantSelect(variant.id)}
                      />
                    </InlineStack>

                    {isSelected && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" align="start">
                            <TextField
                              label="Weight per Unit"
                              type="number"
                              value={getConsumptionRequirement(variant.id)}
                              onChange={(value) => onConsumptionUpdate(variant.id, value)}
                              autoComplete="off"
                              min={0}
                              step={0.01}
                            />
                            <Select
                              label="Unit"
                              options={WEIGHT_UNITS}
                              value={getUnitWeightUnit(variant.id)}
                              onChange={(value) => onUnitWeightUnitUpdate(variant.id, value as WeightUnit)}
                            />
                          </InlineStack>

                          <Text as="p" variant="bodyMd">
                            Estimated Quantity: {estimatedQty} units
                          </Text>
                        </BlockStack>
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