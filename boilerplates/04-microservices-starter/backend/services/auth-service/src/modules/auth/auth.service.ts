import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TokenPair, AuthPayload } from 'shared';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private users: Map<string, User> = new Map();
  private tokenBlacklist: Set<string> = new Set();

  constructor(private jwtService: JwtService) {
    this.initializeWithTestUser();
  }

  private initializeWithTestUser() {
    // Initialize with test user for demo purposes
    const testUserPassword = bcrypt.hashSync('TestPassword123!', 12);
    const testUser: User = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      passwordHash: testUserPassword,
      createdAt: new Date(),
    };
    this.users.set(testUser.email, testUser);
  }

  async register(email: string, password: string, name?: string): Promise<TokenPair> {
    // Validate input
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    if (!this.isValidPassword(password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters with uppercase, lowercase, and number',
      );
    }

    // Check if user exists
    if (this.users.has(email)) {
      throw new BadRequestException('Email is already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const newUser: User = {
      id: this.generateUserId(),
      email,
      passwordHash,
      createdAt: new Date(),
    };

    this.users.set(email, newUser);

    // Generate tokens
    return this.generateTokens(newUser.id, email);
  }

  async login(email: string, password: string): Promise<TokenPair> {
    // Find user
    const user = this.users.get(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  async validateToken(token: string): Promise<AuthPayload> {
    if (this.tokenBlacklist.has(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    try {
      return await this.jwtService.verifyAsync(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const payload = await this.validateToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = Array.from(this.users.values()).find((u) => u.id === payload.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(user.id, user.email);
  }

  async logout(token: string): Promise<void> {
    this.tokenBlacklist.add(token);
  }

  private generateTokens(userId: string, email: string): TokenPair {
    const payload: AuthPayload = {
      userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshPayload: AuthPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPassword(password: string): boolean {
    return (
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password)
    );
  }
}
