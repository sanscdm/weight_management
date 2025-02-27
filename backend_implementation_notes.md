# Backend Implementation Notes for Material Registration

## Overview
This document outlines the backend implementation requirements for the material registration system. The system allows users to register materials with their weights and link them to Shopify product variants.

## Frontend Integration

### Frontend Tech Stack
- Built with Remix.js
- Uses Shopify Polaris components
- TypeScript for type safety
- Form handling with native FormData

### Frontend Data Requirements

1. **Variant Fetching**
   ```typescript
   // Expected response structure for GET /api/variants
   interface ShopifyVariant {
     id: string;
     title: string;
     weight: number;
     shopifyWeight: number; // Original weight from Shopify
     attributes: string[]; // Used for auto-matching (e.g., ["Red", "Wood"])
     weightUnit: string;
   }
   ```

2. **Material Creation Response**
   ```typescript
   // Expected response for POST /materials
   interface MaterialCreationResponse {
     success: boolean;
     material: {
       id: string;
       materialName: string;
       totalWeight: number;
       weightUnit: string;
       runningBalance: number;
       threshold?: number;
       variants: Array<{
         id: string;
         variantId: string;
         variantName: string;
         consumptionRequirement: number;
       }>;
     };
   }
   ```

### Frontend Features to Support

1. **Auto-matching Variants**
   - Frontend splits material name into search terms
   - Matches against variant attributes
   - Backend should provide normalized attributes for matching

2. **Weight Unit Handling**
   - Frontend allows unit selection (kg, g, oz, lb)
   - All measurements use the same unit
   - Backend must handle conversions if needed

3. **Validation Requirements**
   - Frontend performs basic validation
   - Backend should provide detailed validation errors:
   ```typescript
   interface ValidationError {
     field: string;
     message: string;
     code: string;
     params?: Record<string, any>;
   }
   ```

4. **Error Scenarios**
   The frontend handles these error cases:
   - Network errors
   - Validation errors
   - Shopify API errors
   - Duplicate materials
   - Missing variants

### Frontend State Management

1. **Form State**
   - Material details (name, weight, unit, threshold)
   - Selected variants with consumption requirements
   - Validation state
   - Loading states

2. **Loading States**
   Backend should support:
   ```typescript
   interface LoadingStates {
     isCreating: boolean;
     isLoadingVariants: boolean;
     validationInProgress: boolean;
   }
   ```

### API Response Times

Frontend expectations:
- Variant fetch: < 1s
- Material creation: < 2s
- Validation: < 500ms

If operations take longer, implement:
- Progress indicators
- Optimistic updates
- Background processing with webhooks

### Error Handling Integration

1. **Frontend Error Display**
   ```typescript
   interface ApiError {
     code: string;
     message: string;
     field?: string;
     suggestion?: string;
     recoverable: boolean;
   }
   ```

2. **Recovery Flows**
   - Retry mechanisms for network errors
   - Save draft functionality
   - Conflict resolution for concurrent edits

### Pagination & Performance

1. **Variant Listing**
   ```typescript
   interface PaginatedResponse<T> {
     items: T[];
     pageInfo: {
       hasNextPage: boolean;
       endCursor: string;
     };
   }
   ```

2. **Search & Filtering**
   - Support material name search
   - Filter by variant attributes
   - Sort by various fields

### Real-time Updates

If implementing real-time features:
1. **WebSocket Events**
   ```typescript
   interface MaterialUpdate {
     type: 'MATERIAL_UPDATED' | 'STOCK_CHANGED' | 'VARIANT_LINKED';
     materialId: string;
     data: any;
     timestamp: string;
   }
   ```

2. **Status Updates**
   - Stock level changes
   - Threshold alerts
   - Variant updates

### Testing Integration

Frontend provides:
- Test data fixtures
- Mock API responses
- E2E test scenarios
- Integration test cases

### Development Workflow

1. **API Documentation**
   - OpenAPI/Swagger specs
   - Type definitions
   - Example requests/responses

2. **Local Development**
   - Mock API endpoints
   - Test data generation
   - Development environment setup

3. **Debugging Support**
   - Detailed error logging
   - Request/response debugging
   - Performance monitoring

## Database Schema
The schema is already defined in `prisma/schema.prisma` with the following key models:
- `Material`: Stores material details and weight information
- `MaterialVariant`: Links materials to Shopify variants with consumption requirements
- `StockMovement`: Tracks changes in material stock

## API Endpoints to Implement

### 1. Material Registration Endpoint
**Route**: `POST /materials`
**Authentication**: Requires Shopify admin authentication

**Request Payload Structure**:
```typescript
{
  materialName: string;
  totalWeight: number;
  weightUnit: "kg" | "g" | "oz" | "lb";
  threshold?: number;
  variants: {
    [variantId: string]: {
      consumptionRequirement: number;
    }
  }
}
```

**Implementation Steps**:
1. Validate the incoming data
   - Ensure all numbers are positive
   - Verify weightUnit is one of the allowed values
   - Check that totalWeight is provided
   - Validate that materialName is not empty

2. Create Material record
   ```typescript
   const material = await prisma.material.create({
     data: {
       shopDomain: session.shop, // From Shopify session
       materialName,
       totalWeight,
       weightUnit,
       runningBalance: totalWeight, // Initially equals totalWeight
       threshold,
     }
   });
   ```

3. Create MaterialVariant records
   ```typescript
   await Promise.all(
     Object.entries(variants).map(([variantId, data]) =>
       prisma.materialVariant.create({
         data: {
           materialId: material.id,
           variantId,
           variantName: "", // Fetch from Shopify API
           unitWeight: data.consumptionRequirement,
         }
       })
     )
   );
   ```

### 2. Shopify Variant Fetch Endpoint
**Route**: `GET /api/variants`
**Authentication**: Requires Shopify admin authentication

**Implementation Notes**:
1. Use Shopify Admin API to fetch variants
2. Required fields:
   - Variant ID
   - Title
   - Weight
   - Product title
   - Any color/material attributes

```typescript
// Example Shopify GraphQL query
const VARIANTS_QUERY = `
  query {
    products(first: 50) {
      edges {
        node {
          title
          variants(first: 50) {
            edges {
              node {
                id
                title
                weight
                weightUnit
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;
```

## Error Handling

Implement consistent error responses:
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  }
}
```

Common error codes to implement:
- `INVALID_INPUT`: Validation errors
- `DUPLICATE_MATERIAL`: Material name already exists
- `VARIANT_NOT_FOUND`: Referenced variant doesn't exist
- `SHOPIFY_API_ERROR`: Failed to fetch variant data
- `DATABASE_ERROR`: Database operation failed

## Unit Conversion Utilities

Implement weight unit conversion utilities:
```typescript
export const convertWeight = (
  value: number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit
): number => {
  // Conversion logic
};

// Usage in material creation:
if (weightUnit !== 'kg') {
  totalWeight = convertWeight(totalWeight, weightUnit, 'kg');
}
```

## Stock Movement Implementation

When creating a new material, create an initial stock movement:
```typescript
await prisma.stockMovement.create({
  data: {
    materialId: material.id,
    type: 'INITIAL',
    quantityChange: totalWeight,
    remainingStock: totalWeight,
  }
});
```

## Testing Requirements

1. Unit Tests:
   - Weight conversion utilities
   - Input validation
   - Error handling

2. Integration Tests:
   - Material creation flow
   - Variant linking
   - Stock movement creation

3. Test Cases to Cover:
   - Valid material creation
   - Duplicate material names
   - Invalid weight units
   - Missing required fields
   - Variant not found scenarios

## Monitoring Considerations

Implement logging for:
- Material creation events
- Weight unit conversions
- Shopify API calls
- Validation errors
- Database operations

## Performance Considerations

1. Batch Operations:
   - Use `prisma.$transaction` for atomic operations
   - Batch variant creation

2. Caching:
   - Cache Shopify variant data
   - Implement cache invalidation on variant updates

## Security Considerations

1. Input Sanitization:
   - Validate and sanitize all user inputs
   - Implement rate limiting
   - Verify Shopify session authentication

2. Data Access:
   - Ensure materials are scoped to shop
   - Validate variant ownership
   - Implement proper CORS policies

## Next Steps

1. Implement the material creation endpoint
2. Set up Shopify API integration
3. Implement unit conversion utilities
4. Add validation layer
5. Set up error handling
6. Add monitoring and logging
7. Implement test suite

## Questions?

If you have any questions about:
- Shopify API integration
- Database schema details
- Business logic requirements
- Testing requirements

Please reach out to the team lead. 