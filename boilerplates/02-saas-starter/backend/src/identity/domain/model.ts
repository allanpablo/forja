import type { Role } from '../../platform/auth/principal.js';

export interface Organization {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly ownerId: string;
}

export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly active: boolean;
}

/** E-mail é a identidade de login: global (o login não sabe o tenant), comparado em minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toSlug(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Nome da organização precisa ter letras ou números');
  return slug.slice(0, 60);
}

/** Portas de persistência: o domínio declara, os adaptadores TypeORM implementam. */
export interface IdentityRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string, tenantId: string): Promise<User | null>;
  listUsers(tenantId: string): Promise<User[]>;
  findOrganization(tenantId: string): Promise<Organization | null>;
  slugTaken(slug: string): Promise<boolean>;
  /** Cria a organização e o dono numa transação só: nunca um sem o outro. */
  createTenant(org: Organization, owner: User): Promise<void>;
}

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
