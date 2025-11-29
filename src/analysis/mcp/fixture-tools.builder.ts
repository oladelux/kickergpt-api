import { OpenAiToolDefinition } from '../../openai/openai.service';
import {
  KickerGPTFixturesResponse,
  KickerGPTInjuryPlayerFlag,
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

export function buildFixtureTools(
  context: KickerGPTFixturesResponse,
): OpenAiToolDefinition[] {
  const tools: OpenAiToolDefinition[] = [];
  const matchDate = new Date(context.date);
  const matchWeekday = WEEKDAYS[matchDate.getUTCDay()];
  const matchWeather = context.weatherSummary?.toLowerCase() ?? '';

  const allMatches = [
    ...(context.h2h ?? []),
    ...(context.homeTeamRecentMatches ?? []),
    ...(context.awayTeamRecentMatches ?? []),
  ];

  const homeTeamId = context.teams.home.id;
  const awayTeamId = context.teams.away.id;

  const homeRestDays = calculateRestDays(
    context.homeTeamRecentMatches ?? [],
    context.date,
  );
  const awayRestDays = calculateRestDays(
    context.awayTeamRecentMatches ?? [],
    context.date,
  );

  tools.push({
    name: 'get_match_info',
    description:
      'Get basic match details: date, venue, teams, odds, referee, weather, match type',
    handler: () => ({
      id: context.id,
      date: context.date,
      timezone: context.timezone,
      venue: context.venue,
      referee: context.referee,
      weather: context.weatherSummary,
      teams: context.teams,
      homeOdd: context.homeOdd,
      awayOdd: context.awayOdd,
      derby: context.derby,
      matchType: context.matchType,
      league: context.league,
    }),
  });

  tools.push({
    name: 'get_head_to_head',
    description: 'Get historical head-to-head matches between these two teams',
    handler: () => ({
      total: context.h2h?.length ?? 0,
      matches: context.h2h ?? [],
    }),
  });

  tools.push({
    name: 'get_recent_form',
    description: 'Get recent matches for both teams showing current form',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        matches: context.homeTeamRecentMatches ?? [],
      },
      away: {
        team: context.teams.away.name,
        matches: context.awayTeamRecentMatches ?? [],
      },
    }),
  });

  tools.push({
    name: 'get_injuries',
    description: 'Get injury list for both teams',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        count: context.homeInjuries?.length ?? 0,
        players: context.homeInjuries ?? [],
      },
      away: {
        team: context.teams.away.name,
        count: context.awayInjuries?.length ?? 0,
        players: context.awayInjuries ?? [],
      },
    }),
  });

  tools.push({
    name: 'get_team_news',
    description: 'Get recent news and sentiment for both teams',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        articles: context.homeNews ?? [],
      },
      away: {
        team: context.teams.away.name,
        articles: context.awayNews ?? [],
      },
    }),
  });

  tools.push({
    name: 'analyze_weather_patterns',
    description:
      'Compare team results in similar weather conditions from historical matches',
    handler: () => {
      const weatherKeyword = matchWeather.split(' ')[0];
      const similarMatches = allMatches.filter((m) => {
        const w = m.weatherSummary?.toLowerCase() ?? '';
        return (
          w.includes(weatherKeyword) || weatherKeyword.includes(w.split(' ')[0])
        );
      });

      return {
        upcomingWeather: context.weatherSummary,
        home: {
          team: context.teams.home.name,
          record: calculateTeamRecord(similarMatches, homeTeamId),
          matches: filterTeamMatches(similarMatches, homeTeamId),
        },
        away: {
          team: context.teams.away.name,
          record: calculateTeamRecord(similarMatches, awayTeamId),
          matches: filterTeamMatches(similarMatches, awayTeamId),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_day_patterns',
    description: `Analyze how both teams perform on ${matchWeekday}s`,
    handler: () => {
      const sameDayMatches = allMatches.filter((m) => {
        const d = new Date(m.date);
        return WEEKDAYS[d.getUTCDay()] === matchWeekday;
      });

      return {
        matchDay: matchWeekday,
        home: {
          team: context.teams.home.name,
          record: calculateTeamRecord(sameDayMatches, homeTeamId),
          matches: filterTeamMatches(sameDayMatches, homeTeamId),
        },
        away: {
          team: context.teams.away.name,
          record: calculateTeamRecord(sameDayMatches, awayTeamId),
          matches: filterTeamMatches(sameDayMatches, awayTeamId),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_referee_history',
    description: 'Check results when this referee has officiated either team',
    handler: () => {
      if (!context.referee) {
        return { available: false, message: 'No referee assigned yet' };
      }

      const refereeName = context.referee.toLowerCase();
      const refereeMatches = allMatches.filter(
        (m) => m.referee?.toLowerCase() === refereeName,
      );

      return {
        referee: context.referee,
        totalMatches: refereeMatches.length,
        home: {
          team: context.teams.home.name,
          record: calculateTeamRecord(refereeMatches, homeTeamId),
          matches: filterTeamMatches(refereeMatches, homeTeamId),
        },
        away: {
          team: context.teams.away.name,
          record: calculateTeamRecord(refereeMatches, awayTeamId),
          matches: filterTeamMatches(refereeMatches, awayTeamId),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_odds_patterns',
    description:
      'Analyze how teams perform relative to betting odds - upsets, favorites, underdogs',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];
      const h2hMatches = context.h2h ?? [];

      return {
        upcomingOdds: {
          home: context.homeOdd,
          away: context.awayOdd,
          favorite: determineFavorite(
            context.homeOdd,
            context.awayOdd,
            context.teams,
          ),
        },
        home: {
          team: context.teams.home.name,
          asUnderdog: analyzeOddsPerformance(
            homeMatches,
            homeTeamId,
            'underdog',
          ),
          asFavorite: analyzeOddsPerformance(
            homeMatches,
            homeTeamId,
            'favorite',
          ),
          upsets: findUpsets(homeMatches, homeTeamId),
        },
        away: {
          team: context.teams.away.name,
          asUnderdog: analyzeOddsPerformance(
            awayMatches,
            awayTeamId,
            'underdog',
          ),
          asFavorite: analyzeOddsPerformance(
            awayMatches,
            awayTeamId,
            'favorite',
          ),
          upsets: findUpsets(awayMatches, awayTeamId),
        },
        h2hOddsHistory: h2hMatches.map((m) => ({
          date: m.date,
          home: m.teams.home.name,
          away: m.teams.away.name,
          homeOdd: (m as any).homeOdd,
          awayOdd: (m as any).awayOdd,
          score: `${m.goals?.home ?? 0}-${m.goals?.away ?? 0}`,
          upset: wasUpset(m),
        })),
      };
    },
  });

  tools.push({
    name: 'analyze_injury_impact',
    description:
      'Assess how injuries affect each team and compare squad availability',
    handler: () => {
      const homeCount = context.homeInjuries?.length ?? 0;
      const awayCount = context.awayInjuries?.length ?? 0;

      return {
        current: {
          home: {
            team: context.teams.home.name,
            injuryCount: homeCount,
            players: context.homeInjuries ?? [],
          },
          away: {
            team: context.teams.away.name,
            injuryCount: awayCount,
            players: context.awayInjuries ?? [],
          },
        },
        recentPerformance: {
          home: {
            team: context.teams.home.name,
            results: (context.homeTeamRecentMatches ?? [])
              .slice(0, 5)
              .map((m) => ({
                date: m.date,
                opponent:
                  m.teams.home.id === homeTeamId
                    ? m.teams.away.name
                    : m.teams.home.name,
                goals: m.goals,
                result: getTeamResult(m, homeTeamId),
              })),
          },
          away: {
            team: context.teams.away.name,
            results: (context.awayTeamRecentMatches ?? [])
              .slice(0, 5)
              .map((m) => ({
                date: m.date,
                opponent:
                  m.teams.home.id === awayTeamId
                    ? m.teams.away.name
                    : m.teams.home.name,
                goals: m.goals,
                result: getTeamResult(m, awayTeamId),
              })),
          },
        },
        advantage: getInjuryAdvantage(homeCount, awayCount, context.teams),
      };
    },
  });

  tools.push({
    name: 'analyze_goal_patterns',
    description:
      'Analyze scoring trends - clean sheets, failed to score, BTTS, over/under 2.5 goals',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        ...analyzeGoalPatterns(context.homeTeamRecentMatches ?? [], homeTeamId),
      },
      away: {
        team: context.teams.away.name,
        ...analyzeGoalPatterns(context.awayTeamRecentMatches ?? [], awayTeamId),
      },
      h2h: {
        ...analyzeH2HGoals(context.h2h ?? []),
      },
    }),
  });

  tools.push({
    name: 'analyze_home_away_splits',
    description: 'Compare how teams perform at home vs away specifically',
    handler: () => {
      const homeTeamHomeGames = (context.homeTeamRecentMatches ?? []).filter(
        (m) => m.teams.home.id === homeTeamId,
      );
      const homeTeamAwayGames = (context.homeTeamRecentMatches ?? []).filter(
        (m) => m.teams.away.id === homeTeamId,
      );
      const awayTeamHomeGames = (context.awayTeamRecentMatches ?? []).filter(
        (m) => m.teams.home.id === awayTeamId,
      );
      const awayTeamAwayGames = (context.awayTeamRecentMatches ?? []).filter(
        (m) => m.teams.away.id === awayTeamId,
      );

      return {
        home: {
          team: context.teams.home.name,
          playingAt: 'home',
          atHome: calculateTeamRecord(homeTeamHomeGames, homeTeamId),
          atAway: calculateTeamRecord(homeTeamAwayGames, homeTeamId),
          homeAdvantage: calculateHomeAdvantage(
            homeTeamHomeGames,
            homeTeamAwayGames,
            homeTeamId,
          ),
        },
        away: {
          team: context.teams.away.name,
          playingAt: 'away',
          atHome: calculateTeamRecord(awayTeamHomeGames, awayTeamId),
          atAway: calculateTeamRecord(awayTeamAwayGames, awayTeamId),
          awayForm: calculateTeamRecord(awayTeamAwayGames, awayTeamId),
        },
      };
    },
  });

  tools.push({
    name: 'analyze_momentum',
    description:
      'Analyze current streaks, form momentum, and confidence levels',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        ...analyzeMomentum(context.homeTeamRecentMatches ?? [], homeTeamId),
      },
      away: {
        team: context.teams.away.name,
        ...analyzeMomentum(context.awayTeamRecentMatches ?? [], awayTeamId),
      },
    }),
  });

  tools.push({
    name: 'analyze_rest_and_schedule',
    description: 'Check rest days since last match and schedule congestion',
    handler: () => ({
      home: {
        team: context.teams.home.name,
        restDays: homeRestDays,
        lastMatch: getLastMatchInfo(
          context.homeTeamRecentMatches ?? [],
          homeTeamId,
        ),
        matchesLast30Days: countRecentMatches(
          context.homeTeamRecentMatches ?? [],
          30,
        ),
        fatigueRisk: assessFatigueRisk(
          homeRestDays,
          countRecentMatches(context.homeTeamRecentMatches ?? [], 30),
        ),
      },
      away: {
        team: context.teams.away.name,
        restDays: awayRestDays,
        lastMatch: getLastMatchInfo(
          context.awayTeamRecentMatches ?? [],
          awayTeamId,
        ),
        matchesLast30Days: countRecentMatches(
          context.awayTeamRecentMatches ?? [],
          30,
        ),
        fatigueRisk: assessFatigueRisk(
          awayRestDays,
          countRecentMatches(context.awayTeamRecentMatches ?? [], 30),
        ),
      },
      advantage: getRestAdvantage(homeRestDays, awayRestDays, context.teams),
    }),
  });

  tools.push({
    name: 'analyze_injured_player_impact',
    description:
      'Assess the impact of injured players based on their historical ratings and importance to the team',
    handler: () => {
      const homeInjuries = context.homeInjuries ?? [];
      const awayInjuries = context.awayInjuries ?? [];
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      // Calculate injured player ratings from recent matches
      const homeInjuredImpact = analyzeInjuredPlayersRatings(
        homeInjuries,
        homeMatches,
        homeTeamId,
      );
      const awayInjuredImpact = analyzeInjuredPlayersRatings(
        awayInjuries,
        awayMatches,
        awayTeamId,
      );

      return {
        home: {
          team: context.teams.home.name,
          injuredCount: homeInjuries.length,
          impactAnalysis: homeInjuredImpact,
        },
        away: {
          team: context.teams.away.name,
          injuredCount: awayInjuries.length,
          impactAnalysis: awayInjuredImpact,
        },
        comparison: getInjuryImpactComparison(
          homeInjuredImpact,
          awayInjuredImpact,
          context.teams,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_team_rating_trajectory',
    description:
      'Analyze team performance quality trends based on player ratings over recent matches - are they improving, declining, or stable?',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      const homeTrajectory = calculateRatingTrajectory(homeMatches, homeTeamId);
      const awayTrajectory = calculateRatingTrajectory(awayMatches, awayTeamId);

      return {
        home: {
          team: context.teams.home.name,
          ...homeTrajectory,
        },
        away: {
          team: context.teams.away.name,
          ...awayTrajectory,
        },
        qualityComparison: getRatingQualityComparison(
          homeTrajectory,
          awayTrajectory,
          context.teams,
        ),
      };
    },
  });

  tools.push({
    name: 'analyze_h2h_ratings',
    description:
      'Analyze head-to-head matches by team rating performance - which team typically performs better quality-wise in these fixtures?',
    handler: () => {
      const h2h = context.h2h ?? [];

      if (h2h.length === 0) {
        return { available: false, message: 'No H2H history available' };
      }

      const h2hRatingAnalysis = analyzeH2HRatings(h2h, homeTeamId, awayTeamId);

      return {
        totalMeetings: h2h.length,
        matchesWithRatings: h2hRatingAnalysis.matchesWithRatings,
        home: {
          team: context.teams.home.name,
          averageRating: h2hRatingAnalysis.homeAvgRating,
          bestPerformance: h2hRatingAnalysis.homeBest,
          worstPerformance: h2hRatingAnalysis.homeWorst,
        },
        away: {
          team: context.teams.away.name,
          averageRating: h2hRatingAnalysis.awayAvgRating,
          bestPerformance: h2hRatingAnalysis.awayBest,
          worstPerformance: h2hRatingAnalysis.awayWorst,
        },
        h2hQualityWinner: h2hRatingAnalysis.qualityWinner,
        insight: h2hRatingAnalysis.insight,
      };
    },
  });

  tools.push({
    name: 'get_top_performers',
    description:
      'Get the top-rated players from recent matches for both teams - identifies key players to watch',
    handler: () => {
      const homeMatches = context.homeTeamRecentMatches ?? [];
      const awayMatches = context.awayTeamRecentMatches ?? [];

      const homeTopPerformers = getTopPerformers(homeMatches, homeTeamId, 5);
      const awayTopPerformers = getTopPerformers(awayMatches, awayTeamId, 5);

      return {
        home: {
          team: context.teams.home.name,
          topPlayers: homeTopPerformers,
        },
        away: {
          team: context.teams.away.name,
          topPlayers: awayTopPerformers,
        },
      };
    },
  });

  return tools;
}

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

function calculateTeamRecord(matches: KickerGPTMatchSummary[], teamId: number) {
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

function filterTeamMatches(matches: KickerGPTMatchSummary[], teamId: number) {
  return matches
    .filter((m) => m.teams.home.id === teamId || m.teams.away.id === teamId)
    .map((m) => ({
      date: m.date,
      home: m.teams.home.name,
      away: m.teams.away.name,
      score: `${m.goals?.home ?? 0}-${m.goals?.away ?? 0}`,
      result: getTeamResult(m, teamId),
    }));
}

function getInjuryAdvantage(
  homeCount: number,
  awayCount: number,
  teams: { home: { name: string }; away: { name: string } },
): string {
  const diff = homeCount - awayCount;
  if (diff === 0) return 'Even - both teams have similar injury concerns';
  if (Math.abs(diff) >= 3) {
    const advantaged = diff > 0 ? teams.away.name : teams.home.name;
    return `${advantaged} has significant squad availability advantage`;
  }
  const advantaged = diff > 0 ? teams.away.name : teams.home.name;
  return `${advantaged} has slight squad availability advantage`;
}

function determineFavorite(
  homeOdd: string | undefined,
  awayOdd: string | undefined,
  teams: { home: { name: string }; away: { name: string } },
): string {
  const home = parseFloat(homeOdd ?? '0');
  const away = parseFloat(awayOdd ?? '0');
  if (!home || !away) return 'Unknown - odds not available';
  if (Math.abs(home - away) < 0.2) return 'Even match - no clear favorite';
  return home < away
    ? `${teams.home.name} (favorite)`
    : `${teams.away.name} (favorite)`;
}

function analyzeOddsPerformance(
  matches: KickerGPTMatchSummary[],
  teamId: number,
  role: 'favorite' | 'underdog',
): { wins: number; draws: number; losses: number; total: number } {
  let wins = 0,
    draws = 0,
    losses = 0;

  for (const m of matches) {
    const isHome = m.teams.home.id === teamId;
    const isAway = m.teams.away.id === teamId;
    if (!isHome && !isAway) continue;

    const teamOdd =
      parseFloat(isHome ? (m as any).homeOdd : (m as any).awayOdd) || 0;
    const oppOdd =
      parseFloat(isHome ? (m as any).awayOdd : (m as any).homeOdd) || 0;
    if (!teamOdd || !oppOdd) continue;

    const wasFavorite = teamOdd < oppOdd;
    const wasUnderdog = teamOdd > oppOdd;

    if (
      (role === 'favorite' && !wasFavorite) ||
      (role === 'underdog' && !wasUnderdog)
    )
      continue;

    const result = getTeamResult(m, teamId);
    if (result === 'win') wins++;
    else if (result === 'draw') draws++;
    else if (result === 'loss') losses++;
  }

  return { wins, draws, losses, total: wins + draws + losses };
}

function findUpsets(matches: KickerGPTMatchSummary[], teamId: number) {
  const upsets: Array<{
    date: string;
    opponent: string;
    score: string;
    teamOdd: string;
    opponentOdd: string;
  }> = [];

  for (const m of matches) {
    const isHome = m.teams.home.id === teamId;
    const isAway = m.teams.away.id === teamId;
    if (!isHome && !isAway) continue;

    const teamOdd =
      parseFloat(isHome ? (m as any).homeOdd : (m as any).awayOdd) || 0;
    const oppOdd =
      parseFloat(isHome ? (m as any).awayOdd : (m as any).homeOdd) || 0;
    if (!teamOdd || !oppOdd) continue;

    const wasUnderdog = teamOdd > oppOdd;
    const result = getTeamResult(m, teamId);

    if (wasUnderdog && result === 'win') {
      upsets.push({
        date: m.date,
        opponent: isHome ? m.teams.away.name : m.teams.home.name,
        score: `${m.goals?.home ?? 0}-${m.goals?.away ?? 0}`,
        teamOdd: isHome ? (m as any).homeOdd : (m as any).awayOdd,
        opponentOdd: isHome ? (m as any).awayOdd : (m as any).homeOdd,
      });
    }
  }

  return { count: upsets.length, matches: upsets };
}

function wasUpset(match: KickerGPTMatchSummary): string | null {
  const homeOdd = parseFloat((match as any).homeOdd) || 0;
  const awayOdd = parseFloat((match as any).awayOdd) || 0;
  if (!homeOdd || !awayOdd) return null;

  const homeGoals = match.goals?.home ?? 0;
  const awayGoals = match.goals?.away ?? 0;

  if (homeGoals === awayGoals) return null;

  const homeWon = homeGoals > awayGoals;
  const homeFavorite = homeOdd < awayOdd;

  if (homeWon && !homeFavorite) return `${match.teams.home.name} upset`;
  if (!homeWon && homeFavorite) return `${match.teams.away.name} upset`;

  return null;
}

// Goal Pattern Helpers
function analyzeGoalPatterns(matches: KickerGPTMatchSummary[], teamId: number) {
  let cleanSheets = 0,
    failedToScore = 0;
  let btts = 0,
    over25 = 0;
  let goalsScored = 0,
    goalsConceded = 0;
  const total = matches.length;

  for (const m of matches) {
    const isHome = m.teams.home.id === teamId;
    const isAway = m.teams.away.id === teamId;
    if (!isHome && !isAway) continue;

    const teamGoals = isHome ? (m.goals?.home ?? 0) : (m.goals?.away ?? 0);
    const oppGoals = isHome ? (m.goals?.away ?? 0) : (m.goals?.home ?? 0);

    goalsScored += teamGoals;
    goalsConceded += oppGoals;

    if (oppGoals === 0) cleanSheets++;
    if (teamGoals === 0) failedToScore++;
    if (teamGoals > 0 && oppGoals > 0) btts++;
    if (teamGoals + oppGoals > 2.5) over25++;
  }

  return {
    cleanSheets: {
      count: cleanSheets,
      percentage: total ? Math.round((cleanSheets / total) * 100) : 0,
    },
    failedToScore: {
      count: failedToScore,
      percentage: total ? Math.round((failedToScore / total) * 100) : 0,
    },
    btts: {
      count: btts,
      percentage: total ? Math.round((btts / total) * 100) : 0,
    },
    over25: {
      count: over25,
      percentage: total ? Math.round((over25 / total) * 100) : 0,
    },
    averageScored: total ? (goalsScored / total).toFixed(2) : '0',
    averageConceded: total ? (goalsConceded / total).toFixed(2) : '0',
    totalMatches: total,
  };
}

function analyzeH2HGoals(matches: KickerGPTMatchSummary[]) {
  let btts = 0,
    over25 = 0,
    totalGoals = 0;
  const total = matches.length;

  for (const m of matches) {
    const home = m.goals?.home ?? 0;
    const away = m.goals?.away ?? 0;
    totalGoals += home + away;
    if (home > 0 && away > 0) btts++;
    if (home + away > 2.5) over25++;
  }

  return {
    btts: {
      count: btts,
      percentage: total ? Math.round((btts / total) * 100) : 0,
    },
    over25: {
      count: over25,
      percentage: total ? Math.round((over25 / total) * 100) : 0,
    },
    averageGoals: total ? (totalGoals / total).toFixed(2) : '0',
    totalMatches: total,
  };
}

// Momentum Helpers
function analyzeMomentum(matches: KickerGPTMatchSummary[], teamId: number) {
  const results: Array<'W' | 'D' | 'L'> = [];

  for (const m of matches.slice(0, 10)) {
    const result = getTeamResult(m, teamId);
    if (result === 'win') results.push('W');
    else if (result === 'draw') results.push('D');
    else if (result === 'loss') results.push('L');
  }

  const currentStreak = getCurrentStreak(results);
  const unbeatenRun = getUnbeatenRun(results);
  const last5 = results.slice(0, 5);
  const last5Points = last5.reduce(
    (sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0),
    0,
  );

  return {
    form: results.slice(0, 5).join('') || 'N/A',
    currentStreak,
    unbeatenRun,
    last5Points: `${last5Points}/15`,
    confidence: assessConfidence(last5Points, currentStreak),
  };
}

function getCurrentStreak(results: Array<'W' | 'D' | 'L'>): string {
  if (!results.length) return 'No data';
  const first = results[0];
  let count = 0;
  for (const r of results) {
    if (r === first) count++;
    else break;
  }
  const label = first === 'W' ? 'wins' : first === 'D' ? 'draws' : 'losses';
  return `${count} ${label}`;
}

function getUnbeatenRun(results: Array<'W' | 'D' | 'L'>): number {
  let count = 0;
  for (const r of results) {
    if (r === 'L') break;
    count++;
  }
  return count;
}

function assessConfidence(points: number, streak: string): string {
  if (
    points >= 12 ||
    streak.includes('3 wins') ||
    streak.includes('4 wins') ||
    streak.includes('5 wins')
  ) {
    return 'High - team in excellent form';
  }
  if (points >= 9) return 'Good - solid recent performances';
  if (points >= 6) return 'Moderate - inconsistent results';
  if (streak.includes('losses')) return 'Low - struggling for results';
  return 'Low - poor recent form';
}

// Rest & Schedule Helpers
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

function countRecentMatches(
  matches: KickerGPTMatchSummary[],
  days: number,
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return matches.filter((m) => new Date(m.date) >= cutoff).length;
}

function assessFatigueRisk(
  restDays: number | null,
  matchesLast30: number,
): string {
  if (restDays === null) return 'Unknown';
  if (restDays <= 2 || matchesLast30 >= 8)
    return 'High - limited recovery time';
  if (restDays <= 4 || matchesLast30 >= 6) return 'Moderate - busy schedule';
  if (restDays >= 7 && matchesLast30 <= 3) return 'Low - well rested';
  return 'Normal';
}

function getRestAdvantage(
  homeRest: number | null,
  awayRest: number | null,
  teams: { home: { name: string }; away: { name: string } },
): string {
  if (homeRest === null || awayRest === null)
    return 'Unknown - insufficient data';
  const diff = homeRest - awayRest;
  if (Math.abs(diff) <= 1) return 'Even - similar rest periods';
  if (diff >= 3)
    return `${teams.home.name} has significant rest advantage (+${diff} days)`;
  if (diff <= -3)
    return `${teams.away.name} has significant rest advantage (+${Math.abs(diff)} days)`;
  if (diff > 0)
    return `${teams.home.name} slightly more rested (+${diff} days)`;
  return `${teams.away.name} slightly more rested (+${Math.abs(diff)} days)`;
}

// Home/Away Helpers
function calculateHomeAdvantage(
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

  if (diff > 0.3) return 'Strong - significantly better at home';
  if (diff > 0.15) return 'Moderate - noticeable home advantage';
  if (diff > -0.1) return 'Slight - performs similarly everywhere';
  return 'Weak - actually better away from home';
}

// Add these helper functions to the same file

interface InjuredPlayerImpact {
  highImpactMissing: Array<{
    name: string;
    avgRating: number;
    matchesRated: number;
  }>;
  moderateImpactMissing: Array<{
    name: string;
    avgRating: number;
    matchesRated: number;
  }>;
  lowImpactMissing: Array<{
    name: string;
    avgRating: number;
    matchesRated: number;
  }>;
  totalRatingLoss: number;
  impactLevel: 'Critical' | 'Significant' | 'Moderate' | 'Minimal' | 'Unknown';
}

function analyzeInjuredPlayersRatings(
  injuries: KickerGPTInjuryPlayerFlag[],
  recentMatches: KickerGPTMatchSummary[],
  teamId: number,
): InjuredPlayerImpact {
  const highImpact: InjuredPlayerImpact['highImpactMissing'] = [];
  const moderateImpact: InjuredPlayerImpact['moderateImpactMissing'] = [];
  const lowImpact: InjuredPlayerImpact['lowImpactMissing'] = [];

  for (const injury of injuries) {
    const playerName = injury.name?.toLowerCase() ?? '';
    const playerRatings: number[] = [];

    // Find this player's ratings across recent matches
    for (const match of recentMatches) {
      const teamRatings =
        match.teams.home.id === teamId
          ? match.ratings?.home
          : match.ratings?.away;

      if (teamRatings?.players) {
        const playerRating = teamRatings.players.find(
          (p) =>
            p.playerName.toLowerCase().includes(playerName) ||
            playerName.includes(p.playerName.toLowerCase()),
        );
        if (playerRating?.rating) {
          playerRatings.push(playerRating.rating);
        }
      }
    }

    if (playerRatings.length > 0) {
      const avgRating =
        playerRatings.reduce((a, b) => a + b, 0) / playerRatings.length;
      const playerData = {
        name: injury.name ?? '',
        avgRating: parseFloat(avgRating.toFixed(2)),
        matchesRated: playerRatings.length,
      };

      if (avgRating >= 7.5) {
        highImpact.push(playerData);
      } else if (avgRating >= 6.8) {
        moderateImpact.push(playerData);
      } else {
        lowImpact.push(playerData);
      }
    }
  }

  // Calculate total rating loss
  const totalRatingLoss =
    highImpact.reduce((sum, p) => sum + p.avgRating, 0) +
    moderateImpact.reduce((sum, p) => sum + p.avgRating, 0) +
    lowImpact.reduce((sum, p) => sum + p.avgRating, 0);

  // Determine impact level
  let impactLevel: InjuredPlayerImpact['impactLevel'] = 'Unknown';
  if (
    highImpact.length >= 2 ||
    (highImpact.length >= 1 && moderateImpact.length >= 2)
  ) {
    impactLevel = 'Critical';
  } else if (highImpact.length >= 1 || moderateImpact.length >= 3) {
    impactLevel = 'Significant';
  } else if (moderateImpact.length >= 1 || lowImpact.length >= 2) {
    impactLevel = 'Moderate';
  } else if (lowImpact.length >= 1) {
    impactLevel = 'Minimal';
  }

  return {
    highImpactMissing: highImpact.sort((a, b) => b.avgRating - a.avgRating),
    moderateImpactMissing: moderateImpact.sort(
      (a, b) => b.avgRating - a.avgRating,
    ),
    lowImpactMissing: lowImpact.sort((a, b) => b.avgRating - a.avgRating),
    totalRatingLoss: parseFloat(totalRatingLoss.toFixed(2)),
    impactLevel,
  };
}

interface RatingTrajectory {
  last5AvgRating: number | null;
  previous5AvgRating: number | null;
  trajectory: 'Improving' | 'Declining' | 'Stable' | 'Insufficient data';
  ratingChange: number | null;
  matchByMatchRatings: Array<{
    date: string;
    opponent: string;
    avgRating: number | null;
    result: string;
  }>;
  bestRatedMatch: { date: string; opponent: string; avgRating: number } | null;
  worstRatedMatch: { date: string; opponent: string; avgRating: number } | null;
}

function calculateRatingTrajectory(
  matches: KickerGPTMatchSummary[],
  teamId: number,
): RatingTrajectory {
  const matchRatings: Array<{
    date: string;
    opponent: string;
    avgRating: number | null;
    result: string;
  }> = [];

  for (const match of matches.slice(0, 10)) {
    const isHome = match.teams.home.id === teamId;
    const teamRatings = isHome ? match.ratings?.home : match.ratings?.away;
    const opponent = isHome ? match.teams.away.name : match.teams.home.name;
    const result = getTeamResult(match, teamId) ?? 'unknown';

    matchRatings.push({
      date: match.date,
      opponent,
      avgRating: teamRatings?.teamAverage ?? null,
      result,
    });
  }

  const last5 = matchRatings.slice(0, 5).filter((m) => m.avgRating !== null);
  const previous5 = matchRatings
    .slice(5, 10)
    .filter((m) => m.avgRating !== null);

  const last5Avg =
    last5.length > 0
      ? last5.reduce((sum, m) => sum + m.avgRating!, 0) / last5.length
      : null;
  const previous5Avg =
    previous5.length > 0
      ? previous5.reduce((sum, m) => sum + m.avgRating!, 0) / previous5.length
      : null;

  let trajectory: RatingTrajectory['trajectory'] = 'Insufficient data';
  let ratingChange: number | null = null;

  if (last5Avg !== null && previous5Avg !== null) {
    ratingChange = parseFloat((last5Avg - previous5Avg).toFixed(2));
    if (ratingChange > 0.2) trajectory = 'Improving';
    else if (ratingChange < -0.2) trajectory = 'Declining';
    else trajectory = 'Stable';
  } else if (last5Avg !== null) {
    trajectory = 'Stable'; // Only have recent data
  }

  // Find best and worst
  const validRatings = matchRatings.filter((m) => m.avgRating !== null);
  const best =
    validRatings.length > 0
      ? validRatings.reduce((a, b) => (a.avgRating! > b.avgRating! ? a : b))
      : null;
  const worst =
    validRatings.length > 0
      ? validRatings.reduce((a, b) => (a.avgRating! < b.avgRating! ? a : b))
      : null;

  return {
    last5AvgRating: last5Avg ? parseFloat(last5Avg.toFixed(2)) : null,
    previous5AvgRating: previous5Avg
      ? parseFloat(previous5Avg.toFixed(2))
      : null,
    trajectory,
    ratingChange,
    matchByMatchRatings: matchRatings,
    bestRatedMatch: best
      ? { date: best.date, opponent: best.opponent, avgRating: best.avgRating! }
      : null,
    worstRatedMatch: worst
      ? {
          date: worst.date,
          opponent: worst.opponent,
          avgRating: worst.avgRating!,
        }
      : null,
  };
}

function getRatingQualityComparison(
  homeTrajectory: RatingTrajectory,
  awayTrajectory: RatingTrajectory,
  teams: { home: { name: string }; away: { name: string } },
): string {
  const homeRating = homeTrajectory.last5AvgRating;
  const awayRating = awayTrajectory.last5AvgRating;

  if (homeRating === null && awayRating === null) {
    return 'Insufficient rating data for comparison';
  }

  if (homeRating !== null && awayRating !== null) {
    const diff = homeRating - awayRating;
    if (Math.abs(diff) < 0.15) {
      return `Even quality - both teams averaging ~${homeRating.toFixed(1)} ratings`;
    }
    if (diff > 0.3) {
      return `${teams.home.name} showing higher quality (${homeRating.toFixed(2)} vs ${awayRating.toFixed(2)}) - significant edge`;
    }
    if (diff < -0.3) {
      return `${teams.away.name} showing higher quality (${awayRating.toFixed(2)} vs ${homeRating.toFixed(2)}) - significant edge`;
    }
    if (diff > 0) {
      return `${teams.home.name} slightly higher quality (${homeRating.toFixed(2)} vs ${awayRating.toFixed(2)})`;
    }
    return `${teams.away.name} slightly higher quality (${awayRating.toFixed(2)} vs ${homeRating.toFixed(2)})`;
  }

  return 'Partial rating data available';
}

function analyzeH2HRatings(
  h2h: KickerGPTMatchSummary[],
  homeTeamId: number,
  awayTeamId: number,
): {
  matchesWithRatings: number;
  homeAvgRating: number | null;
  awayAvgRating: number | null;
  homeBest: { date: string; rating: number } | null;
  homeWorst: { date: string; rating: number } | null;
  awayBest: { date: string; rating: number } | null;
  awayWorst: { date: string; rating: number } | null;
  qualityWinner: string;
  insight: string;
} {
  const homeRatings: Array<{ date: string; rating: number }> = [];
  const awayRatings: Array<{ date: string; rating: number }> = [];

  for (const match of h2h) {
    // Determine which team is which in this particular match
    const homeTeamIsHome = match.teams.home.id === homeTeamId;
    const homeTeamIsAway = match.teams.away.id === homeTeamId;
    const awayTeamIsHome = match.teams.home.id === awayTeamId;
    const awayTeamIsAway = match.teams.away.id === awayTeamId;

    // Get ratings for the "home team" (team playing at home in the parent fixture)
    if (homeTeamIsHome && match.ratings?.home?.teamAverage) {
      homeRatings.push({
        date: match.date,
        rating: match.ratings.home.teamAverage,
      });
    } else if (homeTeamIsAway && match.ratings?.away?.teamAverage) {
      homeRatings.push({
        date: match.date,
        rating: match.ratings.away.teamAverage,
      });
    }

    // Get ratings for the "away team" (team playing away in the parent fixture)
    if (awayTeamIsHome && match.ratings?.home?.teamAverage) {
      awayRatings.push({
        date: match.date,
        rating: match.ratings.home.teamAverage,
      });
    } else if (awayTeamIsAway && match.ratings?.away?.teamAverage) {
      awayRatings.push({
        date: match.date,
        rating: match.ratings.away.teamAverage,
      });
    }
  }

  const matchesWithRatings = Math.max(homeRatings.length, awayRatings.length);

  const homeAvg =
    homeRatings.length > 0
      ? parseFloat(
          (
            homeRatings.reduce((s, r) => s + r.rating, 0) / homeRatings.length
          ).toFixed(2),
        )
      : null;
  const awayAvg =
    awayRatings.length > 0
      ? parseFloat(
          (
            awayRatings.reduce((s, r) => s + r.rating, 0) / awayRatings.length
          ).toFixed(2),
        )
      : null;

  const homeBest =
    homeRatings.length > 0
      ? homeRatings.reduce((a, b) => (a.rating > b.rating ? a : b))
      : null;
  const homeWorst =
    homeRatings.length > 0
      ? homeRatings.reduce((a, b) => (a.rating < b.rating ? a : b))
      : null;
  const awayBest =
    awayRatings.length > 0
      ? awayRatings.reduce((a, b) => (a.rating > b.rating ? a : b))
      : null;
  const awayWorst =
    awayRatings.length > 0
      ? awayRatings.reduce((a, b) => (a.rating < b.rating ? a : b))
      : null;

  let qualityWinner = 'Even';
  let insight = '';

  if (homeAvg !== null && awayAvg !== null) {
    const diff = homeAvg - awayAvg;
    if (diff > 0.2) {
      qualityWinner = 'Home team';
      insight = `Historically performs better in this fixture with ${diff.toFixed(2)} rating advantage`;
    } else if (diff < -0.2) {
      qualityWinner = 'Away team';
      insight = `Historically performs better in this fixture with ${Math.abs(diff).toFixed(2)} rating advantage`;
    } else {
      insight =
        'Both teams typically perform at similar levels in this fixture';
    }
  } else {
    insight = 'Insufficient H2H rating data';
  }

  return {
    matchesWithRatings,
    homeAvgRating: homeAvg,
    awayAvgRating: awayAvg,
    homeBest,
    homeWorst,
    awayBest,
    awayWorst,
    qualityWinner,
    insight,
  };
}

function getTopPerformers(
  matches: KickerGPTMatchSummary[],
  teamId: number,
  limit: number,
): Array<{ name: string; avgRating: number; appearances: number }> {
  const playerStats = new Map<string, { totalRating: number; count: number }>();

  for (const match of matches) {
    const isHome = match.teams.home.id === teamId;
    const teamRatings = isHome ? match.ratings?.home : match.ratings?.away;

    if (teamRatings?.players) {
      for (const player of teamRatings.players) {
        if (player.rating !== null) {
          const existing = playerStats.get(player.playerName) ?? {
            totalRating: 0,
            count: 0,
          };
          existing.totalRating += player.rating;
          existing.count += 1;
          playerStats.set(player.playerName, existing);
        }
      }
    }
  }

  const performers = Array.from(playerStats.entries())
    .filter(([, stats]) => stats.count >= 2) // At least 2 appearances
    .map(([name, stats]) => ({
      name,
      avgRating: parseFloat((stats.totalRating / stats.count).toFixed(2)),
      appearances: stats.count,
    }))
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, limit);

  return performers;
}

function getInjuryImpactComparison(
  homeImpact: InjuredPlayerImpact,
  awayImpact: InjuredPlayerImpact,
  teams: { home: { name: string }; away: { name: string } },
): string {
  const homeLevel = {
    Critical: 4,
    Significant: 3,
    Moderate: 2,
    Minimal: 1,
    Unknown: 0,
  }[homeImpact.impactLevel];
  const awayLevel = {
    Critical: 4,
    Significant: 3,
    Moderate: 2,
    Minimal: 1,
    Unknown: 0,
  }[awayImpact.impactLevel];

  if (homeLevel === awayLevel) {
    return `Even - both teams have ${homeImpact.impactLevel.toLowerCase()} injury impact`;
  }

  if (homeLevel > awayLevel) {
    return `${teams.away.name} advantage - ${teams.home.name} missing higher quality players (${homeImpact.highImpactMissing.length} key players out)`;
  }

  return `${teams.home.name} advantage - ${teams.away.name} missing higher quality players (${awayImpact.highImpactMissing.length} key players out)`;
}
