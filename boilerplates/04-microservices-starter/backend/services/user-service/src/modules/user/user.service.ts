import { Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile, UserSettings } from 'shared';

interface StoredUser {
  userId: string;
  email: string;
  fullName: string;
  avatar?: string;
  bio?: string;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  private users: Map<string, StoredUser> = new Map();

  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      bio: user.bio,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async createUserProfile(email: string, fullName: string, avatar?: string): Promise<UserProfile> {
    const userId = `user-${Date.now()}`;
    const now = new Date();

    const user: StoredUser = {
      userId,
      email,
      fullName,
      avatar,
      emailVerified: false,
      settings: {
        theme: 'auto',
        notificationsEnabled: true,
        language: 'en',
        timeZone: 'UTC',
      },
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(userId, user);

    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'fullName' | 'avatar' | 'bio'>>,
  ): Promise<UserProfile> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (updates.fullName) user.fullName = updates.fullName;
    if (updates.avatar) user.avatar = updates.avatar;
    if (updates.bio) user.bio = updates.bio;

    user.updatedAt = new Date();

    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      bio: user.bio,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    user.settings = { ...user.settings, ...settings };
    user.updatedAt = new Date();

    return user.settings;
  }

  async verifyEmail(userId: string): Promise<UserProfile> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.updatedAt = new Date();

    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      bio: user.bio,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async deleteUser(userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.users.delete(userId);
  }

  async listUsers(limit: number = 10, offset: number = 0): Promise<{ users: UserProfile[]; total: number }> {
    const allUsers = Array.from(this.users.values());
    const total = allUsers.length;
    const paginatedUsers = allUsers.slice(offset, offset + limit);

    return {
      users: paginatedUsers.map((user) => ({
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
      total,
    };
  }
}
