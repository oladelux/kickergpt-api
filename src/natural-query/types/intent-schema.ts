import { OpenAiJsonSchema } from '../../openai/openai.service';

/**
 * JSON schema for OpenAI structured output to classify user intent.
 * This schema defines the expected structure of the classified intent.
 */
export const INTENT_CLASSIFICATION_SCHEMA: OpenAiJsonSchema = {
  name: 'query_intent',
  schema: {
    type: 'object',
    properties: {
      predictionType: {
        type: 'string',
        enum: [
          'over_1_5_goals',
          'over_2_5_goals',
          'btts',
          'result',
          'home_win',
          'away_win',
          'draw',
          'high_scoring',
          'any',
        ],
        description:
          'The type of prediction the user is looking for. "high_scoring" is an alias for over_2_5_goals. Use "home_win" for straight home wins, "away_win" for away wins, "draw" for draws.',
      },
      filters: {
        type: 'object',
        properties: {
          countries: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Countries to filter by (e.g., England, Spain, Germany, Italy, France). Extract from user query.',
          },
          leagues: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Specific leagues mentioned (e.g., Premier League, La Liga, Bundesliga, Serie A, Ligue 1).',
          },
          dateRange: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['today', 'tomorrow', 'next_3_days'],
                description:
                  'Date range type. Use "next_3_days" for queries like "this week", "upcoming", etc.',
              },
              startDate: {
                type: ['string', 'null'],
                description: 'ISO date string if a specific date is mentioned.',
              },
              endDate: {
                type: ['string', 'null'],
                description:
                  'ISO date string if a specific end date is mentioned.',
              },
            },
            required: ['type'],
            additionalProperties: false,
          },
          confidenceThreshold: {
            type: 'string',
            enum: ['any', 'medium', 'high', 'very_high'],
            description:
              'Minimum confidence level requested. Use "high" for queries mentioning "confident", "sure", "likely".',
          },
        },
        required: ['countries', 'leagues', 'dateRange', 'confidenceThreshold'],
        additionalProperties: false,
      },
      sortBy: {
        type: 'string',
        enum: ['confidence', 'date', 'goals_expected'],
        description:
          'How to sort results. Default to "confidence" unless user specifies otherwise.',
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of results requested. Default to 10 unless user specifies (e.g., "top 5", "give me 3").',
      },
      isAmbiguous: {
        type: 'boolean',
        description:
          'Set to true if the query is unclear, too vague, or needs clarification.',
      },
      clarificationNeeded: {
        type: ['string', 'null'],
        description:
          'If isAmbiguous is true, specify what clarification is needed from the user.',
      },
    },
    required: [
      'predictionType',
      'filters',
      'sortBy',
      'limit',
      'isAmbiguous',
      'clarificationNeeded',
    ],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * System prompt for intent classification.
 * Guides the model to extract intent from natural language queries.
 */
export const INTENT_CLASSIFICATION_PROMPT = `You are a football match query classifier for KickerGPT.
Analyze the user's natural language query and extract their intent for searching football matches.

## Prediction Type Mappings:
- "over 1.5 goals", "at least 2 goals", "2+ goals" -> over_1_5_goals
- "over 2.5 goals", "at least 3 goals", "high-scoring", "lots of goals" -> over_2_5_goals
- "BTTS", "both teams to score", "both teams scoring" -> btts
- "winner", "who will win", "result", "outcome", "match winner" -> result
- "home win", "home team wins", "straight home win", "home victory" -> home_win
- "away win", "away team wins", "straight away win", "away victory" -> away_win
- "draw", "tie", "no winner", "stalemate" -> draw
- General queries without specific type -> any

## Country Mappings:
- "England", "English", "EPL" -> England
- "Spain", "Spanish", "La Liga" -> Spain
- "Germany", "German", "Bundesliga" -> Germany
- "Italy", "Italian", "Serie A" -> Italy
- "France", "French", "Ligue 1" -> France
- "Netherlands", "Dutch", "Eredivisie" -> Netherlands
- "Portugal", "Portuguese" -> Portugal

## Date Range:
- "today" -> today
- "tomorrow" -> tomorrow
- "this week", "upcoming", "next few days" -> next_3_days (our cache only has 3 days of data)

## Confidence:
- "confident", "sure", "likely", "safe" -> high
- "very confident", "very likely", "safest" -> very_high
- No mention of confidence -> any

## Limit:
- "top 5", "give me 5" -> 5
- "top 10" -> 10
- "best matches" -> 5
- No specific number -> 10

## Ambiguous Queries:
Set isAmbiguous=true for:
- Very vague queries like "find me matches"
- Queries that don't specify any criteria
- Queries asking about unsupported prediction types

Provide clarificationNeeded to guide the user.

Always extract as much information as possible from the query.`;
