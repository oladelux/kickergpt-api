import { Injectable, Logger } from '@nestjs/common';
import { StrategyCondition } from './domain/strategy-condition';
import { StrategyConditionType } from './domain/strategy-condition-type.enum';
import { StrategyOperator } from './domain/strategy-operator.enum';
import { StrategyTarget } from './domain/strategy-target.enum';
import {
  KickerGPTFixturesResponse,
  KickerGPTMatchSummary,
} from '../fixtures/types/fixtures-response.type';

export interface ConditionEvaluationResult {
  condition: StrategyCondition;
  passed: boolean;
  actualValue: number | null;
}

const DEFAULT_LAST_MATCHES = 5;

@Injectable()
export class ConditionEvaluatorService {
  private readonly logger = new Logger(ConditionEvaluatorService.name);

  /**
   * Get the most recent N matches by sorting by timestamp descending
   * The data comes sorted chronologically (oldest first), so we need to reverse it
   */
  private getRecentMatches(
    matches: KickerGPTMatchSummary[],
    count: number,
  ): KickerGPTMatchSummary[] {
    if (!matches || matches.length === 0) {
      return [];
    }
    // Sort by timestamp descending (most recent first)
    const sorted = [...matches].sort((a, b) => {
      // Use timestamp if available, otherwise try to parse the date
      const timestampA = a.timestamp ?? new Date(a.date).getTime() / 1000;
      const timestampB = b.timestamp ?? new Date(b.date).getTime() / 1000;
      return timestampB - timestampA; // Descending order
    });
    return sorted.slice(0, count);
  }

  /**
   * Evaluate all conditions against a fixture
   * Returns true if ALL conditions pass
   */
  evaluateConditions(
    conditions: StrategyCondition[],
    fixture: KickerGPTFixturesResponse,
  ): { allPassed: boolean; results: ConditionEvaluationResult[] } {
    const results: ConditionEvaluationResult[] = [];

    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, fixture);
      results.push(result);
    }

    const allPassed = results.every((r) => r.passed);
    return { allPassed, results };
  }

  /**
   * Evaluate a single condition against a fixture
   */
  private evaluateCondition(
    condition: StrategyCondition,
    fixture: KickerGPTFixturesResponse,
  ): ConditionEvaluationResult {
    const actualValue = this.calculateMetricValue(condition, fixture);

    if (actualValue === null) {
      return { condition, passed: false, actualValue: null };
    }

    const passed = this.compareValues(
      actualValue,
      condition.operator,
      condition.value,
    );

    return { condition, passed, actualValue };
  }

  /**
   * Calculate the metric value based on condition type and target
   */
  private calculateMetricValue(
    condition: StrategyCondition,
    fixture: KickerGPTFixturesResponse,
  ): number | null {
    const { type, target, lastMatches = DEFAULT_LAST_MATCHES } = condition;

    switch (type) {
      case StrategyConditionType.HOME_FORM:
        return this.calculateFormPoints(
          fixture.homeTeamRecentMatches,
          'home',
          lastMatches,
        );

      case StrategyConditionType.AWAY_FORM:
        return this.calculateFormPoints(
          fixture.awayTeamRecentMatches,
          'away',
          lastMatches,
        );

      case StrategyConditionType.WIN_RATE:
        return this.calculateWinRate(fixture, target, lastMatches);

      case StrategyConditionType.HEAD_TO_HEAD:
        return this.calculateH2HWinRate(
          fixture.h2h,
          fixture,
          target,
          lastMatches,
        );

      case StrategyConditionType.INJURIES:
        return this.calculateInjuryCount(fixture, target);

      case StrategyConditionType.GOALS_SCORED:
        return this.calculateGoalsScored(fixture, target, lastMatches);

      case StrategyConditionType.GOALS_CONCEDED:
        return this.calculateGoalsConceded(fixture, target, lastMatches);

      case StrategyConditionType.RECENT_GOALS_TOTAL:
        return this.calculateRecentGoalsTotal(fixture, target, lastMatches);

      case StrategyConditionType.CLEAN_SHEETS:
        return this.calculateCleanSheetPercentage(fixture, target, lastMatches);

      case StrategyConditionType.BTTS:
        return this.calculateBTTSPercentage(fixture, target, lastMatches);

      case StrategyConditionType.H2H_GOALS_SCORED:
        return this.calculateH2HGoalsScored(fixture, target, lastMatches);

      default:
        this.logger.warn(`Unknown condition type: ${type}`);
        return null;
    }
  }

  /**
   * Calculate form points from recent matches (W=3, D=1, L=0)
   */
  private calculateFormPoints(
    matches: KickerGPTMatchSummary[],
    teamLocation: 'home' | 'away',
    lastMatches: number,
  ): number {
    if (!matches || matches.length === 0) {
      return 0;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let points = 0;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      const teamGoals = teamLocation === 'home' ? home : away;
      const opponentGoals = teamLocation === 'home' ? away : home;

      if (teamGoals > opponentGoals) {
        points += 3; // Win
      } else if (teamGoals === opponentGoals) {
        points += 1; // Draw
      }
    }

    return points;
  }

  /**
   * Calculate win rate percentage from recent matches
   */
  private calculateWinRate(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homeWinRate = this.calculateTeamWinRate(
      fixture.homeTeamRecentMatches,
      fixture.teams.home.id,
      lastMatches,
    );
    const awayWinRate = this.calculateTeamWinRate(
      fixture.awayTeamRecentMatches,
      fixture.teams.away.id,
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeWinRate;
      case StrategyTarget.AWAY:
        return awayWinRate;
      case StrategyTarget.BOTH:
        if (homeWinRate === null || awayWinRate === null) return null;
        return Math.min(homeWinRate, awayWinRate);
    }
  }

  private calculateTeamWinRate(
    matches: KickerGPTMatchSummary[],
    teamId: number,
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let wins = 0;
    let totalMatches = 0;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      totalMatches++;
      const isHomeTeam = match.teams.home.id === teamId;
      const teamGoals = isHomeTeam ? home : away;
      const opponentGoals = isHomeTeam ? away : home;

      if (teamGoals > opponentGoals) {
        wins++;
      }
    }

    if (totalMatches === 0) return null;
    return Math.round((wins / totalMatches) * 100);
  }

  /**
   * Calculate head-to-head win rate
   */
  private calculateH2HWinRate(
    h2h: KickerGPTMatchSummary[],
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    if (!h2h || h2h.length === 0) {
      return null;
    }

    const recentH2H = this.getRecentMatches(h2h, lastMatches);
    let homeWins = 0;
    let awayWins = 0;
    let totalMatches = 0;

    const homeTeamId = fixture.teams.home.id;
    const awayTeamId = fixture.teams.away.id;

    for (const match of recentH2H) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      totalMatches++;

      const matchHomeTeamId = match.teams.home.id;
      const homeGoals = home;
      const awayGoals = away;

      if (homeGoals > awayGoals) {
        if (matchHomeTeamId === homeTeamId) homeWins++;
        else if (matchHomeTeamId === awayTeamId) awayWins++;
      } else if (awayGoals > homeGoals) {
        if (match.teams.away.id === homeTeamId) homeWins++;
        else if (match.teams.away.id === awayTeamId) awayWins++;
      }
    }

    if (totalMatches === 0) return null;

    switch (target) {
      case StrategyTarget.HOME:
        return Math.round((homeWins / totalMatches) * 100);
      case StrategyTarget.AWAY:
        return Math.round((awayWins / totalMatches) * 100);
      case StrategyTarget.BOTH:
        return Math.round((Math.min(homeWins, awayWins) / totalMatches) * 100);
    }
  }

  /**
   * Calculate injury count (doesn't use lastMatches)
   */
  private calculateInjuryCount(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
  ): number {
    const homeInjuries = fixture.homeInjuries?.length ?? 0;
    const awayInjuries = fixture.awayInjuries?.length ?? 0;

    switch (target) {
      case StrategyTarget.HOME:
        return homeInjuries;
      case StrategyTarget.AWAY:
        return awayInjuries;
      case StrategyTarget.BOTH:
        return homeInjuries + awayInjuries;
    }
  }

  /**
   * Calculate minimum goals scored across recent matches
   * Returns the MINIMUM so that ">= X" checks if team scored at least X in EVERY match
   */
  private calculateGoalsScored(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homeMin = this.calculateMinGoalsForTeam(
      fixture.homeTeamRecentMatches,
      fixture.teams.home.id,
      'scored',
      lastMatches,
    );
    const awayMin = this.calculateMinGoalsForTeam(
      fixture.awayTeamRecentMatches,
      fixture.teams.away.id,
      'scored',
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeMin;
      case StrategyTarget.AWAY:
        return awayMin;
      case StrategyTarget.BOTH:
        // For BOTH, return the minimum of both teams' minimums
        if (homeMin === null || awayMin === null) return null;
        return Math.min(homeMin, awayMin);
    }
  }

  /**
   * Calculate maximum goals conceded across recent matches
   * Returns the MAXIMUM so that "<= X" checks if team conceded at most X in EVERY match
   */
  private calculateGoalsConceded(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homeMax = this.calculateMaxGoalsForTeam(
      fixture.homeTeamRecentMatches,
      fixture.teams.home.id,
      'conceded',
      lastMatches,
    );
    const awayMax = this.calculateMaxGoalsForTeam(
      fixture.awayTeamRecentMatches,
      fixture.teams.away.id,
      'conceded',
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeMax;
      case StrategyTarget.AWAY:
        return awayMax;
      case StrategyTarget.BOTH:
        // For BOTH, return the maximum of both teams' maximums
        if (homeMax === null || awayMax === null) return null;
        return Math.max(homeMax, awayMax);
    }
  }

  private calculateMinGoalsForTeam(
    matches: KickerGPTMatchSummary[],
    teamId: number,
    type: 'scored' | 'conceded',
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let minGoals: number | null = null;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      const isHomeTeam = match.teams.home.id === teamId;
      const goals =
        type === 'scored'
          ? isHomeTeam
            ? home
            : away
          : isHomeTeam
            ? away
            : home;

      if (minGoals === null || goals < minGoals) {
        minGoals = goals;
      }
    }

    return minGoals;
  }

  private calculateMaxGoalsForTeam(
    matches: KickerGPTMatchSummary[],
    teamId: number,
    type: 'scored' | 'conceded',
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let maxGoals: number | null = null;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      const isHomeTeam = match.teams.home.id === teamId;
      const goals =
        type === 'scored'
          ? isHomeTeam
            ? home
            : away
          : isHomeTeam
            ? away
            : home;

      if (maxGoals === null || goals > maxGoals) {
        maxGoals = goals;
      }
    }

    return maxGoals;
  }

  /**
   * Calculate minimum total goals (home + away) per match across recent matches
   * Returns the MINIMUM so that ">= X" checks if total goals >= X in EVERY match
   */
  private calculateRecentGoalsTotal(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homeMin = this.calculateMinTotalGoalsInMatches(
      fixture.homeTeamRecentMatches,
      lastMatches,
    );
    const awayMin = this.calculateMinTotalGoalsInMatches(
      fixture.awayTeamRecentMatches,
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeMin;
      case StrategyTarget.AWAY:
        return awayMin;
      case StrategyTarget.BOTH:
        if (homeMin === null || awayMin === null) return null;
        return Math.min(homeMin, awayMin);
    }
  }

  private calculateMinTotalGoalsInMatches(
    matches: KickerGPTMatchSummary[],
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let minTotal: number | null = null;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      const total = home + away;
      if (minTotal === null || total < minTotal) {
        minTotal = total;
      }
    }

    return minTotal;
  }

  /**
   * Calculate clean sheet percentage
   */
  private calculateCleanSheetPercentage(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homePercentage = this.calculateTeamCleanSheetPercentage(
      fixture.homeTeamRecentMatches,
      fixture.teams.home.id,
      lastMatches,
    );
    const awayPercentage = this.calculateTeamCleanSheetPercentage(
      fixture.awayTeamRecentMatches,
      fixture.teams.away.id,
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homePercentage;
      case StrategyTarget.AWAY:
        return awayPercentage;
      case StrategyTarget.BOTH:
        if (homePercentage === null || awayPercentage === null) return null;
        return Math.min(homePercentage, awayPercentage);
    }
  }

  private calculateTeamCleanSheetPercentage(
    matches: KickerGPTMatchSummary[],
    teamId: number,
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let cleanSheets = 0;
    let totalMatches = 0;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      totalMatches++;
      const isHomeTeam = match.teams.home.id === teamId;
      const goalsConceded = isHomeTeam ? away : home;

      if (goalsConceded === 0) {
        cleanSheets++;
      }
    }

    if (totalMatches === 0) return null;
    return Math.round((cleanSheets / totalMatches) * 100);
  }

  /**
   * Calculate BTTS (Both Teams To Score) percentage
   */
  private calculateBTTSPercentage(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    const homeBTTS = this.calculateTeamBTTSPercentage(
      fixture.homeTeamRecentMatches,
      lastMatches,
    );
    const awayBTTS = this.calculateTeamBTTSPercentage(
      fixture.awayTeamRecentMatches,
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeBTTS;
      case StrategyTarget.AWAY:
        return awayBTTS;
      case StrategyTarget.BOTH:
        if (homeBTTS === null || awayBTTS === null) return null;
        return Math.round((homeBTTS + awayBTTS) / 2);
    }
  }

  private calculateTeamBTTSPercentage(
    matches: KickerGPTMatchSummary[],
    lastMatches: number,
  ): number | null {
    if (!matches || matches.length === 0) {
      return null;
    }

    const recentMatches = this.getRecentMatches(matches, lastMatches);
    let bttsCount = 0;
    let totalMatches = 0;

    for (const match of recentMatches) {
      const { home, away } = match.goals;
      if (home === null || away === null) continue;

      totalMatches++;
      if (home > 0 && away > 0) {
        bttsCount++;
      }
    }

    if (totalMatches === 0) return null;
    return Math.round((bttsCount / totalMatches) * 100);
  }

  /**
   * Calculate minimum goals scored by a team in head-to-head matches
   * Returns the MINIMUM so that ">= X" checks if team scored at least X in EVERY H2H match
   */
  private calculateH2HGoalsScored(
    fixture: KickerGPTFixturesResponse,
    target: StrategyTarget,
    lastMatches: number,
  ): number | null {
    if (!fixture.h2h || fixture.h2h.length === 0) {
      return null;
    }

    const homeMin = this.calculateMinGoalsForTeam(
      fixture.h2h,
      fixture.teams.home.id,
      'scored',
      lastMatches,
    );
    const awayMin = this.calculateMinGoalsForTeam(
      fixture.h2h,
      fixture.teams.away.id,
      'scored',
      lastMatches,
    );

    switch (target) {
      case StrategyTarget.HOME:
        return homeMin;
      case StrategyTarget.AWAY:
        return awayMin;
      case StrategyTarget.BOTH:
        if (homeMin === null || awayMin === null) return null;
        return Math.min(homeMin, awayMin);
    }
  }

  /**
   * Compare two values using the given operator
   */
  private compareValues(
    actual: number,
    operator: StrategyOperator,
    expected: number,
  ): boolean {
    switch (operator) {
      case StrategyOperator.GREATER_THAN:
        return actual > expected;
      case StrategyOperator.LESS_THAN:
        return actual < expected;
      case StrategyOperator.EQUALS:
        return actual === expected;
      case StrategyOperator.GREATER_THAN_OR_EQUALS:
        return actual >= expected;
      case StrategyOperator.LESS_THAN_OR_EQUALS:
        return actual <= expected;
      default:
        return false;
    }
  }
}
