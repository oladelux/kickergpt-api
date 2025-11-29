import { OpenAiToolDefinition } from '../../openai/openai.service';
import {
  KickerGPTFixturesResponse,
  KickerGPTMatchSummary,
} from '../../fixtures/types/fixtures-response.type';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Builds specialized tools for POST-MATCH outcome analysis.
 * These tools are optimized for explaining WHY a result happened,
 * comparing expectations with reality.
 */
export function buildOutcomeAnalysisTools(
  context: KickerGPTFixturesResponse,
): OpenAiToolDefinition[] {
  const tools: OpenAiToolDefinition[] = [];

  const matchDate = new Date(context.date);
  const matchWeekday = WEEKDAYS[matchDate.getUTCDay()];
  const matchHour = matchDate.getUTCHours();
  const matchMonth = matchDate.getUTCMonth() + 1;

  const homeTeamId = context.teams.home.id;
  const awayTeamId = context.teams.away.id;
  const homeTeamName = context.teams.home.name;
  const awayTeamName = context.teams.away.name;

  const matches = [
    ...(context.h2h ?? []),
    ...(context.homeTeamRecentMatches ?? []),
    ...(context.awayTeamRecentMatches ?? []),
  ];

  //TODO: I need to exclude the unique matches from the allMatches array to avoid duplicates
  const allMatches = matches.filter(
    (match, index, self) => index === self.findIndex((t) => t.id === match.id),
  );

  // ============ MATCH CONTEXT TOOLS ============

  tools.push({
    name: 'get_match_context',
    description:
      'Get basic match details: venue, weather, referee, pre-match odds, and league info',
    handler: () => ({
      fixtureId: context.id,
      date: context.date,
      timezone: context.timezone,
      venue: context.venue,
      referee: context.referee,
      weather: context.weatherSummary,
      teams: {
        home: { id: homeTeamId, name: homeTeamName },
        away: { id: awayTeamId, name: awayTeamName },
      },
      preMatchOdds: {
        home: context.homeOdd,
        away: context.awayOdd,
        favorite: determineFavorite(
          context.homeOdd,
          context.awayOdd,
          context.teams,
        ),
      },
      isDerby: context.derby,
      league: context.league,
    }),
  });

  tools.push({
    name: 'get_final_result',
    description:
      'Get complete final score details including goal difference and total goals',
    handler: () => {
      if (!context.finalScore) {
        return { available: false, message: 'Match not completed yet' };
      }

      const { home, away, winner } = context.finalScore;

      return {
        score: { home, away },
        scoreString: `${homeTeamName} ${home} - ${away} ${awayTeamName}`,
        winner:
          winner === 'home'
            ? homeTeamName
            : winner === 'away'
              ? awayTeamName
              : 'Draw',
        winnerSide: winner,
        goalDifference: Math.abs(home - away),
        totalGoals: home + away,
        cleanSheet: {
          home: away === 0,
          away: home === 0,
        },
        bothTeamsScored: home > 0 && away > 0,
        wasHighScoring: home + away > 2.5,
      };
    },
  });

  // ============ EXPECTATION ANALYSIS TOOLS ============

  tools.push({
    name: 'compare_pre_match_odds',
    description:
      'Compare pre-match odds expectations with actual outcome - determines if result was an upset',
    handler: () => {
      const homeOdd = parseFloat(context.homeOdd ?? '0');
      const awayOdd = parseFloat(context.awayOdd ?? '0');
      const winner = context.finalScore?.winner;

      if (!homeOdd || !awayOdd) {
        return { available: false, message: 'Odds data unavailable' };
      }

      if (!winner) {
        return { available: false, message: 'Match not completed' };
      }

      const homeFavorite = homeOdd < awayOdd;
      const awayFavorite = awayOdd < homeOdd;
      const evenMatch = Math.abs(homeOdd - awayOdd) < 0.3;

      const isUpset =
        (homeFavorite && winner === 'away') ||
        (awayFavorite && winner === 'home');

      // Calculate implied probabilities
      const homeProb = homeOdd > 0 ? (1 / homeOdd) * 100 : 0;
      const awayProb = awayOdd > 0 ? (1 / awayOdd) * 100 : 0;

      return {
        odds: { home: context.homeOdd, away: context.awayOdd },
        impliedProbability: {
          homeWin: `${homeProb.toFixed(1)}%`,
          awayWin: `${awayProb.toFixed(1)}%`,
        },
        prMatchExpectation: {
          favorite: evenMatch
            ? 'Even match'
            : homeFavorite
              ? homeTeamName
              : awayTeamName,
          underdog: evenMatch
            ? 'Even match'
            : homeFavorite
              ? awayTeamName
              : homeTeamName,
          expectedWinner: evenMatch
            ? 'Too close to call'
            : homeFavorite
              ? homeTeamName
              : awayTeamName,
        },
        actualOutcome: {
          winner:
            winner === 'home'
              ? homeTeamName
              : winner === 'away'
                ? awayTeamName
                : 'Draw',
        },
        resultAnalysis: {
          isUpset,
          upsetMagnitude: isUpset
            ? calculateUpsetMagnitude(homeOdd, awayOdd, winner)
            : 'Not an upset',
          matchedExpectation: !isUpset && winner !== 'draw',
          description: getResultDescription(
            isUpset,
            winner,
            homeTeamName,
            awayTeamName,
            evenMatch,
          ),
        },
      };
    },
  });

  tools.push({
    name: 'calculate_expectation_delta',
    description:
      'Quantify the difference between expected and actual outcome including goals analysis',
    handler: () => {
      const homeOdd = parseFloat(context.homeOdd ?? '0');
      const awayOdd = parseFloat(context.awayOdd ?? '0');
      const { finalScore, h2h } = context;

      if (!finalScore) {
        return { available: false, message: 'Match not completed' };
      }

      // H2H average goals
      const h2hAvgGoals =
        h2h && h2h.length > 0
          ? h2h.reduce(
              (sum, m) => sum + (m.goals?.home ?? 0) + (m.goals?.away ?? 0),
              0,
            ) / h2h.length
          : null;

      // Expected goals based on odds (rough approximation)
      const totalGoals = finalScore.home + finalScore.away;

      return {
        goalsAnalysis: {
          totalGoals,
          h2hAverageGoals: h2hAvgGoals?.toFixed(2) ?? 'No H2H data',
          vsH2HAverage: h2hAvgGoals
            ? totalGoals > h2hAvgGoals
              ? `+${(totalGoals - h2hAvgGoals).toFixed(1)} vs H2H average`
              : totalGoals < h2hAvgGoals
                ? `${(totalGoals - h2hAvgGoals).toFixed(1)} vs H2H average`
                : 'Matched H2H average'
            : 'Cannot compare',
          over25: totalGoals > 2.5,
          btts: finalScore.home > 0 && finalScore.away > 0,
        },
        marginAnalysis: {
          goalDifference: Math.abs(finalScore.home - finalScore.away),
          wasCloseGame: Math.abs(finalScore.home - finalScore.away) <= 1,
          wasDominant: Math.abs(finalScore.home - finalScore.away) >= 3,
        },
        surpriseLevel: calculateSurpriseLevel(
          homeOdd,
          awayOdd,
          finalScore.winner,
          Math.abs(finalScore.home - finalScore.away),
        ),
      };
    },
  });

  // ============ FORM & HISTORY TOOLS ============

  tools.push({
    name: 'analyze_form_trajectory',
    description:
      'Analyze if teams were improving, stable, or declining coming into this match',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      const homeForm = calculateFormTrajectory(homeMatches, homeTeamId);
      const awayForm = calculateFormTrajectory(awayMatches, awayTeamId);

      // Compare with actual result
      const winner = context.finalScore?.winner;
      const formFavorite =
        homeForm.recentPoints > awayForm.recentPoints + 3
          ? homeTeamName
          : awayForm.recentPoints > homeForm.recentPoints + 3
            ? awayTeamName
            : 'Even';

      const formMatchedResult =
        (formFavorite === homeTeamName && winner === 'home') ||
        (formFavorite === awayTeamName && winner === 'away') ||
        formFavorite === 'Even';

      return {
        homeTeam: {
          name: homeTeamName,
          trajectory: homeForm.trajectory,
          recentForm: homeForm.form,
          last5Points: `${homeForm.recentPoints}/15`,
          momentum: homeForm.momentum,
        },
        awayTeam: {
          name: awayTeamName,
          trajectory: awayForm.trajectory,
          recentForm: awayForm.form,
          last5Points: `${awayForm.recentPoints}/15`,
          momentum: awayForm.momentum,
        },
        formComparison: {
          betterForm: formFavorite,
          pointsDifference: Math.abs(
            homeForm.recentPoints - awayForm.recentPoints,
          ),
          formMatchedResult,
          insight: getFormInsight(
            homeForm,
            awayForm,
            winner,
            homeTeamName,
            awayTeamName,
          ),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_h2h_patterns',
    description:
      'Analyze head-to-head history and whether this result follows historical patterns',
    handler: () => {
      const h2h = context.h2h ?? [];

      if (h2h.length === 0) {
        return {
          available: false,
          message: 'No head-to-head history available',
        };
      }

      const homeRecord = calculateTeamRecord(h2h, homeTeamId);
      const awayRecord = calculateTeamRecord(h2h, awayTeamId);

      const historicalFavorite =
        homeRecord.wins > awayRecord.wins
          ? homeTeamName
          : awayRecord.wins > homeRecord.wins
            ? awayTeamName
            : 'Even';

      const winner = context.finalScore?.winner;
      const actualWinner =
        winner === 'home'
          ? homeTeamName
          : winner === 'away'
            ? awayTeamName
            : 'Draw';

      const followsPattern =
        historicalFavorite === actualWinner || historicalFavorite === 'Even';

      // Calculate average goals in H2H
      const avgGoals =
        h2h.reduce(
          (sum, m) => sum + (m.goals?.home ?? 0) + (m.goals?.away ?? 0),
          0,
        ) / h2h.length;

      return {
        totalMeetings: h2h.length,
        records: {
          [homeTeamName]: {
            wins: homeRecord.wins,
            draws: homeRecord.draws,
            losses: homeRecord.losses,
            winPercentage: `${Math.round((homeRecord.wins / h2h.length) * 100)}%`,
          },
          [awayTeamName]: {
            wins: awayRecord.wins,
            draws: awayRecord.draws,
            losses: awayRecord.losses,
            winPercentage: `${Math.round((awayRecord.wins / h2h.length) * 100)}%`,
          },
        },
        historicalDominant: historicalFavorite,
        h2hStats: {
          averageGoals: avgGoals.toFixed(2),
          homeWinsAtHome: h2h.filter(
            (m) =>
              m.teams.home.id === homeTeamId &&
              (m.goals?.home ?? 0) > (m.goals?.away ?? 0),
          ).length,
          awayWinsAway: h2h.filter(
            (m) =>
              m.teams.away.id === awayTeamId &&
              (m.goals?.away ?? 0) > (m.goals?.home ?? 0),
          ).length,
        },
        patternAnalysis: {
          actualWinner,
          followsHistoricalPattern: followsPattern,
          insight: followsPattern
            ? `Result aligns with H2H history (${historicalFavorite} dominates)`
            : `Result breaks H2H pattern (${historicalFavorite} usually dominates but ${actualWinner} won)`,
        },
        recentH2H: h2h.slice(0, 5).map((m) => ({
          date: m.date,
          score: `${m.goals?.home ?? 0}-${m.goals?.away ?? 0}`,
          homeTeam: m.teams.home.name,
          awayTeam: m.teams.away.name,
        })),
      };
    },
  });

  tools.push({
    name: 'analyze_momentum',
    description:
      'Analyze current streaks, unbeaten runs, and confidence levels',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      const homeMomentum = analyzeMomentum(homeMatches, homeTeamId);
      const awayMomentum = analyzeMomentum(awayMatches, awayTeamId);

      const winner = context.finalScore?.winner;

      return {
        homeTeam: {
          name: homeTeamName,
          ...homeMomentum,
        },
        awayTeam: {
          name: awayTeamName,
          ...awayMomentum,
        },
        momentumAdvantage: getMomentumAdvantage(
          homeMomentum,
          awayMomentum,
          winner,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  // ============ CONTEXTUAL FACTOR TOOLS ============

  tools.push({
    name: 'analyze_home_away_context',
    description:
      'Analyze venue advantage and how teams perform at home vs away',
    handler: () => {
      const homeTeamHomeGames = (context.homeTeamRecentMatches ?? []).filter(
        (m) => m.teams.home.id === homeTeamId,
      );
      const homeTeamAwayGames = (context.homeTeamRecentMatches ?? []).filter(
        (m) => m.teams.away.id === homeTeamId,
      );
      const awayTeamAwayGames = (context.awayTeamRecentMatches ?? []).filter(
        (m) => m.teams.away.id === awayTeamId,
      );
      const awayTeamHomeGames = (context.awayTeamRecentMatches ?? []).filter(
        (m) => m.teams.home.id === awayTeamId,
      );

      const homeTeamHomeRecord = calculateTeamRecord(
        homeTeamHomeGames,
        homeTeamId,
      );
      const homeTeamAwayRecord = calculateTeamRecord(
        homeTeamAwayGames,
        homeTeamId,
      );
      const awayTeamAwayRecord = calculateTeamRecord(
        awayTeamAwayGames,
        awayTeamId,
      );
      const awayTeamHomeRecord = calculateTeamRecord(
        awayTeamHomeGames,
        awayTeamId,
      );

      const winner = context.finalScore?.winner;

      return {
        homeTeam: {
          name: homeTeamName,
          playingAt: 'Home',
          homeRecord: homeTeamHomeRecord,
          awayRecord: homeTeamAwayRecord,
          homeWinRate:
            homeTeamHomeGames.length > 0
              ? `${Math.round((homeTeamHomeRecord.wins / homeTeamHomeGames.length) * 100)}%`
              : 'N/A',
          homeAdvantageStrength: assessHomeAdvantage(
            homeTeamHomeGames,
            homeTeamAwayGames,
            homeTeamId,
          ),
        },
        awayTeam: {
          name: awayTeamName,
          playingAt: 'Away',
          awayRecord: awayTeamAwayRecord,
          homeRecord: awayTeamHomeRecord,
          awayWinRate:
            awayTeamAwayGames.length > 0
              ? `${Math.round((awayTeamAwayRecord.wins / awayTeamAwayGames.length) * 100)}%`
              : 'N/A',
          awayFormStrength: assessAwayForm(awayTeamAwayGames, awayTeamId),
        },
        venueImpactAnalysis: assessVenueImpact(
          homeTeamHomeRecord,
          awayTeamAwayRecord,
          winner,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_injury_impact',
    description:
      'Assess squad availability and how injuries may have affected the result',
    handler: () => {
      const homeInjuries = context.homeInjuries ?? [];
      const awayInjuries = context.awayInjuries ?? [];

      const winner = context.finalScore?.winner;

      return {
        homeTeam: {
          name: homeTeamName,
          injuredCount: homeInjuries.length,
          keyAbsences: homeInjuries.slice(0, 5).map((p) => ({
            player: p.name,
            reason: p.reason,
          })),
        },
        awayTeam: {
          name: awayTeamName,
          injuredCount: awayInjuries.length,
          keyAbsences: awayInjuries.slice(0, 5).map((p) => ({
            player: p.name,
            reason: p.reason,
          })),
        },
        injuryDisparity: {
          difference: Math.abs(homeInjuries.length - awayInjuries.length),
          moreAvailable:
            homeInjuries.length < awayInjuries.length
              ? homeTeamName
              : awayInjuries.length < homeInjuries.length
                ? awayTeamName
                : 'Even',
          significance:
            Math.abs(homeInjuries.length - awayInjuries.length) >= 3
              ? 'Significant'
              : Math.abs(homeInjuries.length - awayInjuries.length) >= 1
                ? 'Moderate'
                : 'Minimal',
        },
        impactAssessment: assessInjuryImpact(
          homeInjuries.length,
          awayInjuries.length,
          winner,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_schedule_fatigue',
    description:
      'Check rest days since last match and recent schedule congestion',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      const homeRestDays = calculateRestDays(homeMatches, context.date);
      const awayRestDays = calculateRestDays(awayMatches, context.date);
      const homeMatchesLast30 = countRecentMatches(homeMatches, 30);
      const awayMatchesLast30 = countRecentMatches(awayMatches, 30);

      const winner = context.finalScore?.winner;

      return {
        homeTeam: {
          name: homeTeamName,
          daysSinceLastMatch: homeRestDays ?? 'Unknown',
          matchesLast30Days: homeMatchesLast30,
          fatigueLevel: assessFatigueLevel(homeRestDays, homeMatchesLast30),
          lastMatch: getLastMatchInfo(homeMatches, homeTeamId),
        },
        awayTeam: {
          name: awayTeamName,
          daysSinceLastMatch: awayRestDays ?? 'Unknown',
          matchesLast30Days: awayMatchesLast30,
          fatigueLevel: assessFatigueLevel(awayRestDays, awayMatchesLast30),
          lastMatch: getLastMatchInfo(awayMatches, awayTeamId),
        },
        restComparison: {
          moreRested: getMoreRestedTeam(
            homeRestDays,
            awayRestDays,
            homeTeamName,
            awayTeamName,
          ),
          restDifference:
            homeRestDays !== null && awayRestDays !== null
              ? Math.abs(homeRestDays - awayRestDays)
              : null,
        },
        fatigueImpact: assessFatigueImpact(
          homeRestDays,
          awayRestDays,
          homeMatchesLast30,
          awayMatchesLast30,
          winner,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_weather_influence',
    description:
      'Check how teams historically perform in similar weather conditions',
    handler: () => {
      const weather = context.weatherSummary?.toLowerCase() ?? '';
      const weatherKeyword = weather.split(' ')[0];

      if (!weatherKeyword) {
        return { available: false, message: 'Weather data unavailable' };
      }

      const similarConditionMatches = allMatches.filter((m) => {
        const w = m.weatherSummary?.toLowerCase() ?? '';
        return (
          w.includes(weatherKeyword) || weatherKeyword.includes(w.split(' ')[0])
        );
      });

      if (similarConditionMatches.length < 3) {
        return {
          matchConditions: context.weatherSummary,
          historicalSample: similarConditionMatches.length,
          available: false,
          message:
            'Insufficient data for weather analysis (< 3 matches in similar conditions)',
        };
      }

      const homeRecord = calculateTeamRecord(
        similarConditionMatches,
        homeTeamId,
      );
      const awayRecord = calculateTeamRecord(
        similarConditionMatches,
        awayTeamId,
      );

      return {
        matchConditions: context.weatherSummary,
        historicalSample: similarConditionMatches.length,
        performanceInSimilarConditions: {
          [homeTeamName]: {
            ...homeRecord,
            winRate:
              homeRecord.total > 0
                ? `${Math.round((homeRecord.wins / homeRecord.total) * 100)}%`
                : 'N/A',
          },
          [awayTeamName]: {
            ...awayRecord,
            winRate:
              awayRecord.total > 0
                ? `${Math.round((awayRecord.wins / awayRecord.total) * 100)}%`
                : 'N/A',
          },
        },
        weatherAdvantage: assessWeatherAdvantage(
          similarConditionMatches,
          homeTeamId,
          awayTeamId,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_referee_tendencies',
    description:
      'Check historical results when this referee has officiated either team',
    handler: () => {
      if (!context.referee || context.referee === 'unknown') {
        return { available: false, message: 'Referee information unavailable' };
      }

      const refereeName = context.referee.toLowerCase();
      const refereeMatches = allMatches.filter(
        (m) => m.referee?.toLowerCase() === refereeName,
      );

      if (refereeMatches.length === 0) {
        return {
          referee: context.referee,
          available: false,
          message: 'No historical matches found with this referee',
        };
      }

      const homeRecord = calculateTeamRecord(refereeMatches, homeTeamId);
      const awayRecord = calculateTeamRecord(refereeMatches, awayTeamId);

      const winner = context.finalScore?.winner;

      return {
        referee: context.referee,
        matchesWithThisReferee: refereeMatches.length,
        teamRecordsUnderReferee: {
          [homeTeamName]: {
            ...homeRecord,
            winRate:
              homeRecord.total > 0
                ? `${Math.round((homeRecord.wins / homeRecord.total) * 100)}%`
                : 'N/A',
          },
          [awayTeamName]: {
            ...awayRecord,
            winRate:
              awayRecord.total > 0
                ? `${Math.round((awayRecord.wins / awayRecord.total) * 100)}%`
                : 'N/A',
          },
        },
        refereePatternAnalysis: assessRefereePattern(
          homeRecord,
          awayRecord,
          winner,
          homeTeamName,
          awayTeamName,
        ),
      };
    },
  });

  // ============ SPECIAL ANALYSIS TOOLS ============

  tools.push({
    name: 'identify_upset_factors',
    description:
      'If this was an upset, identify what factors may have enabled it',
    handler: () => {
      const homeOdd = parseFloat(context.homeOdd ?? '0');
      const awayOdd = parseFloat(context.awayOdd ?? '0');
      const winner = context.finalScore?.winner;

      if (!homeOdd || !awayOdd || !winner || winner === 'draw') {
        return {
          isUpset: false,
          message:
            'Cannot determine upset status (no odds, no result, or draw)',
        };
      }

      const isUpset =
        (homeOdd < awayOdd && winner === 'away') ||
        (awayOdd < homeOdd && winner === 'home');

      if (!isUpset) {
        return {
          isUpset: false,
          message:
            'This was not an upset - result matched pre-match expectations',
          expectedWinner: homeOdd < awayOdd ? homeTeamName : awayTeamName,
          actualWinner: winner === 'home' ? homeTeamName : awayTeamName,
        };
      }

      const upsetTeamId = winner === 'home' ? homeTeamId : awayTeamId;
      const upsetTeamName = winner === 'home' ? homeTeamName : awayTeamName;
      const favoriteTeamName = winner === 'home' ? awayTeamName : homeTeamName;
      const upsetTeamOdd =
        winner === 'home' ? context.homeOdd : context.awayOdd;
      const favoriteOdd = winner === 'home' ? context.awayOdd : context.homeOdd;

      const upsetTeamMatches =
        winner === 'home'
          ? (context.homeTeamRecentMatches ?? [])
          : (context.awayTeamRecentMatches ?? []);
      const favoriteMatches =
        winner === 'home'
          ? (context.awayTeamRecentMatches ?? [])
          : (context.homeTeamRecentMatches ?? []);

      // Gather potential upset factors
      const factors: { factor: string; evidence: string }[] = [];

      // 1. Form trajectory
      const upsetForm = calculateFormTrajectory(upsetTeamMatches, upsetTeamId);
      if (upsetForm.trajectory === 'improving') {
        factors.push({
          factor: 'Rising Form',
          evidence: `${upsetTeamName} was on an improving trajectory with form ${upsetForm.form}`,
        });
      }

      // 2. Home advantage (if home team upset)
      if (winner === 'home') {
        const homeGames = upsetTeamMatches.filter(
          (m) => m.teams.home.id === upsetTeamId,
        );
        const homeRecord = calculateTeamRecord(homeGames, upsetTeamId);
        if (homeRecord.wins >= homeRecord.losses) {
          factors.push({
            factor: 'Home Advantage',
            evidence: `${upsetTeamName} has a strong home record (${homeRecord.wins}W-${homeRecord.draws}D-${homeRecord.losses}L)`,
          });
        }
      }

      // 3. H2H history
      const h2hRecord = calculateTeamRecord(context.h2h ?? [], upsetTeamId);
      if (h2hRecord.wins > h2hRecord.losses) {
        factors.push({
          factor: 'Historical Dominance',
          evidence: `${upsetTeamName} has a positive H2H record (${h2hRecord.wins}W-${h2hRecord.draws}D-${h2hRecord.losses}L)`,
        });
      }

      // 4. Rest advantage
      const upsetRest = calculateRestDays(upsetTeamMatches, context.date);
      const favoriteRest = calculateRestDays(favoriteMatches, context.date);
      if (
        upsetRest !== null &&
        favoriteRest !== null &&
        upsetRest > favoriteRest + 2
      ) {
        factors.push({
          factor: 'Rest Advantage',
          evidence: `${upsetTeamName} had more rest (${upsetRest} vs ${favoriteRest} days)`,
        });
      }

      // 5. Injury disparity
      const upsetInjuries =
        winner === 'home'
          ? (context.homeInjuries?.length ?? 0)
          : (context.awayInjuries?.length ?? 0);
      const favoriteInjuries =
        winner === 'home'
          ? (context.awayInjuries?.length ?? 0)
          : (context.homeInjuries?.length ?? 0);
      if (favoriteInjuries > upsetInjuries + 2) {
        factors.push({
          factor: 'Favorite Weakened by Injuries',
          evidence: `${favoriteTeamName} had ${favoriteInjuries} players injured vs ${upsetInjuries} for ${upsetTeamName}`,
        });
      }

      // 6. Favorite's declining form
      const favoriteTeamId = winner === 'home' ? awayTeamId : homeTeamId;
      const favoriteForm = calculateFormTrajectory(
        favoriteMatches,
        favoriteTeamId,
      );
      if (favoriteForm.trajectory === 'declining') {
        factors.push({
          factor: 'Favorite in Decline',
          evidence: `${favoriteTeamName} was on a declining trajectory with form ${favoriteForm.form}`,
        });
      }

      return {
        isUpset: true,
        upsetDetails: {
          upsetTeam: upsetTeamName,
          upsetOdds: upsetTeamOdd,
          favoriteTeam: favoriteTeamName,
          favoriteOdds: favoriteOdd,
        },
        contributingFactors:
          factors.length > 0
            ? factors
            : [
                {
                  factor: 'Match-day Variance',
                  evidence:
                    'No clear pre-match indicators - football unpredictability',
                },
              ],
        factorCount: factors.length,
      };
    },
  });

  tools.push({
    name: 'analyze_weekday_patterns',
    description: `Analyze how both teams historically perform on ${matchWeekday}s - was this day favorable for either team?`,
    handler: () => {
      const sameDayMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        return WEEKDAYS[d.getUTCDay()] === matchWeekday;
      });

      if (sameDayMatches.length < 2) {
        return {
          matchDay: matchWeekday,
          available: false,
          message: `Insufficient data for ${matchWeekday} analysis`,
        };
      }

      const homeRecord = calculateTeamRecord(sameDayMatches, homeTeamId);
      const awayRecord = calculateTeamRecord(sameDayMatches, awayTeamId);
      const winner = context.finalScore?.winner;

      // Determine if the day pattern predicted the result
      const dayFavorite =
        homeRecord.wins > awayRecord.wins + 1
          ? homeTeamName
          : awayRecord.wins > homeRecord.wins + 1
            ? awayTeamName
            : 'Even';

      const actualWinner =
        winner === 'home'
          ? homeTeamName
          : winner === 'away'
            ? awayTeamName
            : 'Draw';
      const patternMatched =
        dayFavorite === actualWinner || dayFavorite === 'Even';

      return {
        matchDay: matchWeekday,
        sampleSize: sameDayMatches.length,
        homeTeam: {
          name: homeTeamName,
          recordOn: matchWeekday,
          ...homeRecord,
          winRate:
            homeRecord.total > 0
              ? `${Math.round((homeRecord.wins / homeRecord.total) * 100)}%`
              : 'N/A',
        },
        awayTeam: {
          name: awayTeamName,
          recordOn: matchWeekday,
          ...awayRecord,
          winRate:
            awayRecord.total > 0
              ? `${Math.round((awayRecord.wins / awayRecord.total) * 100)}%`
              : 'N/A',
        },
        dayPatternAnalysis: {
          historicalFavorite: dayFavorite,
          actualWinner,
          patternMatched,
          insight: getDayPatternInsight(
            homeRecord,
            awayRecord,
            winner,
            homeTeamName,
            awayTeamName,
            matchWeekday,
          ),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_kickoff_time_patterns',
    description: `Analyze how both teams perform at similar kickoff times (around ${matchHour}:00) - do they perform differently at different times of day?`,
    handler: () => {
      // Group into time slots: early (before 14:00), afternoon (14:00-17:59), evening (18:00-20:59), night (21:00+)
      const timeSlot = getTimeSlot(matchHour);

      const sameTimeMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        return getTimeSlot(d.getUTCHours()) === timeSlot;
      });

      // Also get exact hour matches for more precision
      const exactHourMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        const hour = d.getUTCHours();
        return Math.abs(hour - matchHour) <= 1; // Within 1 hour
      });

      if (sameTimeMatches.length < 2) {
        return {
          kickoffTime: `${matchHour}:00`,
          timeSlot,
          available: false,
          message: `Insufficient data for ${timeSlot} kickoff analysis`,
        };
      }

      const homeRecordSlot = calculateTeamRecord(sameTimeMatches, homeTeamId);
      const awayRecordSlot = calculateTeamRecord(sameTimeMatches, awayTeamId);
      const homeRecordExact = calculateTeamRecord(exactHourMatches, homeTeamId);
      const awayRecordExact = calculateTeamRecord(exactHourMatches, awayTeamId);

      const winner = context.finalScore?.winner;

      return {
        kickoffTime: `${matchHour}:00 UTC`,
        timeSlot,
        timeSlotAnalysis: {
          sampleSize: sameTimeMatches.length,
          homeTeam: {
            name: homeTeamName,
            ...homeRecordSlot,
            winRate:
              homeRecordSlot.total > 0
                ? `${Math.round((homeRecordSlot.wins / homeRecordSlot.total) * 100)}%`
                : 'N/A',
          },
          awayTeam: {
            name: awayTeamName,
            ...awayRecordSlot,
            winRate:
              awayRecordSlot.total > 0
                ? `${Math.round((awayRecordSlot.wins / awayRecordSlot.total) * 100)}%`
                : 'N/A',
          },
        },
        exactTimeAnalysis:
          exactHourMatches.length >= 2
            ? {
                sampleSize: exactHourMatches.length,
                homeTeam: { name: homeTeamName, ...homeRecordExact },
                awayTeam: { name: awayTeamName, ...awayRecordExact },
              }
            : { available: false, message: 'Limited exact time data' },
        kickoffTimeImpact: getKickoffTimeInsight(
          homeRecordSlot,
          awayRecordSlot,
          winner,
          homeTeamName,
          awayTeamName,
          timeSlot,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_day_and_time_combined',
    description: `Analyze performance on ${matchWeekday}s at ${getTimeSlot(matchHour)} kickoffs - the specific combination of day and time`,
    handler: () => {
      const timeSlot = getTimeSlot(matchHour);

      const combinedMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        const dayMatch = WEEKDAYS[d.getUTCDay()] === matchWeekday;
        const timeMatch = getTimeSlot(d.getUTCHours()) === timeSlot;
        return dayMatch && timeMatch;
      });

      if (combinedMatches.length < 2) {
        return {
          matchDay: matchWeekday,
          timeSlot,
          available: false,
          message: `Insufficient data for ${matchWeekday} ${timeSlot} combination`,
          suggestion: 'Check individual day and time patterns separately',
        };
      }

      const homeRecord = calculateTeamRecord(combinedMatches, homeTeamId);
      const awayRecord = calculateTeamRecord(combinedMatches, awayTeamId);
      const winner = context.finalScore?.winner;

      return {
        matchDay: matchWeekday,
        timeSlot,
        kickoffHour: `${matchHour}:00 UTC`,
        combinedSampleSize: combinedMatches.length,
        homeTeam: {
          name: homeTeamName,
          recordInSlot: `${homeRecord.wins}W-${homeRecord.draws}D-${homeRecord.losses}L`,
          ...homeRecord,
          winRate:
            homeRecord.total > 0
              ? `${Math.round((homeRecord.wins / homeRecord.total) * 100)}%`
              : 'N/A',
        },
        awayTeam: {
          name: awayTeamName,
          recordInSlot: `${awayRecord.wins}W-${awayRecord.draws}D-${awayRecord.losses}L`,
          ...awayRecord,
          winRate:
            awayRecord.total > 0
              ? `${Math.round((awayRecord.wins / awayRecord.total) * 100)}%`
              : 'N/A',
        },
        combinedPatternAnalysis: getCombinedDayTimeInsight(
          homeRecord,
          awayRecord,
          winner,
          homeTeamName,
          awayTeamName,
          matchWeekday,
          timeSlot,
        ),
        matchesInSlot: combinedMatches.slice(0, 5).map((m) => ({
          date: m.date,
          teams: `${m.teams.home.name} vs ${m.teams.away.name}`,
          score: `${m.goals?.home ?? 0}-${m.goals?.away ?? 0}`,
        })),
      };
    },
  });

  tools.push({
    name: 'analyze_monthly_patterns',
    description: `Analyze how teams historically perform in this month (${getMonthName(matchMonth)}) - seasonal form patterns`,
    handler: () => {
      const sameMonthMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        return d.getUTCMonth() + 1 === matchMonth;
      });

      if (sameMonthMatches.length < 2) {
        return {
          month: getMonthName(matchMonth),
          available: false,
          message: `Insufficient data for ${getMonthName(matchMonth)} analysis`,
        };
      }

      const homeRecord = calculateTeamRecord(sameMonthMatches, homeTeamId);
      const awayRecord = calculateTeamRecord(sameMonthMatches, awayTeamId);
      const winner = context.finalScore?.winner;

      // Calculate goals per game in this month
      const homeGoalsInMonth = calculateGoalsInMatches(
        sameMonthMatches,
        homeTeamId,
      );
      const awayGoalsInMonth = calculateGoalsInMatches(
        sameMonthMatches,
        awayTeamId,
      );

      return {
        month: getMonthName(matchMonth),
        sampleSize: sameMonthMatches.length,
        homeTeam: {
          name: homeTeamName,
          ...homeRecord,
          winRate:
            homeRecord.total > 0
              ? `${Math.round((homeRecord.wins / homeRecord.total) * 100)}%`
              : 'N/A',
          avgGoalsScored: homeGoalsInMonth.avgScored,
          avgGoalsConceded: homeGoalsInMonth.avgConceded,
        },
        awayTeam: {
          name: awayTeamName,
          ...awayRecord,
          winRate:
            awayRecord.total > 0
              ? `${Math.round((awayRecord.wins / awayRecord.total) * 100)}%`
              : 'N/A',
          avgGoalsScored: awayGoalsInMonth.avgScored,
          avgGoalsConceded: awayGoalsInMonth.avgConceded,
        },
        monthlyPatternAnalysis: getMonthlyPatternInsight(
          homeRecord,
          awayRecord,
          winner,
          homeTeamName,
          awayTeamName,
          getMonthName(matchMonth),
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_time_preference_comparison',
    description:
      'Compare how each team performs across different time slots to identify preferences',
    handler: () => {
      const timeSlots = ['early', 'afternoon', 'evening', 'night'] as const;
      const currentSlot = getTimeSlot(matchHour);

      const homePerformanceBySlot: Record<
        string,
        { wins: number; draws: number; losses: number; total: number }
      > = {};
      const awayPerformanceBySlot: Record<
        string,
        { wins: number; draws: number; losses: number; total: number }
      > = {};

      for (const slot of timeSlots) {
        const slotMatches = allMatches.filter((m) => {
          const d = new Date(m.date);
          return getTimeSlot(d.getUTCHours()) === slot;
        });

        homePerformanceBySlot[slot] = calculateTeamRecord(
          slotMatches,
          homeTeamId,
        );
        awayPerformanceBySlot[slot] = calculateTeamRecord(
          slotMatches,
          awayTeamId,
        );
      }

      // Find best and worst time slots for each team
      const homeBestSlot = findBestTimeSlot(homePerformanceBySlot);
      const homeWorstSlot = findWorstTimeSlot(homePerformanceBySlot);
      const awayBestSlot = findBestTimeSlot(awayPerformanceBySlot);
      const awayWorstSlot = findWorstTimeSlot(awayPerformanceBySlot);

      const winner = context.finalScore?.winner;

      return {
        matchTimeSlot: currentSlot,
        homeTeam: {
          name: homeTeamName,
          performanceByTimeSlot: formatTimeSlotPerformance(
            homePerformanceBySlot,
          ),
          bestTimeSlot: homeBestSlot,
          worstTimeSlot: homeWorstSlot,
          playedInPreferredSlot: homeBestSlot.slot === currentSlot,
          playedInWorstSlot: homeWorstSlot.slot === currentSlot,
        },
        awayTeam: {
          name: awayTeamName,
          performanceByTimeSlot: formatTimeSlotPerformance(
            awayPerformanceBySlot,
          ),
          bestTimeSlot: awayBestSlot,
          worstTimeSlot: awayWorstSlot,
          playedInPreferredSlot: awayBestSlot.slot === currentSlot,
          playedInWorstSlot: awayWorstSlot.slot === currentSlot,
        },
        timeSlotAdvantage: getTimeSlotAdvantageInsight(
          homePerformanceBySlot[currentSlot],
          awayPerformanceBySlot[currentSlot],
          winner,
          homeTeamName,
          awayTeamName,
          currentSlot,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_weekday_preference_comparison',
    description:
      'Compare how each team performs across different days of the week',
    handler: () => {
      const currentDay = matchWeekday;

      const homePerformanceByDay: Record<
        string,
        { wins: number; draws: number; losses: number; total: number }
      > = {};
      const awayPerformanceByDay: Record<
        string,
        { wins: number; draws: number; losses: number; total: number }
      > = {};

      for (const day of WEEKDAYS) {
        const dayMatches = allMatches.filter((m) => {
          const d = new Date(m.date);
          return WEEKDAYS[d.getUTCDay()] === day;
        });

        homePerformanceByDay[day] = calculateTeamRecord(dayMatches, homeTeamId);
        awayPerformanceByDay[day] = calculateTeamRecord(dayMatches, awayTeamId);
      }

      // Find best and worst days for each team
      const homeBestDay = findBestDay(homePerformanceByDay);
      const homeWorstDay = findWorstDay(homePerformanceByDay);
      const awayBestDay = findBestDay(awayPerformanceByDay);
      const awayWorstDay = findWorstDay(awayPerformanceByDay);

      const winner = context.finalScore?.winner;

      return {
        matchDay: currentDay,
        homeTeam: {
          name: homeTeamName,
          performanceByDay: formatDayPerformance(homePerformanceByDay),
          bestDay: homeBestDay,
          worstDay: homeWorstDay,
          playedOnBestDay: homeBestDay.day === currentDay,
          playedOnWorstDay: homeWorstDay.day === currentDay,
        },
        awayTeam: {
          name: awayTeamName,
          performanceByDay: formatDayPerformance(awayPerformanceByDay),
          bestDay: awayBestDay,
          worstDay: awayWorstDay,
          playedOnBestDay: awayBestDay.day === currentDay,
          playedOnWorstDay: awayWorstDay.day === currentDay,
        },
        dayAdvantage: getDayAdvantageInsight(
          homePerformanceByDay[currentDay],
          awayPerformanceByDay[currentDay],
          winner,
          homeTeamName,
          awayTeamName,
          currentDay,
        ),
      };
    },
  });

  return tools;
}

// ============ HELPER FUNCTIONS ============

function getTeamResult(
  match: KickerGPTMatchSummary,
  teamId: number,
): 'win' | 'draw' | 'loss' | null {
  const isHome = match.teams.home.id === teamId;
  const isAway = match.teams.away.id === teamId;
  if (!isHome && !isAway) return null;

  const homeGoals = match.goals?.home;
  const awayGoals = match.goals?.away;
  if (homeGoals == null || awayGoals == null) return null;

  if (homeGoals === awayGoals) return 'draw';
  const homeWon = homeGoals > awayGoals;
  return (isHome && homeWon) || (isAway && !homeWon) ? 'win' : 'loss';
}

function calculateTeamRecord(
  matches: KickerGPTMatchSummary[],
  teamId: number,
): { wins: number; draws: number; losses: number; total: number } {
  let wins = 0,
    draws = 0,
    losses = 0;

  for (const m of matches) {
    const result = getTeamResult(m, teamId);
    if (result === 'win') wins++;
    else if (result === 'draw') draws++;
    else if (result === 'loss') losses++;
  }

  return { wins, draws, losses, total: wins + draws + losses };
}

function calculateFormTrajectory(
  matches: KickerGPTMatchSummary[],
  teamId: number,
): {
  trajectory: string;
  recentPoints: number;
  form: string;
  momentum: string;
} {
  const recent5 = matches.slice(0, 5);
  const previous5 = matches.slice(5, 10);

  const recentRecord = calculateTeamRecord(recent5, teamId);
  const previousRecord = calculateTeamRecord(previous5, teamId);

  const recentPoints = recentRecord.wins * 3 + recentRecord.draws;
  const previousPoints = previousRecord.wins * 3 + previousRecord.draws;

  const pointsDiff = recentPoints - previousPoints;

  const trajectory =
    pointsDiff > 2 ? 'improving' : pointsDiff < -2 ? 'declining' : 'stable';

  const form = recent5
    .map((m) => {
      const r = getTeamResult(m, teamId);
      return r === 'win' ? 'W' : r === 'draw' ? 'D' : r === 'loss' ? 'L' : '?';
    })
    .join('');

  const momentum =
    recentPoints >= 12
      ? 'Excellent'
      : recentPoints >= 9
        ? 'Good'
        : recentPoints >= 6
          ? 'Average'
          : 'Poor';

  return { trajectory, recentPoints, form, momentum };
}

function analyzeMomentum(
  matches: KickerGPTMatchSummary[],
  teamId: number,
): {
  form: string;
  currentStreak: string;
  unbeatenRun: number;
  confidence: string;
} {
  const results: Array<'W' | 'D' | 'L'> = [];

  for (const m of matches.slice(0, 10)) {
    const result = getTeamResult(m, teamId);
    if (result === 'win') results.push('W');
    else if (result === 'draw') results.push('D');
    else if (result === 'loss') results.push('L');
  }

  // Current streak
  let streakCount = 0;
  const firstResult = results[0];
  for (const r of results) {
    if (r === firstResult) streakCount++;
    else break;
  }
  const streakLabel =
    firstResult === 'W' ? 'wins' : firstResult === 'D' ? 'draws' : 'losses';
  const currentStreak =
    results.length > 0 ? `${streakCount} ${streakLabel}` : 'No data';

  // Unbeaten run
  let unbeatenRun = 0;
  for (const r of results) {
    if (r === 'L') break;
    unbeatenRun++;
  }

  // Confidence
  const last5Points = results
    .slice(0, 5)
    .reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const confidence =
    last5Points >= 12
      ? 'High'
      : last5Points >= 9
        ? 'Good'
        : last5Points >= 6
          ? 'Average'
          : 'Low';

  return {
    form: results.slice(0, 5).join('') || 'N/A',
    currentStreak,
    unbeatenRun,
    confidence,
  };
}

function calculateRestDays(
  matches: KickerGPTMatchSummary[],
  upcomingDate: string,
): number | null {
  if (!matches.length) return null;
  const sorted = [...matches].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const lastMatch = sorted[0];
  if (!lastMatch) return null;
  const last = new Date(lastMatch.date);
  const upcoming = new Date(upcomingDate);
  const diffMs = upcoming.getTime() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function countRecentMatches(
  matches: KickerGPTMatchSummary[],
  days: number,
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return matches.filter((m) => new Date(m.date) >= cutoff).length;
}

function getLastMatchInfo(matches: KickerGPTMatchSummary[], teamId: number) {
  const sorted = [...matches].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const last = sorted[0];
  if (!last) return null;
  return {
    date: last.date,
    opponent:
      last.teams.home.id === teamId
        ? last.teams.away.name
        : last.teams.home.name,
    result: getTeamResult(last, teamId),
    score: `${last.goals?.home ?? 0}-${last.goals?.away ?? 0}`,
  };
}

function determineFavorite(
  homeOdd: string | undefined,
  awayOdd: string | undefined,
  teams: { home: { name: string }; away: { name: string } },
): string {
  const home = parseFloat(homeOdd ?? '0');
  const away = parseFloat(awayOdd ?? '0');
  if (!home || !away) return 'Unknown';
  if (Math.abs(home - away) < 0.3) return 'Even match';
  return home < away ? teams.home.name : teams.away.name;
}

function calculateUpsetMagnitude(
  homeOdd: number,
  awayOdd: number,
  winner: 'home' | 'away' | 'draw',
): string {
  const winnerOdd = winner === 'home' ? homeOdd : awayOdd;
  if (winnerOdd >= 4) return 'Major upset';
  if (winnerOdd >= 2.5) return 'Significant upset';
  if (winnerOdd >= 2) return 'Moderate upset';
  return 'Minor upset';
}

function getResultDescription(
  isUpset: boolean,
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  evenMatch: boolean,
): string {
  if (winner === 'draw') return 'Draw - neither team could find a winner';
  if (evenMatch)
    return (
      'Close match went to ' + (winner === 'home' ? homeTeamName : awayTeamName)
    );
  if (isUpset) return 'Upset - underdog prevailed against expectations';
  return 'Expected result - favorite delivered';
}

function calculateSurpriseLevel(
  homeOdd: number,
  awayOdd: number,
  winner: 'home' | 'away' | 'draw' | undefined,
  goalDiff: number,
): string {
  if (winner === 'draw') return 'Draws are always possible';

  const homeProb = homeOdd > 0 ? (1 / homeOdd) * 100 : 50;
  const awayProb = awayOdd > 0 ? (1 / awayOdd) * 100 : 50;
  const totalProb = homeProb + awayProb;
  const winnerProb =
    winner === 'home'
      ? (homeProb / totalProb) * 100
      : (awayProb / totalProb) * 100;

  if (winnerProb >= 60)
    return goalDiff >= 3 ? 'Dominant expected win' : 'Expected result';
  if (winnerProb >= 45) return 'Close to expectations';
  if (winnerProb >= 35) return 'Slight upset';
  if (winnerProb >= 25) return 'Moderate upset';
  return 'Major upset';
}

function getFormInsight(
  homeForm: { trajectory: string; recentPoints: number },
  awayForm: { trajectory: string; recentPoints: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (homeForm.recentPoints > awayForm.recentPoints + 3 && winner === 'home') {
    return `Form favored ${homeTeamName} and they delivered`;
  }
  if (awayForm.recentPoints > homeForm.recentPoints + 3 && winner === 'away') {
    return `Form favored ${awayTeamName} and they delivered`;
  }
  if (homeForm.recentPoints > awayForm.recentPoints + 3 && winner === 'away') {
    return `${awayTeamName} upset the form book`;
  }
  if (awayForm.recentPoints > homeForm.recentPoints + 3 && winner === 'home') {
    return `${homeTeamName} upset the form book`;
  }
  return 'Form was relatively even going in';
}

function getMomentumAdvantage(
  homeMomentum: { confidence: string },
  awayMomentum: { confidence: string },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  const confOrder = { High: 4, Good: 3, Average: 2, Low: 1 };
  const homeConf =
    confOrder[homeMomentum.confidence as keyof typeof confOrder] ?? 2;
  const awayConf =
    confOrder[awayMomentum.confidence as keyof typeof confOrder] ?? 2;

  if (homeConf > awayConf + 1 && winner === 'home') {
    return `${homeTeamName}'s superior momentum carried through`;
  }
  if (awayConf > homeConf + 1 && winner === 'away') {
    return `${awayTeamName}'s superior momentum carried through`;
  }
  if (homeConf > awayConf + 1 && winner === 'away') {
    return `${awayTeamName} overcame momentum deficit`;
  }
  if (awayConf > homeConf + 1 && winner === 'home') {
    return `${homeTeamName} overcame momentum deficit`;
  }
  return 'Momentum was relatively balanced';
}

function assessHomeAdvantage(
  homeGames: KickerGPTMatchSummary[],
  awayGames: KickerGPTMatchSummary[],
  teamId: number,
): string {
  const homeRecord = calculateTeamRecord(homeGames, teamId);
  const awayRecord = calculateTeamRecord(awayGames, teamId);

  if (!homeRecord.total || !awayRecord.total) return 'Insufficient data';

  const homeWinRate = homeRecord.wins / homeRecord.total;
  const awayWinRate = awayRecord.wins / awayRecord.total;
  const diff = homeWinRate - awayWinRate;

  if (diff > 0.3) return 'Strong';
  if (diff > 0.15) return 'Moderate';
  if (diff > -0.1) return 'Slight';
  return 'Better away';
}

function assessAwayForm(
  awayGames: KickerGPTMatchSummary[],
  teamId: number,
): string {
  const record = calculateTeamRecord(awayGames, teamId);
  if (!record.total) return 'Insufficient data';

  const winRate = record.wins / record.total;
  if (winRate >= 0.5) return 'Strong';
  if (winRate >= 0.3) return 'Decent';
  return 'Weak';
}

function assessVenueImpact(
  homeTeamHomeRecord: { wins: number; total: number },
  awayTeamAwayRecord: { wins: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (winner === 'home' && homeTeamHomeRecord.total > 0) {
    const homeWinRate = homeTeamHomeRecord.wins / homeTeamHomeRecord.total;
    if (homeWinRate >= 0.5) {
      return `Result aligns with ${homeTeamName}'s strong home form (${Math.round(homeWinRate * 100)}% win rate)`;
    }
    return `${homeTeamName} won at home despite modest home record`;
  }
  if (winner === 'away' && awayTeamAwayRecord.total > 0) {
    const awayWinRate = awayTeamAwayRecord.wins / awayTeamAwayRecord.total;
    if (awayWinRate >= 0.4) {
      return `${awayTeamName}'s strong away form (${Math.round(awayWinRate * 100)}% win rate) proved decisive`;
    }
    return `${awayTeamName} overcame away disadvantage - impressive road win`;
  }
  return 'Venue was neutral factor';
}

function assessInjuryImpact(
  homeInjuries: number,
  awayInjuries: number,
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  const diff = homeInjuries - awayInjuries;

  if (Math.abs(diff) < 2) return 'Squad availability was similar';

  if (diff > 2 && winner === 'away') {
    return `${awayTeamName} benefited from better squad availability (${awayInjuries} vs ${homeInjuries} injuries)`;
  }
  if (diff < -2 && winner === 'home') {
    return `${homeTeamName} benefited from better squad availability (${homeInjuries} vs ${awayInjuries} injuries)`;
  }
  if (diff > 2 && winner === 'home') {
    return `${homeTeamName} won despite significant injuries - impressive depth`;
  }
  if (diff < -2 && winner === 'away') {
    return `${awayTeamName} won despite significant injuries - impressive depth`;
  }
  return 'Injuries may have been a factor';
}

function assessFatigueLevel(
  restDays: number | null,
  matchesLast30: number,
): string {
  if (restDays === null) return 'Unknown';
  if (restDays <= 2 || matchesLast30 >= 8) return 'High fatigue risk';
  if (restDays <= 4 || matchesLast30 >= 6) return 'Moderate';
  if (restDays >= 7 && matchesLast30 <= 3) return 'Well rested';
  return 'Normal';
}

function getMoreRestedTeam(
  homeRest: number | null,
  awayRest: number | null,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (homeRest === null || awayRest === null) return 'Unknown';
  if (Math.abs(homeRest - awayRest) <= 1) return 'Similar rest';
  return homeRest > awayRest ? homeTeamName : awayTeamName;
}

function assessFatigueImpact(
  homeRest: number | null,
  awayRest: number | null,
  homeMatchesLast30: number,
  awayMatchesLast30: number,
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (homeRest === null || awayRest === null)
    return 'Cannot assess fatigue impact';

  const restDiff = homeRest - awayRest;

  if (Math.abs(restDiff) <= 1) return 'Rest was not a significant factor';

  if (restDiff >= 3 && winner === 'home') {
    return `${homeTeamName}'s rest advantage (+${restDiff} days) may have helped`;
  }
  if (restDiff <= -3 && winner === 'away') {
    return `${awayTeamName}'s rest advantage (+${Math.abs(restDiff)} days) may have helped`;
  }
  if (restDiff >= 3 && winner === 'away') {
    return `${awayTeamName} won despite less rest`;
  }
  if (restDiff <= -3 && winner === 'home') {
    return `${homeTeamName} won despite less rest`;
  }

  // Check match congestion
  if (homeMatchesLast30 >= 7 && awayMatchesLast30 <= 4 && winner === 'away') {
    return `${homeTeamName}'s congested schedule (${homeMatchesLast30} matches in 30 days) may have affected them`;
  }
  if (awayMatchesLast30 >= 7 && homeMatchesLast30 <= 4 && winner === 'home') {
    return `${awayTeamName}'s congested schedule (${awayMatchesLast30} matches in 30 days) may have affected them`;
  }

  return 'Fatigue was a minor factor';
}

function assessWeatherAdvantage(
  similarMatches: KickerGPTMatchSummary[],
  homeTeamId: number,
  awayTeamId: number,
  homeTeamName: string,
  awayTeamName: string,
): string {
  const homeRecord = calculateTeamRecord(similarMatches, homeTeamId);
  const awayRecord = calculateTeamRecord(similarMatches, awayTeamId);

  if (homeRecord.total < 2 && awayRecord.total < 2) return 'Insufficient data';

  if (homeRecord.wins > awayRecord.wins + 1) {
    return `${homeTeamName} has historically performed better in these conditions`;
  }
  if (awayRecord.wins > homeRecord.wins + 1) {
    return `${awayTeamName} has historically performed better in these conditions`;
  }
  return 'Weather was neutral factor';
}

function assessRefereePattern(
  homeRecord: { wins: number; losses: number; total: number },
  awayRecord: { wins: number; losses: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (homeRecord.total < 2 && awayRecord.total < 2)
    return 'Limited referee history';

  if (homeRecord.wins > homeRecord.losses && winner === 'home') {
    return `Result consistent with ${homeTeamName}'s positive record under this referee`;
  }
  if (awayRecord.wins > awayRecord.losses && winner === 'away') {
    return `Result consistent with ${awayTeamName}'s positive record under this referee`;
  }
  if (homeRecord.wins < homeRecord.losses && winner === 'home') {
    return `${homeTeamName} won despite poor record with this referee`;
  }
  if (awayRecord.wins < awayRecord.losses && winner === 'away') {
    return `${awayTeamName} won despite poor record with this referee`;
  }

  return 'No clear referee influence';
}

function getTimeSlot(
  hour: number,
): 'early' | 'afternoon' | 'evening' | 'night' {
  if (hour < 14) return 'early';
  if (hour < 18) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function getMonthName(month: number): string {
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
  return months[month - 1] ?? 'Unknown';
}

function calculateGoalsInMatches(
  matches: KickerGPTMatchSummary[],
  teamId: number,
): { avgScored: string; avgConceded: string } {
  let scored = 0;
  let conceded = 0;
  let count = 0;

  for (const m of matches) {
    const isHome = m.teams.home.id === teamId;
    const isAway = m.teams.away.id === teamId;
    if (!isHome && !isAway) continue;

    const homeGoals = m.goals?.home ?? 0;
    const awayGoals = m.goals?.away ?? 0;

    if (isHome) {
      scored += homeGoals;
      conceded += awayGoals;
    } else {
      scored += awayGoals;
      conceded += homeGoals;
    }
    count++;
  }

  return {
    avgScored: count > 0 ? (scored / count).toFixed(2) : 'N/A',
    avgConceded: count > 0 ? (conceded / count).toFixed(2) : 'N/A',
  };
}

function getDayPatternInsight(
  homeRecord: { wins: number; losses: number; total: number },
  awayRecord: { wins: number; losses: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  day: string,
): string {
  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate > awayWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName}'s strong ${day} record (${Math.round(homeWinRate * 100)}% win rate) held true`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName}'s strong ${day} record (${Math.round(awayWinRate * 100)}% win rate) held true`;
  }
  if (homeWinRate > awayWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName} upset ${homeTeamName}'s typically strong ${day} form`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName} overcame ${awayTeamName}'s strong ${day} record`;
  }
  return `${day} performance was not a significant differentiator`;
}

function getKickoffTimeInsight(
  homeRecord: { wins: number; losses: number; total: number },
  awayRecord: { wins: number; losses: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  timeSlot: string,
): string {
  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate > awayWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName} performs well at ${timeSlot} kickoffs and delivered`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName} performs well at ${timeSlot} kickoffs and delivered`;
  }
  if (homeRecord.losses > homeRecord.wins && winner !== 'home') {
    return `${homeTeamName}'s poor ${timeSlot} record continued`;
  }
  if (awayRecord.losses > awayRecord.wins && winner !== 'away') {
    return `${awayTeamName}'s poor ${timeSlot} record continued`;
  }
  return `Kickoff time was not a decisive factor`;
}

function getCombinedDayTimeInsight(
  homeRecord: { wins: number; losses: number; total: number },
  awayRecord: { wins: number; losses: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  day: string,
  timeSlot: string,
): string {
  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate >= 0.6 && winner === 'home') {
    return `${homeTeamName} excels on ${day} ${timeSlot} games (${Math.round(homeWinRate * 100)}% win rate) - pattern held`;
  }
  if (awayWinRate >= 0.6 && winner === 'away') {
    return `${awayTeamName} excels on ${day} ${timeSlot} games (${Math.round(awayWinRate * 100)}% win rate) - pattern held`;
  }
  if (homeWinRate <= 0.3 && winner !== 'home') {
    return `${homeTeamName} struggles on ${day} ${timeSlot} games - pattern continued`;
  }
  if (awayWinRate <= 0.3 && winner !== 'away') {
    return `${awayTeamName} struggles on ${day} ${timeSlot} games - pattern continued`;
  }
  return `The ${day} ${timeSlot} slot was neutral for both teams`;
}

function getMonthlyPatternInsight(
  homeRecord: { wins: number; losses: number; total: number },
  awayRecord: { wins: number; losses: number; total: number },
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  month: string,
): string {
  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate > awayWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName}'s strong ${month} form continued`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName}'s strong ${month} form continued`;
  }
  return `Monthly form patterns were not a decisive factor`;
}

function findBestTimeSlot(
  performanceBySlot: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): { slot: string; winRate: string; record: string } {
  let bestSlot = 'N/A';
  let bestRate = -1;

  for (const [slot, record] of Object.entries(performanceBySlot)) {
    if (record.total >= 2) {
      const rate = record.wins / record.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestSlot = slot;
      }
    }
  }

  const best = performanceBySlot[bestSlot];
  return {
    slot: bestSlot,
    winRate: bestRate >= 0 ? `${Math.round(bestRate * 100)}%` : 'N/A',
    record: best ? `${best.wins}W-${best.draws}D-${best.losses}L` : 'N/A',
  };
}

function findWorstTimeSlot(
  performanceBySlot: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): { slot: string; winRate: string; record: string } {
  let worstSlot = 'N/A';
  let worstRate = 2;

  for (const [slot, record] of Object.entries(performanceBySlot)) {
    if (record.total >= 2) {
      const rate = record.wins / record.total;
      if (rate < worstRate) {
        worstRate = rate;
        worstSlot = slot;
      }
    }
  }

  const worst = performanceBySlot[worstSlot];
  return {
    slot: worstSlot,
    winRate: worstRate < 2 ? `${Math.round(worstRate * 100)}%` : 'N/A',
    record: worst ? `${worst.wins}W-${worst.draws}D-${worst.losses}L` : 'N/A',
  };
}

function findBestDay(
  performanceByDay: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): { day: string; winRate: string; record: string } {
  let bestDay = 'N/A';
  let bestRate = -1;

  for (const [day, record] of Object.entries(performanceByDay)) {
    if (record.total >= 2) {
      const rate = record.wins / record.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestDay = day;
      }
    }
  }

  const best = performanceByDay[bestDay];
  return {
    day: bestDay,
    winRate: bestRate >= 0 ? `${Math.round(bestRate * 100)}%` : 'N/A',
    record: best ? `${best.wins}W-${best.draws}D-${best.losses}L` : 'N/A',
  };
}

function findWorstDay(
  performanceByDay: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): { day: string; winRate: string; record: string } {
  let worstDay = 'N/A';
  let worstRate = 2;

  for (const [day, record] of Object.entries(performanceByDay)) {
    if (record.total >= 2) {
      const rate = record.wins / record.total;
      if (rate < worstRate) {
        worstRate = rate;
        worstDay = day;
      }
    }
  }

  const worst = performanceByDay[worstDay];
  return {
    day: worstDay,
    winRate: worstRate < 2 ? `${Math.round(worstRate * 100)}%` : 'N/A',
    record: worst ? `${worst.wins}W-${worst.draws}D-${worst.losses}L` : 'N/A',
  };
}

function formatTimeSlotPerformance(
  performanceBySlot: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [slot, record] of Object.entries(performanceBySlot)) {
    if (record.total > 0) {
      result[slot] =
        `${record.wins}W-${record.draws}D-${record.losses}L (${Math.round((record.wins / record.total) * 100)}%)`;
    } else {
      result[slot] = 'No data';
    }
  }
  return result;
}

function formatDayPerformance(
  performanceByDay: Record<
    string,
    { wins: number; draws: number; losses: number; total: number }
  >,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [day, record] of Object.entries(performanceByDay)) {
    if (record.total > 0) {
      result[day] =
        `${record.wins}W-${record.draws}D-${record.losses}L (${Math.round((record.wins / record.total) * 100)}%)`;
    }
  }
  return result;
}

function getTimeSlotAdvantageInsight(
  homeRecord: { wins: number; losses: number; total: number } | undefined,
  awayRecord: { wins: number; losses: number; total: number } | undefined,
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  timeSlot: string,
): string {
  if (!homeRecord || !awayRecord) return 'Insufficient data';

  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate > awayWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName}'s ${timeSlot} time slot advantage proved decisive`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName}'s ${timeSlot} time slot advantage proved decisive`;
  }
  return 'Time slot was not a significant factor';
}

function getDayAdvantageInsight(
  homeRecord: { wins: number; losses: number; total: number } | undefined,
  awayRecord: { wins: number; losses: number; total: number } | undefined,
  winner: 'home' | 'away' | 'draw' | undefined,
  homeTeamName: string,
  awayTeamName: string,
  day: string,
): string {
  if (!homeRecord || !awayRecord) return 'Insufficient data';

  const homeWinRate =
    homeRecord.total > 0 ? homeRecord.wins / homeRecord.total : 0;
  const awayWinRate =
    awayRecord.total > 0 ? awayRecord.wins / awayRecord.total : 0;

  if (homeWinRate > awayWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName}'s ${day} advantage proved decisive`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName}'s ${day} advantage proved decisive`;
  }
  if (homeWinRate > awayWinRate + 0.2 && winner === 'away') {
    return `${awayTeamName} overcame ${homeTeamName}'s ${day} advantage`;
  }
  if (awayWinRate > homeWinRate + 0.2 && winner === 'home') {
    return `${homeTeamName} overcame ${awayTeamName}'s ${day} advantage`;
  }
  return `${day} was not a differentiating factor`;
}
