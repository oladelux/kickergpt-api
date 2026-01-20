import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import { QueryPreprocessorService } from './query-preprocessor.service';
import {
  ClassifiedIntent,
  PreprocessedQuery,
} from './types/natural-query.types';
import {
  INTENT_CLASSIFICATION_SCHEMA,
  getIntentClassificationPrompt,
} from './types/intent-schema';

/**
 * Default intent when classification fails or for fallback scenarios
 */
const DEFAULT_INTENT: ClassifiedIntent = {
  predictionType: 'any',
  filters: {
    countries: [],
    leagues: [],
    dateRange: { type: 'next_3_days' },
    confidenceThreshold: 'any',
  },
  sortBy: 'confidence',
  limit: 10,
  isAmbiguous: false,
  clarificationNeeded: null,
  extractedEntities: {
    teams: [],
    keywords: [],
  },
};

/**
 * Simple keyword-based classification rules for fallback
 */
const KEYWORD_RULES: Array<{
  patterns: RegExp[];
  predictionType: ClassifiedIntent['predictionType'];
}> = [
  {
    patterns: [/btts/i, /both teams? to score/i, /both to score/i],
    predictionType: 'btts',
  },
  {
    patterns: [/over 1\.?5/i, /o1\.?5/i, /at least 2 goals/i, /2\+ goals/i],
    predictionType: 'over_1_5_goals',
  },
  {
    patterns: [
      /over 2\.?5/i,
      /o2\.?5/i,
      /at least 3 goals/i,
      /3\+ goals/i,
      /high.?scoring/i,
    ],
    predictionType: 'over_2_5_goals',
  },
  {
    patterns: [/home win/i, /home team/i, /hosts? to win/i],
    predictionType: 'home_win',
  },
  {
    patterns: [/away win/i, /away team/i, /visitors? to win/i],
    predictionType: 'away_win',
  },
  {
    patterns: [/\bdraw\b/i, /\btie\b/i, /no winner/i],
    predictionType: 'draw',
  },
  {
    patterns: [/winner/i, /who will win/i, /result/i, /outcome/i],
    predictionType: 'result',
  },
];

/**
 * Country detection patterns - now uses COUNTRY_KEYWORDS defined above
 */
const getCountryFromQuery = (text: string): string[] => {
  const countries: string[] = [];
  const textLower = text.toLowerCase();

  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    if (keywords.some((keyword) => textLower.includes(keyword))) {
      countries.push(country);
    }
  }

  return countries;
};

/**
 * Date range detection patterns
 */
const DATE_PATTERNS: Array<{
  patterns: RegExp[];
  dateType: 'today' | 'tomorrow' | 'next_3_days';
}> = [
  {
    patterns: [/\btoday\b/i, /\btonight\b/i, /\bthis evening\b/i],
    dateType: 'today',
  },
  { patterns: [/\btomorrow\b/i], dateType: 'tomorrow' },
  {
    patterns: [
      /\bthis week\b/i,
      /\bweekend\b/i,
      /\bupcoming\b/i,
      /\bnext few days\b/i,
    ],
    dateType: 'next_3_days',
  },
];

/**
 * Confidence detection patterns
 */
const CONFIDENCE_PATTERNS: Array<{
  patterns: RegExp[];
  confidence: 'high' | 'very_high' | 'medium';
}> = [
  {
    patterns: [
      /\bvery confident\b/i,
      /\bmost likely\b/i,
      /\bsafest\b/i,
      /\bstrongest\b/i,
    ],
    confidence: 'very_high',
  },
  {
    patterns: [/\bconfident\b/i, /\blikely\b/i, /\bsafe\b/i, /\bbest\b/i],
    confidence: 'high',
  },
  {
    patterns: [/\bmedium\b/i, /\bmoderate\b/i, /\bdecent\b/i],
    confidence: 'medium',
  },
];

/**
 * Countries and their variations for validation
 */
const COUNTRY_KEYWORDS: Record<string, string[]> = {
  england: [
    'england',
    'english',
    'epl',
    'uk',
    'britain',
    'british',
    'premier league',
    'championship',
    'fa cup',
    'carabao',
    'league cup',
  ],
  spain: ['spain', 'spanish', 'la liga', 'laliga', 'copa del rey'],
  germany: ['germany', 'german', 'bundesliga', 'dfb pokal', 'dfb-pokal'],
  italy: ['italy', 'italian', 'serie a', 'seriea', 'coppa italia'],
  france: ['france', 'french', 'ligue 1', 'ligue1', 'coupe de france'],
  netherlands: ['netherlands', 'dutch', 'holland', 'eredivisie', 'knvb'],
  portugal: ['portugal', 'portuguese', 'primeira liga', 'liga portugal'],
  belgium: ['belgium', 'belgian', 'pro league', 'jupiler'],
  scotland: ['scotland', 'scottish', 'spfl', 'scottish premiership'],
  turkey: ['turkey', 'turkish', 'super lig', 'süper lig'],
  argentina: ['argentina', 'argentine', 'argentinian'],
  'saudi arabia': ['saudi', 'saudi arabia', 'saudi arabian'],
  australia: ['australia', 'australian', 'a-league'],
  brazil: ['brazil', 'brazilian', 'brasileirao'],
  usa: ['usa', 'united states', 'america', 'american', 'mls'],
  mexico: ['mexico', 'mexican', 'liga mx'],
  japan: ['japan', 'japanese', 'j1 league', 'j-league'],
  croatia: ['croatia', 'croatian'],
  egypt: ['egypt', 'egyptian'],
  iran: ['iran', 'iranian'],
  israel: ['israel', 'israeli'],
  romania: ['romania', 'romanian'],
  'south africa': ['south africa', 'south african'],
};

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly preprocessor: QueryPreprocessorService,
  ) {}

  /**
   * Classify a natural language query into structured intent.
   * Uses OpenAI's structured JSON output with fallback to keyword-based classification.
   */
  async classifyIntent(query: string): Promise<ClassifiedIntent> {
    this.logger.log(`Classifying intent for query: "${query}"`);

    // Preprocess the query
    const preprocessed = this.preprocessor.preprocess(query);

    // Handle edge cases before calling AI
    if (this.preprocessor.isTooShort(preprocessed.normalized)) {
      this.logger.warn('Query too short, returning ambiguous intent');
      return {
        ...DEFAULT_INTENT,
        isAmbiguous: true,
        clarificationNeeded:
          "Your query is too short. Try something like 'BTTS from England' or 'over 2.5 goals from Spain'.",
      };
    }

    // Handle meta questions
    if (this.preprocessor.isMetaQuestion(preprocessed.normalized)) {
      return this.createHelpIntent();
    }

    try {
      // Try AI classification first
      const result = await this.classifyWithAI(preprocessed);
      return this.postProcessIntent(result, preprocessed);
    } catch (error) {
      this.logger.warn(
        `AI classification failed, falling back to keyword-based: ${(error as Error).message}`,
      );
      // Fallback to keyword-based classification
      return this.classifyWithKeywords(preprocessed);
    }
  }

  /**
   * Classify using OpenAI's structured output
   */
  private async classifyWithAI(
    preprocessed: PreprocessedQuery,
  ): Promise<ClassifiedIntent> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: getIntentClassificationPrompt() },
      {
        role: 'user',
        content: `Original query: "${preprocessed.original}"\nNormalized: "${preprocessed.normalized}"`,
      },
    ];

    const result = await this.openAiService.generateJson<ClassifiedIntent>(
      messages,
      INTENT_CLASSIFICATION_SCHEMA,
      0.1, // Low temperature for deterministic classification
    );

    this.logger.log(
      `AI classified intent: type=${result.predictionType}, countries=${result.filters.countries.join(',') || 'none'}, ambiguous=${result.isAmbiguous}`,
    );

    return result;
  }

  /**
   * Fallback keyword-based classification when AI fails
   */
  private classifyWithKeywords(
    preprocessed: PreprocessedQuery,
  ): ClassifiedIntent {
    const text = preprocessed.normalized;
    const intent: ClassifiedIntent = { ...DEFAULT_INTENT };

    // Detect prediction type
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        intent.predictionType = rule.predictionType;
        break;
      }
    }

    // Detect countries using the keyword map
    intent.filters.countries = getCountryFromQuery(text);

    // Detect date range
    for (const dateRule of DATE_PATTERNS) {
      if (dateRule.patterns.some((p) => p.test(text))) {
        intent.filters.dateRange = { type: dateRule.dateType };
        break;
      }
    }

    // Detect confidence threshold
    for (const confRule of CONFIDENCE_PATTERNS) {
      if (confRule.patterns.some((p) => p.test(text))) {
        intent.filters.confidenceThreshold = confRule.confidence;
        break;
      }
    }

    // Detect limit
    const limitMatch = text.match(/\b(?:top|best|give me|show)\s*(\d+)\b/i);
    if (limitMatch) {
      intent.limit = Math.min(50, Math.max(1, parseInt(limitMatch[1], 10)));
    }

    this.logger.log(
      `Keyword classified intent: type=${intent.predictionType}, countries=${intent.filters.countries.join(',') || 'none'}`,
    );

    return intent;
  }

  /**
   * Create a help intent for meta questions
   */
  private createHelpIntent(): ClassifiedIntent {
    return {
      ...DEFAULT_INTENT,
      isAmbiguous: true,
      clarificationNeeded: `I can help you find football match predictions! Try queries like:
• "BTTS from England"
• "Over 2.5 goals from Spain today"
• "Confident predictions from Germany"
• "Top 5 high-scoring matches tomorrow"

What would you like to search for?`,
    };
  }

  /**
   * Post-process the classified intent to handle edge cases and validate countries.
   */
  private postProcessIntent(
    intent: ClassifiedIntent,
    preprocessed: PreprocessedQuery,
  ): ClassifiedIntent {
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

    // Ensure arrays exist
    if (!intent.filters.countries) {
      intent.filters.countries = [];
    }
    if (!intent.filters.leagues) {
      intent.filters.leagues = [];
    }

    // IMPORTANT: Validate and filter countries to only those mentioned in the query
    intent.filters.countries = this.validateCountries(
      intent.filters.countries,
      preprocessed.normalized,
    );

    // Normalize country names to proper case
    intent.filters.countries = intent.filters.countries.map(
      (c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
    );

    // If the AI marked it as ambiguous but we have useful info, override
    if (
      intent.isAmbiguous &&
      (intent.filters.countries.length > 0 ||
        intent.filters.leagues.length > 0 ||
        intent.predictionType !== 'any')
    ) {
      intent.isAmbiguous = false;
      intent.clarificationNeeded = null;
    }

    // Store the original query in extracted entities for debugging
    if (!intent.extractedEntities) {
      intent.extractedEntities = {
        teams: this.preprocessor.extractPotentialTeams(preprocessed.original),
        keywords: preprocessed.tokens.slice(0, 10),
      };
    }

    return intent;
  }

  /**
   * Validate that extracted countries were actually mentioned in the query.
   * This prevents the AI from hallucinating extra countries.
   */
  private validateCountries(
    extractedCountries: string[],
    normalizedQuery: string,
  ): string[] {
    const queryLower = normalizedQuery.toLowerCase();
    const validatedCountries: string[] = [];

    for (const country of extractedCountries) {
      const countryLower = country.toLowerCase();
      const keywords = COUNTRY_KEYWORDS[countryLower];

      if (keywords) {
        // Check if any keyword for this country appears in the query
        const isInQuery = keywords.some((keyword) =>
          queryLower.includes(keyword),
        );
        if (isInQuery) {
          validatedCountries.push(countryLower);
        }
      } else {
        // For countries not in our map, check if the country name itself is in the query
        if (queryLower.includes(countryLower)) {
          validatedCountries.push(countryLower);
        }
      }
    }

    // Remove duplicates
    return [...new Set(validatedCountries)];
  }

  /**
   * Get the preprocessor for external use (e.g., for getting normalized query)
   */
  getPreprocessor(): QueryPreprocessorService {
    return this.preprocessor;
  }
}
