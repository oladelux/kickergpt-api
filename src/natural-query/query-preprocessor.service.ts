import { Injectable, Logger } from '@nestjs/common';
import { PreprocessedQuery } from './types/natural-query.types';

/**
 * Common typos and their corrections for football-related terms
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  // Prediction types
  bts: 'btts',
  'both team to score': 'both teams to score',
  'both team score': 'both teams to score',
  'over 1.5': 'over 1.5 goals',
  'over 2.5': 'over 2.5 goals',
  'o1.5': 'over 1.5 goals',
  'o2.5': 'over 2.5 goals',
  ov15: 'over 1.5 goals',
  ov25: 'over 2.5 goals',
  'over1.5': 'over 1.5 goals',
  'over2.5': 'over 2.5 goals',

  // Countries
  englad: 'england',
  engalnd: 'england',
  enlgand: 'england',
  spian: 'spain',
  spaun: 'spain',
  germnay: 'germany',
  germny: 'germany',
  itlay: 'italy',
  italu: 'italy',
  frnace: 'france',
  franec: 'france',
  netheralnds: 'netherlands',
  netherland: 'netherlands',
  portugla: 'portugal',
  portuagl: 'portugal',
  scotlnad: 'scotland',
  scotand: 'scotland',
  belgum: 'belgium',
  belguim: 'belgium',

  // Leagues
  'premier leauge': 'premier league',
  'premire league': 'premier league',
  'premiur league': 'premier league',
  pl: 'premier league',
  epl: 'premier league',
  'la lgia': 'la liga',
  laliga: 'la liga',
  'serie a': 'serie a',
  seriea: 'serie a',
  'ligue 1': 'ligue 1',
  ligue1: 'ligue 1',
  bundesleague: 'bundesliga',
  bundasliga: 'bundesliga',

  // Common terms
  tommorow: 'tomorrow',
  tommorrow: 'tomorrow',
  tomorow: 'tomorrow',
  todya: 'today',
  toady: 'today',
  tonite: 'tonight',
  machtes: 'matches',
  mactches: 'matches',
  fixturs: 'fixtures',
  fixutres: 'fixtures',
  predicitons: 'predictions',
  predictons: 'predictions',
  confedent: 'confident',
  confidnet: 'confident',
  'high scoring': 'high-scoring',
  highscoring: 'high-scoring',
  goalss: 'goals',
};

/**
 * Abbreviations and their expansions
 */
const ABBREVIATIONS: Record<string, string> = {
  eng: 'england',
  ger: 'germany',
  spa: 'spain',
  ita: 'italy',
  fra: 'france',
  ned: 'netherlands',
  por: 'portugal',
  bel: 'belgium',
  sco: 'scotland',
  tur: 'turkey',
  tmrw: 'tomorrow',
  tmr: 'tomorrow',
  tdy: 'today',
  '2nite': 'tonight',
};

/**
 * Stop words to remove for better classification
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'need',
  'please',
  'thanks',
  'thank',
  'you',
  'me',
  'my',
  'i',
  'we',
  'us',
  'our',
  'some',
  'any',
  'show',
  'give',
  'get',
  'find',
  'search',
  'look',
  'want',
  'like',
  'need',
  "what's",
  'whats',
  "what're",
  'which',
  'where',
  'how',
  'that',
  'this',
  'these',
  'those',
]);

@Injectable()
export class QueryPreprocessorService {
  private readonly logger = new Logger(QueryPreprocessorService.name);

  /**
   * Preprocess a natural language query for better classification
   */
  preprocess(query: string): PreprocessedQuery {
    const original = query;

    // Step 1: Basic normalization
    let normalized = query.trim().toLowerCase();

    // Step 2: Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Step 3: Handle punctuation (keep periods for numbers like 1.5, 2.5)
    normalized = normalized.replace(/[!?,;:'"()[\]{}]/g, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Step 4: Expand abbreviations
    normalized = this.expandAbbreviations(normalized);

    // Step 5: Fix common typos
    normalized = this.fixTypos(normalized);

    // Step 6: Normalize number formats
    normalized = this.normalizeNumbers(normalized);

    // Step 7: Tokenize
    const tokens = this.tokenize(normalized);

    this.logger.debug(
      `Preprocessed query: "${original}" -> "${normalized}" [${tokens.length} tokens]`,
    );

    return {
      original,
      normalized,
      tokens,
    };
  }

  /**
   * Expand known abbreviations
   */
  private expandAbbreviations(text: string): string {
    let result = text;

    for (const [abbr, expansion] of Object.entries(ABBREVIATIONS)) {
      // Match whole words only
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      result = result.replace(regex, expansion);
    }

    return result;
  }

  /**
   * Fix common typos
   */
  private fixTypos(text: string): string {
    let result = text;

    // Sort by length descending to match longer phrases first
    const sortedTypos = Object.entries(TYPO_CORRECTIONS).sort(
      (a, b) => b[0].length - a[0].length,
    );

    for (const [typo, correction] of sortedTypos) {
      const regex = new RegExp(`\\b${this.escapeRegex(typo)}\\b`, 'gi');
      result = result.replace(regex, correction);
    }

    return result;
  }

  /**
   * Normalize number formats for goal thresholds
   */
  private normalizeNumbers(text: string): string {
    let result = text;

    // "over 1 5" -> "over 1.5"
    result = result.replace(/over\s+(\d)\s+5\s+goals?/gi, 'over $1.5 goals');

    // "1,5 goals" -> "1.5 goals"
    result = result.replace(/(\d),5\s*goals?/gi, '$1.5 goals');

    // "2-5 goals" or "25 goals" when likely meaning 2.5
    result = result.replace(/\b2-5\s*goals?/gi, '2.5 goals');
    result = result.replace(/\b25\s*goals?\b/gi, '2.5 goals');
    result = result.replace(/\b15\s*goals?\b/gi, '1.5 goals');

    // "over 2" or "over 3" without decimal -> assume they mean 2.5 or 2.5+
    result = result.replace(/over\s+2\s+goals?(?!\.\d)/gi, 'over 2.5 goals');
    result = result.replace(/over\s+3\s+goals?(?!\.\d)/gi, 'over 2.5 goals');

    return result;
  }

  /**
   * Tokenize the normalized query
   */
  private tokenize(text: string): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    // Remove stop words but keep important ones
    return words.filter((word) => {
      // Always keep numbers and prediction-related terms
      if (/^\d/.test(word)) return true;
      if (['over', 'under', 'btts', 'goals', 'from'].includes(word))
        return true;

      // Remove common stop words
      return !STOP_WORDS.has(word);
    });
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if a query appears to be in English
   */
  isLikelyEnglish(query: string): boolean {
    // Simple heuristic: check for common English characters
    const englishPattern = /^[a-zA-Z0-9\s.,!?'"()-]+$/;
    return englishPattern.test(query);
  }

  /**
   * Extract potential team names from a query
   * This is a simple extraction - the intent classifier will do the real work
   */
  extractPotentialTeams(query: string): string[] {
    const normalized = query.toLowerCase();
    const teams: string[] = [];

    // Look for "vs", "versus", "against" patterns
    const vsMatch = normalized.match(
      /(\w+(?:\s+\w+)?)\s+(?:vs\.?|versus|against|v)\s+(\w+(?:\s+\w+)?)/i,
    );
    if (vsMatch) {
      teams.push(vsMatch[1].trim(), vsMatch[2].trim());
    }

    return teams;
  }

  /**
   * Check if the query is too short to be meaningful
   */
  isTooShort(query: string): boolean {
    const trimmed = query.trim();
    // Single character or empty is too short
    return trimmed.length < 2;
  }

  /**
   * Check if the query appears to be a question about the system rather than a search
   */
  isMetaQuestion(query: string): boolean {
    const normalized = query.toLowerCase();
    const metaPatterns = [
      /^what can you do/,
      /^how do you work/,
      /^help$/,
      /^what is this/,
      /^how does this work/,
      /^what are you/,
    ];

    return metaPatterns.some((pattern) => pattern.test(normalized));
  }
}
