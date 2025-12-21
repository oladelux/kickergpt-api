import { PromptUsage } from '../../domain/prompt-usage';
import { NullableType } from '../../../utils/types/nullable.type';

export abstract class PromptUsageRepository {
  abstract create(data: {
    userId: string;
    periodStart: Date;
  }): Promise<PromptUsage>;

  abstract findByUserId(userId: string): Promise<NullableType<PromptUsage>>;

  abstract update(
    id: string,
    payload: Partial<PromptUsage>,
  ): Promise<PromptUsage>;

  abstract deleteByUserId(userId: string): Promise<void>;
}
