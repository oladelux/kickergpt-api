import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import { ClassifiedIntent } from './types/natural-query.types';
import {
  INTENT_CLASSIFICATION_SCHEMA,
  INTENT_CLASSIFICATION_PROMPT,
} from './types/intent-schema';

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(private readonly openAiService: OpenAiService) {}

  /**
   * Classify a natural language query into structured intent.
   * Uses OpenAI's structured JSON output for reliable parsing.
   */
  async classifyIntent(query: string): Promise<ClassifiedIntent> {
    this.logger.log(`Classifying intent for query: "${query}"`);

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: INTENT_CLASSIFICATION_PROMPT },
      { role: 'user', content: query },
    ];

    const result = await this.openAiService.generateJson<ClassifiedIntent>(
      messages,
      INTENT_CLASSIFICATION_SCHEMA,
      0.1, // Low temperature for deterministic classification
    );

    this.logger.log(
      `Classified intent: type=${result.predictionType}, countries=${result.filters.countries.join(',') || 'none'}, ambiguous=${result.isAmbiguous}`,
    );

    // Post-process the result
    return this.postProcessIntent(result);
  }

  /**
   * Post-process the classified intent to handle edge cases.
   */
  private postProcessIntent(intent: ClassifiedIntent): ClassifiedIntent {
    // Normalize high_scoring to over_2_5_goals
    if (intent.predictionType === 'high_scoring') {
      intent.predictionType = 'over_2_5_goals';
    }

    // Ensure limit is within bounds
    if (intent.limit < 1) {
      intent.limit = 10;
    } else if (intent.limit > 50) {
      intent.limit = 50;
    }

    // Default date range if not specified
    if (!intent.filters.dateRange?.type) {
      intent.filters.dateRange = { type: 'next_3_days' };
    }

    // Default confidence threshold
    if (!intent.filters.confidenceThreshold) {
      intent.filters.confidenceThreshold = 'any';
    }

    // Default sort
    if (!intent.sortBy) {
      intent.sortBy = 'confidence';
    }

    return intent;
  }
}
