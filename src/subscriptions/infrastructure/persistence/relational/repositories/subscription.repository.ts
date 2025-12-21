import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { Subscription } from '../../../../domain/subscription';
import { SubscriptionPlan } from '../../../../domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../../../domain/subscription-status.enum';
import { SubscriptionRepository } from '../../subscription.repository';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionMapper } from '../mappers/subscription.mapper';
import { PaymentProvider } from '../../../../domain/payment-provider.enum';

@Injectable()
export class SubscriptionRelationalRepository
  implements SubscriptionRepository
{
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly repository: Repository<SubscriptionEntity>,
  ) {}

  async create(
    data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<Subscription> {
    const entity = this.repository.create(
      SubscriptionMapper.toPersistence(data as Subscription),
    );
    const saved = await this.repository.save(entity);
    return SubscriptionMapper.toDomain(saved);
  }

  async update(
    id: Subscription['id'],
    payload: Partial<
      Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Subscription> {
    const existing = await this.repository.findOne({
      where: { id: String(id) },
    });
    if (!existing) {
      throw new Error('Subscription not found');
    }

    const domain = SubscriptionMapper.toDomain(existing);
    const updated = this.repository.create(
      SubscriptionMapper.toPersistence({
        ...domain,
        ...payload,
      } as Subscription),
    );

    const saved = await this.repository.save(updated);
    return SubscriptionMapper.toDomain(saved);
  }

  findByUserId(userId: string): Promise<NullableType<Subscription>> {
    return this.findBy({ userId: String(userId) });
  }

  findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<NullableType<Subscription>> {
    return this.findBy({ stripeCustomerId });
  }

  findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<NullableType<Subscription>> {
    if (!stripeSubscriptionId) {
      return Promise.resolve(null);
    }
    return this.findBy({ stripeSubscriptionId });
  }

  findByPaystackCustomerCode(
    paystackCustomerCode: string,
  ): Promise<NullableType<Subscription>> {
    return this.findBy({ paystackCustomerCode });
  }

  findByPaystackSubscriptionCode(
    paystackSubscriptionCode: string,
  ): Promise<NullableType<Subscription>> {
    if (!paystackSubscriptionCode) {
      return Promise.resolve(null);
    }
    return this.findBy({ paystackSubscriptionCode });
  }

  async updatePlanAndStatus(
    id: Subscription['id'],
    data: {
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      stripeSubscriptionId: Subscription['stripeSubscriptionId'];
      paystackSubscriptionCode: Subscription['paystackSubscriptionCode'];
      paystackCustomerCode: Subscription['paystackCustomerCode'];
      stripeCustomerId: Subscription['stripeCustomerId'];
      paymentProvider: PaymentProvider;
      currentPeriodEnd: Subscription['currentPeriodEnd'];
    },
  ): Promise<Subscription> {
    return this.update(id, data);
  }

  async updateByUserId(
    userId: string,
    payload: Partial<
      Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Subscription> {
    const existing = await this.repository.findOne({
      where: { userId: String(userId) },
    });
    if (!existing) {
      throw new Error('Subscription not found');
    }

    const domain = SubscriptionMapper.toDomain(existing);
    const updated = this.repository.create(
      SubscriptionMapper.toPersistence({
        ...domain,
        ...payload,
      } as Subscription),
    );
    const saved = await this.repository.save(updated);
    return SubscriptionMapper.toDomain(saved);
  }

  private async findBy(
    where: FindOptionsWhere<SubscriptionEntity>,
  ): Promise<NullableType<Subscription>> {
    const entity = await this.repository.findOne({ where });
    return entity ? SubscriptionMapper.toDomain(entity) : null;
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repository.delete({ userId: String(userId) });
  }
}
