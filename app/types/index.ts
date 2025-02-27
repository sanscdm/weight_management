export interface Material {
  id: string;
  materialName: string;
  totalWeight: number;
  runningBalance: number;
  threshold?: number;
  createdAt: string;
  updatedAt: string;
  variants: MaterialVariant[];
  stockMovements: StockMovement[];
}

export interface MaterialVariant {
  id: string;
  materialId: string;
  variantId: string;
  variantName: string;
  consumptionRequirement: number;
  unitWeightUnit: string;
  estimatedQuantity?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  materialId: string;
  variantId?: string;
  type: 'FULFILLMENT' | 'FULFILLMENT_CANCELLED' | 'MANUAL_ADJUSTMENT';
  quantityChange: number;
  remainingStock: number;
  orderId?: string;
  createdAt: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  weight?: number;
  weightUnit?: string;
  product: {
    title: string;
  };
}

export interface MaterialSummary {
  id: string;
  materialName: string;
  totalWeight: number;
  runningBalance: number;
  threshold?: number;
  linkedVariantsCount: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
} 