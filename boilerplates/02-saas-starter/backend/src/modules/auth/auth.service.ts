import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { User } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { SignupDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private orgRepository: Repository<Organization>,
    private jwtService: JwtService,
  ) {}

  async signup(signupDto: SignupDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: signupDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    const tenantId = uuid();
    const passwordHash = await bcrypt.hash(signupDto.password, 12);

    const user = this.userRepository.create({
      tenantId,
      email: signupDto.email,
      passwordHash,
      roles: ['owner'],
      status: 'active',
    });

    await this.userRepository.save(user);

    const org = this.orgRepository.create({
      tenantId,
      name: signupDto.organizationName,
      slug: signupDto.organizationName.toLowerCase().replace(/\s+/g, '-'),
      ownerId: user.id,
      plan: 'free',
    });

    await this.orgRepository.save(org);

    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
      },
      ...tokens,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return null;
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const org = await this.orgRepository.findOne({
      where: { tenantId: user.tenantId },
    });

    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
      },
      ...tokens,
    };
  }

  private generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: user.roles,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'dev-secret-key',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    });

    return { accessToken, refreshToken };
  }

  verifyRefreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      });
      return payload;
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
