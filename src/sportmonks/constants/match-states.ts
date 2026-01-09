/**
 * Sportmonks match state constants for filtering completed matches.
 * Reference: https://docs.sportmonks.com/football/endpoints-and-entities/entities/states
 */

/**
 * Match state short names from Sportmonks API
 */
export const MATCH_STATES = {
  // Not started
  NOT_STARTED: 'NS',
  TBD: 'TBD',

  // In progress states
  LIVE: 'LIVE',
  FIRST_HALF: '1ST',
  HALF_TIME: 'HT',
  SECOND_HALF: '2ND',
  EXTRA_TIME: 'ET',
  BREAK: 'BREAK',
  PENALTY_LIVE: 'PEN_LIVE',

  // Completed states
  FULL_TIME: 'FT',
  AFTER_EXTRA_TIME: 'AET',
  FULL_TIME_PENALTIES: 'FT_PEN',
  AWARDED: 'AW',
  WALKOVER: 'WO',

  // Cancelled/other
  CANCELLED: 'CANCL',
  POSTPONED: 'POSTP',
  SUSPENDED: 'SUSP',
  INTERRUPTED: 'INT',
  ABANDONED: 'ABAN',
  DELETED: 'DELETED',
} as const;

/**
 * States that indicate a match has completed with a valid result.
 * These are the only states where final scores should be trusted.
 */
export const COMPLETED_MATCH_STATES = [
  MATCH_STATES.FULL_TIME,
  MATCH_STATES.AFTER_EXTRA_TIME,
  MATCH_STATES.FULL_TIME_PENALTIES,
  MATCH_STATES.AWARDED,
  MATCH_STATES.WALKOVER,
] as const;

/**
 * States that indicate a match is currently in progress.
 */
export const IN_PROGRESS_MATCH_STATES = [
  MATCH_STATES.LIVE,
  MATCH_STATES.FIRST_HALF,
  MATCH_STATES.HALF_TIME,
  MATCH_STATES.SECOND_HALF,
  MATCH_STATES.EXTRA_TIME,
  MATCH_STATES.BREAK,
  MATCH_STATES.PENALTY_LIVE,
] as const;

/**
 * Check if a match state indicates the match is completed with a valid result.
 * @param stateShortName - The short name of the match state (e.g., 'FT', 'AET')
 * @returns true if the match is completed, false otherwise
 */
export function isMatchCompleted(
  stateShortName: string | null | undefined,
): boolean {
  if (!stateShortName) return false;
  return (COMPLETED_MATCH_STATES as readonly string[]).includes(stateShortName);
}

/**
 * Check if a match state indicates the match is currently in progress.
 * @param stateShortName - The short name of the match state
 * @returns true if the match is in progress, false otherwise
 */
export function isMatchInProgress(
  stateShortName: string | null | undefined,
): boolean {
  if (!stateShortName) return false;
  return (IN_PROGRESS_MATCH_STATES as readonly string[]).includes(
    stateShortName,
  );
}
