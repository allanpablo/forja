import { apiClient } from './api-client';
import type { OrderResponse, CreateOrderRequest, OrderListResponse, UpdateOrderStatusRequest } from '@monorepo/shared-types';

export async function createOrder(data: CreateOrderRequest): Promise<OrderResponse> {
  const response = await apiClient.post<OrderResponse>('/orders', data);
  return response.data;
}

export async function getOrder(id: string): Promise<OrderResponse> {
  const response = await apiClient.get<OrderResponse>(`/orders/${id}`);
  return response.data;
}

export async function getUserOrders(page = 1, limit = 10): Promise<OrderListResponse> {
  const response = await apiClient.get<OrderListResponse>('/orders', {
    params: { page, limit },
  });
  return response.data;
}

export async function updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<OrderResponse> {
  const response = await apiClient.patch<OrderResponse>(`/orders/${id}/status`, data);
  return response.data;
}

export async function cancelOrder(id: string): Promise<void> {
  await apiClient.delete(`/orders/${id}`);
}
