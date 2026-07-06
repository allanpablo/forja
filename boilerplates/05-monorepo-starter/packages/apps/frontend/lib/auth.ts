import { apiClient } from './api-client';
import type { UserResponse, LoginRequest, LoginResponse, CreateUserRequest } from '@monorepo/shared-types';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/users/login', data);
  if (response.data.token) {
    localStorage.setItem('jwt', response.data.token);
  }
  return response.data;
}

export async function register(data: CreateUserRequest): Promise<UserResponse> {
  const response = await apiClient.post<UserResponse>('/users/register', data);
  return response.data;
}

export async function getProfile(userId: string): Promise<UserResponse> {
  const response = await apiClient.get<UserResponse>(`/users/${userId}`);
  return response.data;
}

export function logout(): void {
  localStorage.removeItem('jwt');
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('jwt');
  }
  return null;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
