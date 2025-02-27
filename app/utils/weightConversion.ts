// Weight conversion factors
const CONVERSION_FACTORS: Record<WeightUnit, Record<WeightUnit, number>> = {
  kg: {
    kg: 1,
    g: 1000,
    lb: 2.20462,
    oz: 35.274
  },
  g: {
    kg: 0.001,
    g: 1,
    lb: 0.00220462,
    oz: 0.035274
  },
  lb: {
    kg: 0.453592,
    g: 453.592,
    lb: 1,
    oz: 16
  },
  oz: {
    kg: 0.0283495,
    g: 28.3495,
    lb: 0.0625,
    oz: 1
  }
};

export type WeightUnit = 'kg' | 'g' | 'lb' | 'oz';

/**
 * Converts a weight value from one unit to another
 */
export function convertWeight(value: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) return value;
  return value * CONVERSION_FACTORS[fromUnit][toUnit];
}

/**
 * Estimates the number of items that can be produced based on material quantity and unit weight
 */
export function estimateQuantity(
  materialQuantity: number,
  materialUnit: WeightUnit,
  unitWeight: number,
  unitWeightUnit: WeightUnit
): number {
  // Convert material quantity to the same unit as unit weight for accurate calculation
  const convertedMaterialQuantity = convertWeight(materialQuantity, materialUnit, unitWeightUnit);
  return Math.floor(convertedMaterialQuantity / unitWeight);
}

/**
 * Formats a weight value with its unit
 */
export function formatWeight(value: number, unit: WeightUnit): string {
  return `${value.toFixed(2)} ${unit}`;
} 