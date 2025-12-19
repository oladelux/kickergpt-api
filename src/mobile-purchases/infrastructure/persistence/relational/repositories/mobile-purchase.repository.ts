import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MobilePurchaseEntity } from '../entities/mobile-purchase.entity';
import { MobilePurchase } from '../../../../domain/mobile-purchase';
import { MobilePurchaseMapper } from '../mappers/mobile-purchase.mapper';

@Injectable()
export class MobilePurchaseRepository {
  constructor(
    @InjectRepository(MobilePurchaseEntity)
    private readonly repository: Repository<MobilePurchaseEntity>,
  ) {}

  async create(data: Partial<MobilePurchase>): Promise<MobilePurchase> {
    const entity = this.repository.create(data);
    const savedEntity = await this.repository.save(entity);
    return MobilePurchaseMapper.toDomain(savedEntity);
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<MobilePurchase | null> {
    const entity = await this.repository.findOne({
      where: { transactionId },
    });
    return entity ? MobilePurchaseMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: string): Promise<MobilePurchase[]> {
    const entities = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((entity) => MobilePurchaseMapper.toDomain(entity));
  }
}

