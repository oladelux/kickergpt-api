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
              'Countries to filter by (e.g., England, Spain, Germany, Italy, France). Extract from user query. Use standardized country names.',
          },
          leagues: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Specific leagues mentioned (e.g., Premier League, La Liga, Bundesliga, Serie A, Ligue 1). Only include if explicitly mentioned.',
          },
          dateRange: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['today', 'tomorrow', 'next_3_days'],
                description:
                  'Date range type. Use "next_3_days" for queries like "this week", "upcoming", "next few days", or when no date is specified.',
              },
              startDate: {
                type: ['string', 'null'],
                description:
                  'ISO date string if a specific date is mentioned. Usually null.',
              },
              endDate: {
                type: ['string', 'null'],
                description:
                  'ISO date string if a specific end date is mentioned. Usually null.',
              },
            },
            required: ['type'],
            additionalProperties: false,
          },
          confidenceThreshold: {
            type: 'string',
            enum: ['any', 'medium', 'high', 'very_high'],
            description:
              'Minimum confidence level requested. Use "high" for queries mentioning "confident", "sure", "likely", "safe", "best". Use "very_high" for "very confident", "most likely", "safest", "strongest".',
          },
        },
        required: ['countries', 'leagues', 'dateRange', 'confidenceThreshold'],
        additionalProperties: false,
      },
      sortBy: {
        type: 'string',
        enum: ['confidence', 'date', 'goals_expected'],
        description:
          'How to sort results. Default to "confidence" unless user specifies chronological order.',
      },
      limit: {
        type: 'number',
        description:
          'Maximum number of results requested. Default to 10 unless user specifies (e.g., "top 5", "give me 3", "best 10").',
      },
      isAmbiguous: {
        type: 'boolean',
        description:
          'Set to true ONLY if the query is completely unclear or asks about something we cannot provide (e.g., player stats, live scores). Do NOT set to true for simple or short queries.',
      },
      clarificationNeeded: {
        type: ['string', 'null'],
        description:
          'If isAmbiguous is true, provide a helpful clarification question. Be specific about what information would help.',
      },
      extractedEntities: {
        type: 'object',
        properties: {
          teams: {
            type: 'array',
            items: { type: 'string' },
            description: 'Any team names mentioned in the query.',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Key terms that influenced the classification (e.g., "goals", "scoring", "win").',
          },
        },
        required: ['teams', 'keywords'],
        additionalProperties: false,
      },
    },
    required: [
      'predictionType',
      'filters',
      'sortBy',
      'limit',
      'isAmbiguous',
      'clarificationNeeded',
      'extractedEntities',
    ],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Get the current date info for the prompt
 */
function getCurrentDateInfo(): string {
  const now = new Date();
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayName = days[now.getDay()];
  const monthName = months[now.getMonth()];
  const date = now.getDate();
  const year = now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayName = days[tomorrow.getDay()];

  return `Today is ${dayName}, ${monthName} ${date}, ${year}. Tomorrow is ${tomorrowDayName}.`;
}

/**
 * System prompt for intent classification.
 * Guides the model to extract intent from natural language queries.
 */
export const getIntentClassificationPrompt =
  (): string => `You are a football match query classifier for KickerGPT, a football predictions platform.
Your job is to understand what the user wants and extract structured search parameters.

${getCurrentDateInfo()}

## CRITICAL RULES:
1. **ONLY extract countries/leagues that are EXPLICITLY mentioned** - NEVER add countries that aren't in the query
2. If user says "La Liga", extract ONLY Spain - do NOT add Germany, England, or any other country
3. If user says "Premier League", extract ONLY England - do NOT add other countries
4. If no country or league is mentioned, leave countries and leagues as empty arrays []
5. Be GENEROUS in interpretation for prediction types - assume the user wants predictions
6. Short queries are VALID - "England matches" means "show me matches from England"
7. Default to showing results, not asking for clarification
8. Only set isAmbiguous=true for truly incomprehensible queries

## IMPORTANT - DO NOT HALLUCINATE:
- If the query is "BTTS from La Liga" → countries: ["Spain"], leagues: ["La Liga"] - NOTHING ELSE
- If the query is "Over 2.5 from Bundesliga" → countries: ["Germany"], leagues: ["Bundesliga"] - NOTHING ELSE
- If the query is "Goals from England" → countries: ["England"] - NOTHING ELSE
- NEVER add countries that are not mentioned or implied by the league name

## Prediction Type Mappings:
| User Says | Maps To |
|-----------|---------|
| "over 1.5 goals", "at least 2 goals", "2+ goals", "goals", "scoring" | over_1_5_goals |
| "over 2.5 goals", "at least 3 goals", "3+ goals", "high-scoring", "lots of goals", "goal fest" | over_2_5_goals |
| "BTTS", "both teams to score", "both teams scoring", "both to score" | btts |
| "winner", "who will win", "result", "outcome", "match winner" | result |
| "home win", "home team wins", "home victory", "hosts to win" | home_win |
| "away win", "away team wins", "away victory", "visitors to win" | away_win |
| "draw", "tie", "no winner", "stalemate", "draws" | draw |
| General/unclear prediction type OR just country/league mentioned | any |

## Country Normalization (Extract ONLY the country mentioned - use these exact names):
| User Says | Extract ONLY |
|-----------|--------------|
| "England", "English", "EPL", "UK", "Britain", "British", "Premier League" | England |
| "Spain", "Spanish", "La Liga" | Spain |
| "Germany", "German", "Bundesliga" | Germany |
| "Italy", "Italian", "Serie A" | Italy |
| "France", "French", "Ligue 1" | France |
| "Netherlands", "Dutch", "Holland", "Eredivisie" | Netherlands |
| "Portugal", "Portuguese" | Portugal |
| "Belgium", "Belgian" | Belgium |
| "Scotland", "Scottish" | Scotland |
| "Turkey", "Turkish" | Turkey |
| "Argentina", "Argentine" | Argentina |
| "Saudi Arabia", "Saudi" | Saudi Arabia |

**IMPORTANT**: If user mentions "La Liga", extract ONLY ["Spain"] - do NOT add any other countries! |

## League Extraction:
Only extract leagues if EXPLICITLY mentioned (e.g., "Premier League", "La Liga", "Bundesliga").
Do NOT infer leagues from countries - let the system handle that mapping.

## Date Range Interpretation:
| User Says | Maps To |
|-----------|---------|
| "today", "tonight", "this evening" | today |
| "tomorrow", "tomorrow's matches" | tomorrow |
| "this week", "upcoming", "next few days", "weekend", or NO date mentioned | next_3_days |

## Confidence Threshold:
| User Says | Maps To |
|-----------|---------|
| "confident", "sure", "likely", "safe", "best", "good" | high |
| "very confident", "most likely", "safest", "strongest", "certain" | very_high |
| "any", "all", or no confidence mentioned | any |
| "medium", "moderate", "decent" | medium |

## Limit (Number of Results):
- "top 5", "best 5", "give me 5" → 5
- "top 10", "best 10" → 10
- "a few" → 5
- "all", "every" → 20
- No number mentioned → 10

## When to set isAmbiguous=true:
- Query is in a language other than English (that you don't understand)
- Query asks for something completely unrelated (e.g., "what's the weather")
- Query is gibberish or empty

## When NOT to set isAmbiguous=true:
- Short queries like "England" or "BTTS" (these are valid!)
- Queries with typos (try to understand intent)
- Queries that seem casual or informal

## Examples (FOLLOW THESE EXACTLY):
Query: "England matches" → predictionType: "any", countries: ["England"], leagues: [], isAmbiguous: false
Query: "BTTS from La Liga" → predictionType: "btts", countries: ["Spain"], leagues: ["La Liga"], isAmbiguous: false
Query: "Over 2.5 from Bundesliga" → predictionType: "over_2_5_goals", countries: ["Germany"], leagues: ["Bundesliga"], isAmbiguous: false
Query: "top 5 confident over 2.5" → predictionType: "over_2_5_goals", countries: [], leagues: [], confidenceThreshold: "high", limit: 5
Query: "goals tomorrow Germany" → predictionType: "over_2_5_goals", countries: ["Germany"], dateRange.type: "tomorrow"
Query: "safest bets today" → predictionType: "any", countries: [], confidenceThreshold: "very_high", dateRange.type: "today"
Query: "which teams will score" → predictionType: "btts", countries: [], isAmbiguous: false
Query: "Premier League BTTS" → predictionType: "btts", countries: ["England"], leagues: ["Premier League"], isAmbiguous: false
Query: "Serie A home wins" → predictionType: "home_win", countries: ["Italy"], leagues: ["Serie A"], isAmbiguous: false
Query: "asdfjkl" → isAmbiguous: true, clarificationNeeded: "I couldn't understand your query. Try something like 'BTTS from England' or 'over 2.5 goals from Spain'"

## WRONG Examples (DO NOT DO THIS):
Query: "BTTS from La Liga" → countries: ["Germany", "England", "Spain"] ❌ WRONG - should be ONLY ["Spain"]
Query: "Premier League goals" → countries: ["Spain", "England"] ❌ WRONG - should be ONLY ["England"]
Query: "Bundesliga matches" → countries: ["Germany", "France"] ❌ WRONG - should be ONLY ["Germany"]

Always extract ONLY what is explicitly mentioned or directly implied by a league name. NEVER add extra countries.`;

/**
 * Legacy export for backward compatibility
 */
export const INTENT_CLASSIFICATION_PROMPT = getIntentClassificationPrompt();
