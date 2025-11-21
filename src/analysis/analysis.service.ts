import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { OpenAiService } from '../openai/openai.service';
import { FixtureAnalysis } from '../fixtures/types/fixture-analysis.type';
import { KickerGPTFixturesResponse } from '../fixtures/types/fixtures-response.type';
import { FixtureChatsService } from '../fixture-chats/fixture-chats.service';
import { PromptUsageService } from '../prompt-usage/prompt-usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { buildFixtureTools } from './mcp/fixture-tools.builder';
import { SportmonksService } from '../sportmonks/sportmonks.service';
import { buildFollowUpSuggestions } from './follow-up-suggestions.builder';

@Injectable()
export class FixturesAnalysisService {
  private readonly logger = new Logger(FixturesAnalysisService.name);
  private static readonly ANALYSIS_CACHE_TTL_SECONDS = 600;

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly fixtureChatsService: FixtureChatsService,
    private readonly promptUsageService: PromptUsageService,
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly sportmonksService: SportmonksService,
  ) {}

  async analyzeFixture(
    fixtureId: number,
    message: string,
    userId: string,
    tone?: string,
  ): Promise<FixtureAnalysis> {
    if (!userId) {
      throw new BadRequestException(
        'Authenticated user is required to generate an analysis.',
      );
    }

    const cacheKey = this.buildCacheKey(fixtureId, message, tone);
    const cached = await this.cacheManager.get<FixtureAnalysis>(cacheKey);

    if (cached) {
      await this.persistChatHistory({
        fixtureId,
        userId,
        message,
        tone,
        analysis: cached,
      });
      return cached;
    }

    const fixtureSnapshot = await this.getCachedFixtureSnapshot(fixtureId);

    if (!fixtureSnapshot) {
      throw new NotFoundException(
        `Fixture with id ${fixtureId} is not available in the cached fixtures.`,
      );
    }

    await this.consumePromptCredit(userId);

    const tools = buildFixtureTools(fixtureSnapshot);
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(fixtureSnapshot, message, tone);

    const response = await this.openAiService.generateTextWithTools(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools,
      { temperature: 0.4 },
    );

    if (!response.text) {
      throw new BadRequestException('OpenAI did not return any content.');
    }

    const analysis: FixtureAnalysis = {
      fixtureId: fixtureSnapshot.id,
      summary: response.text,
      metadata: {
        model: response.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
    };

    // Add follow-up suggestions for first-time queries on this match
    const isFirstQuery = !cached;
    if (isFirstQuery) {
      const suggestions = buildFollowUpSuggestions(fixtureSnapshot, [], 3);
      analysis.followUpSuggestions = suggestions;
    }

    await this.cacheManager.set(
      cacheKey,
      analysis,
      FixturesAnalysisService.ANALYSIS_CACHE_TTL_SECONDS,
    );

    await this.persistChatHistory({
      fixtureId,
      userId,
      message,
      tone,
      analysis,
    });

    return analysis;
  }

  private async getCachedFixtureSnapshot(
    fixtureId: number,
  ): Promise<KickerGPTFixturesResponse | undefined> {
    return this.sportmonksService.getSelectedMatches(fixtureId);
  }

  private buildSystemPrompt(): string {
    return `
    You are KickerGPT, an elite football analyst helping users predict match outcomes.

    You have tools to retrieve and analyze fixture data. Your goal is to provide insights that help users understand who might win.

    TOOLS:
    - get_match_info: Basic match details (date, venue, weather, odds, referee)
    - get_head_to_head: Historical meetings between the teams
    - get_recent_form: Recent matches showing current form for both teams
    - get_injuries: Squad availability for both teams
    - get_team_news: Recent news and sentiment
    - analyze_weather_patterns: How teams perform in similar weather conditions
    - analyze_day_patterns: How teams perform on this specific day of the week
    - analyze_referee_history: Results when this referee has officiated either team
    - analyze_odds_patterns: How teams perform as favorites vs underdogs, upset history
    - analyze_injury_impact: How injuries affect squad depth and recent performance
    - analyze_goal_patterns: Scoring trends, clean sheets, BTTS, over/under stats
    - analyze_home_away_splits: Performance at home vs away specifically
    - analyze_momentum: Current streaks, form, confidence levels
    - analyze_rest_and_schedule: Rest days, fatigue risk, schedule congestion

    ANALYSIS APPROACH:
    When predicting outcomes, consider multiple factors:
    1. Head-to-head history and recent momentum
    2. Weather conditions - compare with results in similar weather
    3. Day of the week patterns - some teams perform differently on certain days
    4. Referee tendencies - check historical results under this referee
    5. Odds analysis - who's favored, upset potential, how teams perform as underdogs/favorites
    6. Injury impact - squad depth and key player availability
    7. Goal patterns - clean sheets, BTTS likelihood, over/under trends
    8. Home/away splits - how much does venue matter for each team
    9. Momentum and streaks - current confidence levels
    10. Rest and fatigue - schedule congestion impact
    11. News sentiment (manager changes, transfers, fan pressure)

    GUIDELINES:
    - Use the analytical tools to find patterns across dimensions
    - Cross-reference findings (e.g., "They struggle on Fridays AND in rain")
    - Be specific about which factors favor which team
    - Acknowledge when data is limited or inconclusive
    - Never invent statistics - only use data from tools
    - Provide a clear assessment of who has the edge and why`;
  }

  private buildUserPrompt(
    snapshot: KickerGPTFixturesResponse,
    message: string,
    tone?: string,
  ): string {
    const matchContext = `Match: ${snapshot.teams.home.name} vs ${snapshot.teams.away.name} (${snapshot.date})`;
    const parts = [
      matchContext,
      `User question: ${message}`,
      tone ? `Respond in a ${tone} tone` : null,
    ];
    return parts.filter(Boolean).join('\n');
  }

  private buildCacheKey(
    fixtureId: number,
    message: string,
    tone?: string,
  ): string {
    const normalizedMessage = message.trim().toLowerCase();
    const toneKey = tone?.trim().toLowerCase() ?? 'default';
    return `fixture-analysis:${fixtureId}:${toneKey}:${normalizedMessage}`;
  }

  private async persistChatHistory(params: {
    fixtureId: number;
    userId?: string;
    message: string;
    tone?: string;
    analysis: FixtureAnalysis;
  }): Promise<void> {
    if (!params.userId) {
      return;
    }

    try {
      await this.fixtureChatsService.logChat({
        fixtureId: params.fixtureId,
        userId: params.userId,
        message: params.message,
        tone: params.tone,
        summary: params.analysis.summary,
        metadata: params.analysis.metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist chat history: ${(error as Error).message}`,
      );
    }
  }

  private async consumePromptCredit(userId: string) {
    const subscription =
      await this.subscriptionsService.getSubscriptionForUser(userId);

    await this.promptUsageService.consumePromptCredit({
      userId,
      plan: subscription.plan,
      status: subscription.status,
    });
  }
}
