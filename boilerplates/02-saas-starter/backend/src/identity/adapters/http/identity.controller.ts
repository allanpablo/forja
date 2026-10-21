import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, type Principal } from '../../../platform/auth/principal.js';
import { JwtAuthGuard } from '../../../platform/auth/jwt-auth.guard.js';
import { RequireRoles, RolesGuard } from '../../../platform/auth/roles.guard.js';
import { AuthService } from '../../application/auth.service.js';
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../../domain/model.js';
import { LoginDto, RefreshDto, SignupDto } from './auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

@ApiTags('identity')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class IdentityController {
  constructor(@Inject(IDENTITY_REPOSITORY) private readonly repo: IdentityRepository) {}

  @Get('me')
  async me(@CurrentPrincipal() principal: Principal) {
    const user = await this.repo.findUserById(principal.userId, principal.tenantId);
    if (!user) throw new NotFoundException();
    return { id: user.id, email: user.email, roles: user.roles };
  }

  @Get('organization')
  async organization(@CurrentPrincipal() principal: Principal) {
    const org = await this.repo.findOrganization(principal.tenantId);
    if (!org) throw new NotFoundException();
    return org;
  }

  @Get('users')
  @RequireRoles('owner', 'admin')
  async users(@CurrentPrincipal() principal: Principal) {
    return (await this.repo.listUsers(principal.tenantId)).map((u) => ({ id: u.id, email: u.email, roles: u.roles, active: u.active }));
  }
}
