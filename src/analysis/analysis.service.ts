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
    return (
      'You are MatchGPT, a football analyst. Use the MCP tools provided to gather context before forming conclusions. ' +
      'Always call fixture_card, get_head_to_head, get_recent_form (home and away), and get_injuries (home and away) unless the tool explicitly reports no data. ' +
      'Never claim a dataset is missing unless a tool response states so. ' +
      'When users mention weather, call the weather_overview tool; otherwise call it when you plan to reference conditions. ' +
      'Respond with grounded analysis only, describing betting markets qualitatively—never quote numeric odds. '
    );
  }

  private buildUserPrompt(
    snapshot: KickerGPTFixturesResponse,
    message: string,
    tone?: string,
  ): string {
    const lines = [
      `Match: ${snapshot.teams.home.name} vs ${snapshot.teams.away.name} on ${snapshot.date} (${snapshot.timezone})`,
      `User request: ${message.trim()}`,
      tone ? `Preferred tone: ${tone.trim()}` : undefined,
      'Use the tools to collect data, then provide a concise, insight-driven answer.',
    ].filter(Boolean);

    return lines.join('\n');
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
