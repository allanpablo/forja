// Product API Types
export interface CreateProductRequest {
  sku: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
}

export interface ProductResponse {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price?: number;
  stockQuantity?: number;
}

export interface ProductListResponse {
  products: ProductResponse[];
  total: number;
  page: number;
  limit: number;
}
