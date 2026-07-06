// Order API Types
export interface OrderItemRequest {
  productId: string;
  quantity: number;
}

export interface OrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
  shippingAddress: string;
}

export interface OrderResponse {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  totalAmount: number;
  items: OrderItemResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateOrderStatusRequest {
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}

export interface OrderListResponse {
  orders: OrderResponse[];
  total: number;
  page: number;
}
