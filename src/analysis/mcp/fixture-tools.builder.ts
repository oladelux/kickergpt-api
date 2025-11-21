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

export function buildFixtureTools(
  context: KickerGPTFixturesResponse,
): OpenAiToolDefinition[] {
  const tools: OpenAiToolDefinition[] = [];
  const matchDate = new Date(context.date);
  const matchWeekday = WEEKDAYS[matchDate.getUTCDay()];
  const matchWeather = context.weatherSummary?.toLowerCase() ?? '';

  const allMatches = [
    ...(context.h2h ?? []),
    ...(context.lastHomeMatches ?? []),
    ...(context.lastAwayMatches ?? []),
  ];

  const homeTeamId = context.teams.home.id;
  const awayTeamId = context.teams.away.id;

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
        matches: context.lastHomeMatches ?? [],
      },
      away: {
        team: context.teams.away.name,
        matches: context.lastAwayMatches ?? [],
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
      const homeMatches = context.lastHomeMatches ?? [];
      const awayMatches = context.lastAwayMatches ?? [];
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
            results: (context.lastHomeMatches ?? []).slice(0, 5).map((m) => ({
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
            results: (context.lastAwayMatches ?? []).slice(0, 5).map((m) => ({
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
