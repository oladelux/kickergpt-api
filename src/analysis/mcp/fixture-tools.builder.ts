import { OpenAiToolDefinition } from '../../openai/openai.service';
import { KickerGPTFixturesResponse } from '../../fixtures/types/fixtures-response.type';

export function buildFixtureTools(
  context: KickerGPTFixturesResponse,
): OpenAiToolDefinition[] {
  const tools: OpenAiToolDefinition[] = [];

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
      message: context.h2h?.length
        ? undefined
        : 'No head-to-head data available',
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
        players: context.homeInjuries ?? [],
      },
      away: {
        team: context.teams.away.name,
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
  return tools;
}
