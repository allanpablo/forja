import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../platform/auth/token.service.js';
import type { IdentityRepository, Organization, User } from '../domain/model.js';
import { AuthService } from './auth.service.js';

class InMemoryIdentity implements IdentityRepository {
  users: User[] = [];
  orgs: Organization[] = [];
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findUserById(id: string, tenantId: string) { return this.users.find((u) => u.id === id && u.tenantId === tenantId) ?? null; }
  async listUsers(tenantId: string) { return this.users.filter((u) => u.tenantId === tenantId); }
  async findOrganization(tenantId: string) { return this.orgs.find((o) => o.tenantId === tenantId) ?? null; }
  async slugTaken(slug: string) { return this.orgs.some((o) => o.slug === slug); }
  async createTenant(org: Organization, owner: User) { this.orgs.push(org); this.users.push(owner); }
}

const config = { jwtSecret: 'a'.repeat(40), jwtRefreshSecret: 'b'.repeat(40) } as never;
const setup = () => {
  const repo = new InMemoryIdentity();
  const tokens = new TokenService(new JwtService({}), config);
  return { repo, tokens, auth: new AuthService(repo, tokens) };
};
const signup = { email: 'Dona@Empresa.com', password: 'Senha-Forte-123', organizationName: 'Empresa X' };

describe('AuthService', () => {
  it('cadastro cria tenant, organização e dona, e devolve tokens', async () => {
    const { repo, auth, tokens } = setup();
    const session = await auth.signup(signup);
    expect(repo.orgs).toHaveLength(1);
    expect(repo.users[0]).toMatchObject({ email: 'dona@empresa.com', roles: ['owner'], tenantId: repo.orgs[0].tenantId });
    const principal = await tokens.verifyAccess(session.accessToken);
    expect(principal).toEqual({ userId: repo.users[0].id, tenantId: repo.orgs[0].tenantId, roles: ['owner'] });
  });

  it('e-mail repetido (qualquer caixa) é recusado', async () => {
    const { auth } = setup();
    await auth.signup(signup);
    await expect(auth.signup({ ...signup, email: 'DONA@empresa.com' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('slug em uso ganha sufixo em vez de colidir', async () => {
    const { auth, repo } = setup();
    await auth.signup(signup);
    await auth.signup({ ...signup, email: 'outra@empresa.com' });
    expect(repo.orgs[0].slug).toBe('empresa-x');
    expect(repo.orgs[1].slug).toMatch(/^empresa-x-[0-9a-f]{6}$/);
  });

  it('login com senha errada ou e-mail inexistente dá a mesma resposta', async () => {
    const { auth } = setup();
    await auth.signup(signup);
    await expect(auth.login('dona@empresa.com', 'errada')).rejects.toThrow('E-mail ou senha inválidos');
    await expect(auth.login('ninguem@empresa.com', 'errada')).rejects.toThrow('E-mail ou senha inválidos');
  });

  it('refresh token não serve como access token, e vice-versa', async () => {
    const { auth, tokens } = setup();
    const session = await auth.signup(signup);
    await expect(tokens.verifyAccess(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refresh(session.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    const renewed = await auth.refresh(session.refreshToken);
    expect(renewed.accessToken).toBeTypeOf('string');
  });

  it('refresh de usuário desativado é recusado', async () => {
    const { auth, repo } = setup();
    const session = await auth.signup(signup);
    repo.users[0] = { ...repo.users[0], active: false };
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
