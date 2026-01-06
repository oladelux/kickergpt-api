import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { PromptUsage } from '../../../../domain/prompt-usage';
import { PromptUsageRepository } from '../../prompt-usage.repository';
import { PromptUsageEntity } from '../entities/prompt-usage.entity';
import { PromptUsageMapper } from '../mappers/prompt-usage.mapper';

@Injectable()
export class PromptUsageRelationalRepository implements PromptUsageRepository {
  constructor(
    @InjectRepository(PromptUsageEntity)
    private readonly repository: Repository<PromptUsageEntity>,
  ) {}

  async create(data: {
    userId: string;
    periodStart: Date;
  }): Promise<PromptUsage> {
    const entity = this.repository.create({
      userId: data.userId,
      periodStart: data.periodStart,
    });

    const saved = await this.repository.save(entity);
    return PromptUsageMapper.toDomain(saved);
  }

  async findByUserId(userId: string): Promise<NullableType<PromptUsage>> {
    const entity = await this.repository.findOne({ where: { userId } });
    return entity ? PromptUsageMapper.toDomain(entity) : null;
  }

  async update(
    id: string,
    payload: Partial<PromptUsage>,
  ): Promise<PromptUsage> {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      throw new Error('PromptUsage not found');
    }

    const updated = this.repository.merge(entity, payload);
    const saved = await this.repository.save(updated);
    return PromptUsageMapper.toDomain(saved);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }

  async findOrCreate(data: {
    userId: string;
    periodStart: Date;
  }): Promise<PromptUsage> {
    // Try to find existing record first
    let entity = await this.repository.findOne({
      where: { userId: data.userId },
    });

    if (entity) {
      return PromptUsageMapper.toDomain(entity);
    }

    // If not found, try to create - handle race condition with try-catch
    try {
      const newEntity = this.repository.create({
        userId: data.userId,
        periodStart: data.periodStart,
      });
      const saved = await this.repository.save(newEntity);
      return PromptUsageMapper.toDomain(saved);
    } catch (error) {
      // Handle race condition: if another request created the record
      // between our check and create, retry finding it
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === '23505') {
        // PostgreSQL unique violation - record was created by another request
        entity = await this.repository.findOne({
          where: { userId: data.userId },
        });
        if (entity) {
          return PromptUsageMapper.toDomain(entity);
        }
      }
      // Re-throw if it's not a duplicate key error or we still can't find the record
      throw error;
    }
  }
}
