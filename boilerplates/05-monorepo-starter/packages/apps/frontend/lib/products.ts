import { apiClient } from './api-client';
import type { ProductResponse, ProductListResponse, CreateProductRequest, UpdateProductRequest } from '@monorepo/shared-types';

export async function getProducts(page = 1, limit = 20): Promise<ProductListResponse> {
  const response = await apiClient.get<ProductListResponse>('/products', {
    params: { page, limit },
  });
  return response.data;
}

export async function getProduct(id: string): Promise<ProductResponse> {
  const response = await apiClient.get<ProductResponse>(`/products/${id}`);
  return response.data;
}

export async function createProduct(data: CreateProductRequest): Promise<ProductResponse> {
  const response = await apiClient.post<ProductResponse>('/products', data);
  return response.data;
}

export async function updateProduct(id: string, data: UpdateProductRequest): Promise<ProductResponse> {
  const response = await apiClient.put<ProductResponse>(`/products/${id}`, data);
  return response.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`);
}
