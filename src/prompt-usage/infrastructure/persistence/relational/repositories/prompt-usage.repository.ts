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
}
