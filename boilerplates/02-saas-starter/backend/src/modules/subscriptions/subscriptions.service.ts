import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsService {
  private readonly plans = {
    free: { price: 0, apiCalls: 1000, storage: 1 },
    pro: { price: 99, apiCalls: 100000, storage: 100 },
    enterprise: { price: 0, apiCalls: -1, storage: -1 },
  };

  constructor(
    @InjectRepository(Subscription)
    private subRepository: Repository<Subscription>,
  ) {}

  async getOrCreate(organizationId: string, tenantId: string) {
    let sub = await this.subRepository.findOne({
      where: { organizationId, tenantId },
    });

    if (!sub) {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      sub = this.subRepository.create({
        organizationId,
        tenantId,
        plan: 'free',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      });

      await this.subRepository.save(sub);
    }

    return sub;
  }

  async upgrade(organizationId: string, tenantId: string, newPlan: string) {
    if (!this.plans[newPlan]) {
      throw new BadRequestException('Invalid plan');
    }

    const sub = await this.subRepository.findOne({
      where: { organizationId, tenantId },
    });

    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    const validTransitions = {
      free: ['pro', 'enterprise'],
      pro: ['free', 'enterprise'],
      enterprise: ['enterprise'],
    };

    if (!validTransitions[sub.plan]?.includes(newPlan)) {
      throw new BadRequestException('Invalid plan transition');
    }

    sub.plan = newPlan;
    await this.subRepository.save(sub);

    return sub;
  }

  async getUsage(organizationId: string, tenantId: string) {
    const sub = await this.subRepository.findOne({
      where: { organizationId, tenantId },
    });

    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    const planDetails = this.plans[sub.plan];

    return {
      plan: sub.plan,
      apiCallsLimit: planDetails.apiCalls === -1 ? 'unlimited' : planDetails.apiCalls,
      storageLimit: planDetails.storage === -1 ? 'unlimited' : `${planDetails.storage}GB`,
      apiCallsUsed: 0,
      storageUsed: 0,
    };
  }
}
