export const SERVICES = {
  AUTH: 'auth-service',
  USER: 'user-service',
  NOTIFICATION: 'notification-service',
} as const;

export const SERVICE_PORTS = {
  API_GATEWAY: 3000,
  AUTH_SERVICE: 3001,
  USER_SERVICE: 3002,
  NOTIFICATION_SERVICE: 3003,
} as const;

export const RABBITMQ_CONFIG = {
  HOST: process.env.RABBITMQ_HOST || 'rabbitmq',
  PORT: parseInt(process.env.RABBITMQ_PORT || '5672'),
  USER: process.env.RABBITMQ_USER || 'guest',
  PASSWORD: process.env.RABBITMQ_PASSWORD || 'guest',
  VHOST: process.env.RABBITMQ_VHOST || '/',
} as const;

export const REDIS_CONFIG = {
  HOST: process.env.REDIS_HOST || 'redis',
  PORT: parseInt(process.env.REDIS_PORT || '6379'),
  DB: parseInt(process.env.REDIS_DB || '0'),
} as const;

export const DB_CONFIG = {
  AUTH_DB: {
    HOST: process.env.POSTGRES_AUTH_HOST || 'postgres-auth',
    PORT: parseInt(process.env.POSTGRES_AUTH_PORT || '5432'),
    USERNAME: process.env.POSTGRES_AUTH_USER || 'postgres',
    PASSWORD: process.env.POSTGRES_AUTH_PASSWORD || 'password',
    DATABASE: process.env.POSTGRES_AUTH_DB || 'auth_db',
  },
  USER_DB: {
    HOST: process.env.POSTGRES_USER_HOST || 'postgres-user',
    PORT: parseInt(process.env.POSTGRES_USER_PORT || '5432'),
    USERNAME: process.env.POSTGRES_USER_USER || 'postgres',
    PASSWORD: process.env.POSTGRES_USER_PASSWORD || 'password',
    DATABASE: process.env.POSTGRES_USER_DB || 'users_db',
  },
} as const;

export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  
  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  UNAUTHORIZED_UPDATE: 'UNAUTHORIZED_UPDATE',
  INVALID_EMAIL: 'INVALID_EMAIL',
  
  // Notification
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Generic
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2,
  INITIAL_DELAY_MS: 100,
  MAX_DELAY_MS: 10000,
} as const;

export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  ALGORITHM: 'HS256',
} as const;

export const RATE_LIMITS = {
  LOGIN: { attempts: 5, windowMs: 15 * 60 * 1000 },
  REGISTER: { attempts: 3, windowMs: 60 * 60 * 1000 },
  API: { requests: 100, windowMs: 60 * 1000 },
} as const;
