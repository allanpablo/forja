import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TokenService, type TokenPair } from '../../platform/auth/token.service.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import { IDENTITY_REPOSITORY, normalizeEmail, toSlug, type IdentityRepository } from '../domain/model.js';

export interface SignupInput {
  readonly email: string;
  readonly password: string;
  readonly organizationName: string;
}

export interface Session extends TokenPair {
  readonly user: { readonly id: string; readonly email: string; readonly roles: readonly string[] };
  readonly organization: { readonly id: string; readonly name: string; readonly slug: string };
}

/** Hash usado quando o e-mail não existe, para o tempo de resposta não revelar quem tem conta. */
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_REPOSITORY) private readonly repo: IdentityRepository,
    private readonly tokens: TokenService,
  ) {}

  async signup(input: SignupInput): Promise<Session> {
    const email = normalizeEmail(input.email);
    if (await this.repo.findUserByEmail(email)) throw new ConflictException('E-mail já cadastrado');

    let slug = toSlug(input.organizationName);
    if (await this.repo.slugTaken(slug)) slug = `${slug}-${randomUUID().slice(0, 6)}`;

    const tenantId = randomUUID();
    const owner = { id: randomUUID(), tenantId, email, passwordHash: await hashPassword(input.password), roles: ['owner' as const], active: true };
    const org = { id: randomUUID(), tenantId, name: input.organizationName.trim(), slug, ownerId: owner.id };
    await this.repo.createTenant(org, owner);
    return this.session(owner, org);
  }

  async login(emailInput: string, password: string): Promise<Session> {
    const user = await this.repo.findUserByEmail(normalizeEmail(emailInput));
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.active) throw new UnauthorizedException('E-mail ou senha inválidos');
    const org = await this.repo.findOrganization(user.tenantId);
    if (!org) throw new UnauthorizedException('E-mail ou senha inválidos');
    return this.session(user, org);
  }

  /** Renova o par a partir de um refresh token válido, relendo papéis e status atuais do usuário. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const principal = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.repo.findUserById(principal.userId, principal.tenantId);
    if (!user?.active) throw new UnauthorizedException('Sessão inválida');
    return this.tokens.issue({ userId: user.id, tenantId: user.tenantId, roles: user.roles });
  }

  private async session(user: { id: string; tenantId: string; email: string; roles: readonly ('owner' | 'admin' | 'member')[] }, org: { id: string; name: string; slug: string }): Promise<Session> {
    const pair = await this.tokens.issue({ userId: user.id, tenantId: user.tenantId, roles: user.roles });
    return { ...pair, user: { id: user.id, email: user.email, roles: user.roles }, organization: { id: org.id, name: org.name, slug: org.slug } };
  }
}
