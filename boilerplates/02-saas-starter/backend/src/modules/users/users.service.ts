import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findById(id: string, tenantId: string) {
    return this.userRepository.findOne({
      where: { id, tenantId },
    });
  }

  async findByEmail(email: string, tenantId: string) {
    return this.userRepository.findOne({
      where: { email, tenantId },
    });
  }

  async create(tenantId: string, email: string, passwordHash: string) {
    const user = this.userRepository.create({
      tenantId,
      email,
      passwordHash,
      roles: ['member'],
    });
    return this.userRepository.save(user);
  }

  async updateRoles(id: string, tenantId: string, roles: string[]) {
    await this.userRepository.update(
      { id, tenantId },
      { roles },
    );
    return this.findById(id, tenantId);
  }

  async list(tenantId: string) {
    return this.userRepository.find({
      where: { tenantId },
    });
  }
}
