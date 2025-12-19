import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { RevenueCatEvent } from '../../../../domain/revenuecat-event';
import { RevenueCatEventRepository } from '../../revenuecat-event.repository';
import { RevenueCatEventEntity } from '../entities/revenuecat-event.entity';
import { RevenueCatEventMapper } from '../mappers/revenuecat-event.mapper';

@Injectable()
export class RevenueCatEventRelationalRepository
  implements RevenueCatEventRepository
{
  constructor(
    @InjectRepository(RevenueCatEventEntity)
    private readonly repository: Repository<RevenueCatEventEntity>,
  ) {}

  async create(
    data: Omit<RevenueCatEvent, 'id' | 'createdAt'>,
  ): Promise<RevenueCatEvent> {
    const entity = this.repository.create(
      RevenueCatEventMapper.toPersistence(data as RevenueCatEvent),
    );
    const saved = await this.repository.save(entity);
    return RevenueCatEventMapper.toDomain(saved);
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<NullableType<RevenueCatEvent>> {
    const entity = await this.repository.findOne({
      where: { transactionId },
    });
    return entity ? RevenueCatEventMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: string): Promise<RevenueCatEvent[]> {
    const entities = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => RevenueCatEventMapper.toDomain(entity));
  }
}

