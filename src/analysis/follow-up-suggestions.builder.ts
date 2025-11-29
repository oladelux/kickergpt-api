import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';

export type FollowUpSuggestion = {
  id: string;
  question: string;
  available: boolean;
};

type FollowUpTemplate = {
  id: string;
  question: string;
  checkAvailability: (context: KickerGPTFixturesResponse) => boolean;
};

const FOLLOW_UP_TEMPLATES: FollowUpTemplate[] = [
  {
    id: 'weather',
    question: 'How do both teams perform in similar weather conditions?',
    checkAvailability: (ctx) => !!ctx.weatherSummary,
  },
  {
    id: 'referee',
    question: "What's the referee's history with these teams?",
    checkAvailability: (ctx) => !!ctx.referee,
  },
  {
    id: 'day_patterns',
    question: 'How do they perform on this day of the week?',
    checkAvailability: () => true,
  },
  {
    id: 'injuries',
    question: 'How are injuries affecting both squads?',
    checkAvailability: (ctx) =>
      (ctx.homeInjuries?.length ?? 0) > 0 ||
      (ctx.awayInjuries?.length ?? 0) > 0,
  },
  {
    id: 'h2h',
    question: 'What does the head-to-head history tell us?',
    checkAvailability: (ctx) => (ctx.h2h?.length ?? 0) > 0,
  },
  {
    id: 'home_away',
    question: 'How strong is the home advantage in this matchup?',
    checkAvailability: () => true,
  },
  {
    id: 'goals',
    question: 'What are the chances both teams score?',
    checkAvailability: (ctx) =>
      (ctx.homeTeamRecentMatches?.length ?? 0) > 0 ||
      (ctx.awayTeamRecentMatches?.length ?? 0) > 0,
  },
  {
    id: 'momentum',
    question: 'Which team has better momentum right now?',
    checkAvailability: (ctx) =>
      (ctx.homeTeamRecentMatches?.length ?? 0) > 0 ||
      (ctx.awayTeamRecentMatches?.length ?? 0) > 0,
  },
  {
    id: 'fatigue',
    question: 'Is fixture congestion a factor for either team?',
    checkAvailability: (ctx) =>
      (ctx.homeTeamRecentMatches?.length ?? 0) > 2 ||
      (ctx.awayTeamRecentMatches?.length ?? 0) > 2,
  },
  {
    id: 'upset',
    question: 'Could the underdog cause an upset here?',
    checkAvailability: (ctx) => !!ctx.homeOdd && !!ctx.awayOdd,
  },
  {
    id: 'clean_sheet',
    question: 'How likely is a clean sheet for either side?',
    checkAvailability: (ctx) =>
      (ctx.homeTeamRecentMatches?.length ?? 0) > 0 ||
      (ctx.awayTeamRecentMatches?.length ?? 0) > 0,
  },
  {
    id: 'news',
    question: "What's the latest news around both camps?",
    checkAvailability: (ctx) =>
      (ctx.homeNews?.length ?? 0) > 0 || (ctx.awayNews?.length ?? 0) > 0,
  },
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function buildFollowUpSuggestions(
  context: KickerGPTFixturesResponse,
  usedDimensions?: string[],
  count: number = 3,
): FollowUpSuggestion[] {
  const used = new Set(usedDimensions ?? []);

  const available = FOLLOW_UP_TEMPLATES.filter(
    (template) => !used.has(template.id),
  )
    .filter((template) => template.checkAvailability(context))
    .map((template) => ({
      id: template.id,
      question: template.question,
      available: true,
    }));

  // Shuffle and pick random suggestions
  const shuffled = shuffleArray(available);
  return shuffled.slice(0, count);
}
