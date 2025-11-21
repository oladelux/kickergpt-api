import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixtureChatEntity } from '../fixtures/infrastructure/persistence/relational/entities/fixture-chat.entity';
import { FixtureAnalysisMetadata } from '../fixtures/types/fixture-analysis.type';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';

type LogChatParams = {
  fixtureId: number;
  userId: string;
  message: string;
  tone?: string;
  summary: string;
  metadata?: FixtureAnalysisMetadata;
};

type HistoryQueryParams = {
  userId: string;
  fixtureId?: number;
  limit?: number;
  offset?: number;
};

@Injectable()
export class FixtureChatsService {
  constructor(
    @InjectRepository(FixtureChatEntity)
    private readonly fixtureChatsRepository: Repository<FixtureChatEntity>,
  ) {}

  async logChat(params: LogChatParams): Promise<void> {
    const entity = this.fixtureChatsRepository.create({
      fixtureId: params.fixtureId,
      message: params.message,
      tone: params.tone,
      summary: params.summary,
      metadata: params.metadata,
      user: { id: params.userId } as UserEntity,
    });

    await this.fixtureChatsRepository.save(entity);
  }

  async getChatsForFixture(
    params: HistoryQueryParams & { fixtureId: number },
  ): Promise<FixtureChatEntity[]> {
    return this.fixtureChatsRepository.find({
      where: {
        user: { id: params.userId },
        fixtureId: params.fixtureId,
      },
      order: { createdAt: 'DESC' },
      take: params.limit,
      skip: params.offset,
    });
  }

  async getChatsForUser(
    params: HistoryQueryParams,
  ): Promise<FixtureChatEntity[]> {
    return this.fixtureChatsRepository.find({
      where: {
        user: { id: params.userId },
      },
      order: { createdAt: 'DESC' },
      take: params.limit,
      skip: params.offset,
    });
  }
}
