import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { Strategy } from '../../../../domain/strategy';
import { StrategyRepository } from '../../strategy.repository';
import { StrategyEntity } from '../entities/strategy.entity';
import { StrategyMapper } from '../mappers/strategy.mapper';

@Injectable()
export class StrategyRelationalRepository implements StrategyRepository {
  constructor(
    @InjectRepository(StrategyEntity)
    private readonly repository: Repository<StrategyEntity>,
  ) {}

  async create(
    data: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Strategy> {
    const entity = this.repository.create(
      StrategyMapper.toPersistence(data as Strategy),
    );
    const saved = await this.repository.save(entity);
    return StrategyMapper.toDomain(saved);
  }

  async findById(id: Strategy['id']): Promise<NullableType<Strategy>> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? StrategyMapper.toDomain(entity) : null;
  }

  async findByIdAndUserId(
    id: Strategy['id'],
    userId: Strategy['userId'],
  ): Promise<NullableType<Strategy>> {
    const entity = await this.repository.findOne({ where: { id, userId } });
    return entity ? StrategyMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: Strategy['userId']): Promise<Strategy[]> {
    const entities = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(StrategyMapper.toDomain);
  }

  async findActiveByUserId(userId: Strategy['userId']): Promise<Strategy[]> {
    const entities = await this.repository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    return entities.map(StrategyMapper.toDomain);
  }

  async update(
    id: Strategy['id'],
    payload: Partial<Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Strategy> {
    const existing = await this.repository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Strategy not found');
    }

    const domain = StrategyMapper.toDomain(existing);
    const updated = this.repository.create(
      StrategyMapper.toPersistence({
        ...domain,
        ...payload,
      } as Strategy),
    );

    const saved = await this.repository.save(updated);
    return StrategyMapper.toDomain(saved);
  }

  async delete(id: Strategy['id']): Promise<void> {
    await this.repository.delete({ id });
  }

  async deleteByUserId(userId: Strategy['userId']): Promise<void> {
    await this.repository.delete({ userId });
  }
}

