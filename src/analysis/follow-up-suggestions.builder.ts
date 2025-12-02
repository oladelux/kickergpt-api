import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';

export type FollowUpSuggestion = {
  id: string;
  question: string;
  available: boolean;
};

export function buildFollowUpSuggestions(
  fixture: KickerGPTFixturesResponse,
  previousQuestions: string[],
  limit: number = 3,
): string[] {
  const homeTeam = fixture.teams.home.name;
  const awayTeam = fixture.teams.away.name;

  const allSuggestions = [
    // Data-focused questions
    `What's the exact H2H record between ${homeTeam} and ${awayTeam}?`,
    `What are ${homeTeam}'s home stats this season?`,
    `How does ${awayTeam} perform away from home?`,

    // Pattern questions
    `Any referee patterns I should know about?`,
    `Do either team struggle on this day of the week?`,
    `What's the over/under and BTTS likelihood?`,

    // Risk questions
    `What could go wrong for the favorite here?`,
    `Any upset potential based on the data?`,
    `Who are the key injured players and how good are they?`,

    // Verdict questions
    `Who does the data actually favor?`,
    `What's the one stat that matters most here?`,
    `Should I be worried about backing ${homeTeam}?`,
  ];

  // Filter out questions similar to what's been asked
  const filtered = allSuggestions.filter(
    (q) =>
      !previousQuestions.some((prev) =>
        prev
          .toLowerCase()
          .includes(q.toLowerCase().split(' ').slice(0, 3).join(' ')),
      ),
  );

  // Return random selection
  return filtered.sort(() => Math.random() - 0.5).slice(0, limit);
}
