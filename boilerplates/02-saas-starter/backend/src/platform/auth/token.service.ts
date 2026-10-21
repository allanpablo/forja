import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ROLES, type Principal, type Role } from './principal.js';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface Claims {
  sub: string;
  tid: string;
  roles: Role[];
  typ: 'access' | 'refresh';
}

/** Tokens de acesso (15 min) e de renovação (7 dias) com segredos distintos e tipo explícito. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(principal: Principal): Promise<TokenPair> {
    const base = { sub: principal.userId, tid: principal.tenantId, roles: [...principal.roles] };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, typ: 'access' }, { secret: this.config.jwtSecret, expiresIn: '15m' }),
      this.jwt.signAsync({ ...base, typ: 'refresh' }, { secret: this.config.jwtRefreshSecret, expiresIn: '7d' }),
    ]);
    return { accessToken, refreshToken };
  }

  verifyAccess(token: string): Promise<Principal> {
    return this.verify(token, this.config.jwtSecret, 'access');
  }

  verifyRefresh(token: string): Promise<Principal> {
    return this.verify(token, this.config.jwtRefreshSecret, 'refresh');
  }

  private async verify(token: string, secret: string, typ: Claims['typ']): Promise<Principal> {
    let claims: Claims;
    try {
      claims = await this.jwt.verifyAsync<Claims>(token, { secret });
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r)) : [];
    if (claims.typ !== typ || !claims.sub || !claims.tid) throw new UnauthorizedException('Token inválido ou expirado');
    return { userId: claims.sub, tenantId: claims.tid, roles };
  }
}
