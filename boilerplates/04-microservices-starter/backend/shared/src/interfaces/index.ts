// HTTP Response types
export interface ServiceResponse<T> {
  data?: T;
  error?: ServiceError;
  meta: ResponseMeta;
}

export interface ServiceError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: string;
  requestId: string;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  processingTime: number;
}

// Request context
export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  tenantId?: string;
  timestamp: string;
  userAgent?: string;
  ipAddress?: string;
}

// Auth types
export interface AuthPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// User types
export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  avatar?: string;
  bio?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  notificationsEnabled: boolean;
  language: string;
  timeZone: string;
}

// Notification types
export interface NotificationRequest {
  userId: string;
  type: 'email' | 'push' | 'sms';
  recipient: string;
  subject?: string;
  body: string;
  template?: string;
  templateVars?: Record<string, any>;
}

export interface Notification {
  notificationId: string;
  userId: string;
  type: 'email' | 'push' | 'sms';
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  recipient: string;
  subject?: string;
  body: string;
  retries: number;
  createdAt: string;
  sentAt?: string;
}

// Domain Events
export interface DomainEvent<T = any> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  timestamp: string;
  version: number;
  data: T;
  metadata: {
    userId?: string;
    correlationId: string;
    source: string;
  };
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  name?: string;
}

export interface UserEmailVerifiedEvent {
  userId: string;
  email: string;
}

export interface PasswordResetRequestedEvent {
  userId: string;
  email: string;
  resetToken: string;
}

// Health checks
export interface HealthCheck {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  checks: Record<string, HealthCheckDetail>;
}

export interface HealthCheckDetail {
  status: 'UP' | 'DOWN';
  error?: string;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page?: number;
    limit?: number;
    offset?: number;
    total: number;
    pages?: number;
  };
}
