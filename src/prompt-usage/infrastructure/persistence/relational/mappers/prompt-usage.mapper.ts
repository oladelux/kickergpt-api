import { PromptUsage } from '../../../../domain/prompt-usage';
import { PromptUsageEntity } from '../entities/prompt-usage.entity';

export class PromptUsageMapper {
  static toDomain(raw: PromptUsageEntity): PromptUsage {
    const domain = new PromptUsage();
    domain.id = raw.id;
    domain.userId = raw.userId;
    domain.promptsUsed = raw.promptsUsed;
    domain.addonCredits = raw.addonCredits;
    domain.periodStart = new Date(raw.periodStart);
    domain.createdAt = new Date(raw.createdAt);
    domain.updatedAt = new Date(raw.updatedAt);
    return domain;
  }

  static toPersistence(domain: PromptUsage): PromptUsageEntity {
    const entity = new PromptUsageEntity();
    if (domain.id) {
      entity.id = domain.id;
    }
    entity.userId = domain.userId;
    entity.promptsUsed = domain.promptsUsed;
    entity.addonCredits = domain.addonCredits;
    entity.periodStart = domain.periodStart;
    entity.createdAt = domain.createdAt;
    entity.updatedAt = domain.updatedAt;
    return entity;
  }
}
