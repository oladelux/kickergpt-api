import { FixtureChatEntity } from '../infrastructure/persistence/relational/entities/fixture-chat.entity';
import { FixtureChatMessageDto } from '../dto/fixture-chat-message.dto';
import { FixtureAnalysisMetadata } from '../types/fixture-analysis.type';

export class FixtureChatMapper {
  static toDto(entity: FixtureChatEntity): FixtureChatMessageDto {
    return {
      id: entity.id,
      fixtureId: entity.fixtureId,
      message: entity.message,
      tone: entity.tone ?? null,
      summary: entity.summary,
      metadata: entity.metadata as FixtureAnalysisMetadata | undefined,
      createdAt: entity.createdAt,
    };
  }
}
