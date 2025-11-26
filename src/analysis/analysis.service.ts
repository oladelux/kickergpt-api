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
import { ControlRoomOutcomeDto } from '../control-room/dto/control-room-outcomes.response.dto';
import { buildOutcomeAnalysisTools } from '../control-room/mcp/outcome-tools.builder';

@Injectable()
export class FixturesAnalysisService {
  private readonly logger = new Logger(FixturesAnalysisService.name);
  private static readonly ANALYSIS_CACHE_TTL_SECONDS = 600;
  private readonly conversationHistory = new Map<
    string,
    Array<{ role: 'user' | 'assistant'; content: string }>
  >();
  // Cache TTL for conversations (30 minutes)
  private static readonly CONVERSATION_TTL_MS = 30 * 60 * 1000;

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
    conversationId?: string,
  ): Promise<FixtureAnalysis> {
    if (!userId) {
      throw new BadRequestException(
        'Authenticated user is required to generate an analysis.',
      );
    }

    // Handle conversation context
    let convId: string;
    let isFollowUp = false;
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (conversationId && this.conversationHistory.has(conversationId)) {
      convId = conversationId;
      isFollowUp = true;
      history = this.conversationHistory.get(conversationId) ?? [];
      this.logger.log(
        `Pre-match follow-up for conversation ${convId}, history length: ${history.length}`,
      );
    } else {
      convId = `prematch_${fixtureId}_${Date.now()}`;
      this.logger.log(`New pre-match conversation: ${convId}`);
    }

    // Only use cache for initial analysis, not follow-ups
    const cacheKey = this.buildCacheKey(fixtureId, message, tone);
    if (!isFollowUp) {
      const cached = await this.cacheManager.get<FixtureAnalysis>(cacheKey);
      if (cached) {
        await this.persistChatHistory({
          fixtureId,
          userId,
          message,
          tone,
          analysis: cached,
        });
        return { ...cached, conversationId: convId };
      }
    }

    const fixtureSnapshot = await this.getCachedFixtureSnapshot(fixtureId);

    if (!fixtureSnapshot) {
      throw new NotFoundException(
        `Fixture with id ${fixtureId} is not available in the cached fixtures.`,
      );
    }

    await this.consumePromptCredit(userId);

    const tools = buildFixtureTools(fixtureSnapshot);

    // Build messages with conversation history
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    if (isFollowUp) {
      messages.push({
        role: 'system',
        content: this.buildPreMatchFollowUpSystemPrompt(fixtureSnapshot),
      });
      messages.push(...history);
    } else {
      messages.push({ role: 'system', content: this.buildSystemPrompt() });
    }

    const userPrompt = this.buildUserPrompt(fixtureSnapshot, message, tone);
    messages.push({ role: 'user', content: userPrompt });

    this.logger.log(
      isFollowUp
        ? `Processing pre-match follow-up for fixture ${fixtureId}: "${message}"`
        : `Generating initial pre-match analysis for fixture ${fixtureId}`,
    );

    const response = await this.openAiService.generateTextWithTools(
      messages,
      tools,
      { temperature: 0.4 },
    );

    if (!response.text) {
      throw new BadRequestException('OpenAI did not return any content.');
    }

    // Update conversation history
    history.push({ role: 'user', content: userPrompt });
    history.push({ role: 'assistant', content: response.text });

    // Keep only last 10 messages to prevent context overflow
    if (history.length > 10) {
      history = history.slice(-10);
    }

    this.conversationHistory.set(convId, history);

    // Clean up old conversations periodically
    this.cleanupOldConversations();

    const analysis: FixtureAnalysis = {
      fixtureId: fixtureSnapshot.id,
      summary: response.text,
      metadata: {
        model: response.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
      conversationId: convId,
    };

    // Add follow-up suggestions for first-time queries on this match
    if (!isFollowUp) {
      const suggestions = buildFollowUpSuggestions(fixtureSnapshot, [], 3);
      analysis.followUpSuggestions = suggestions;

      // Only cache initial analysis, not follow-ups
      await this.cacheManager.set(
        cacheKey,
        analysis,
        FixturesAnalysisService.ANALYSIS_CACHE_TTL_SECONDS,
      );
    }

    await this.persistChatHistory({
      fixtureId,
      userId,
      message,
      tone,
      analysis,
    });

    return analysis;
  }

  async explainOutcomeForFixture(
    fixtureId: number,
    date: string,
    question?: string,
    conversationId?: string,
  ): Promise<ControlRoomOutcomeDto> {
    const resolvedDate = date.trim();

    // Try to get from cache first
    const cacheKey = `outcome-analysis:${fixtureId}:${resolvedDate}`;
    const cached = await this.cacheManager.get<ControlRoomOutcomeDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Returning cached outcome analysis for fixture ${fixtureId}`,
      );
      return cached;
    }

    // Fetch the fixture
    const fixture = resolvedDate
      ? await this.sportmonksService.getSelectedControlRoomMatches(
          fixtureId,
          resolvedDate,
        )
      : await this.sportmonksService.getSelectedMatches(fixtureId);

    if (!fixture) {
      throw new NotFoundException(
        `Fixture with id ${fixtureId} is not available in the cached fixtures.`,
      );
    }

    // Validate the match has a result
    if (!fixture.finalScore) {
      throw new BadRequestException(
        `Fixture ${fixtureId} has not completed. Cannot explain outcome without a final score.`,
      );
    }

    // Build specialized outcome analysis tools
    const tools = buildOutcomeAnalysisTools(fixture);

    // Handle conversation context
    let convId: string;
    let isFollowUp = false;
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (conversationId && this.conversationHistory.has(conversationId)) {
      // This is a follow-up - use existing conversation
      convId = conversationId;
      isFollowUp = true;
      history = this.conversationHistory.get(conversationId) ?? [];
      this.logger.log(
        `Follow-up detected for conversation ${convId}, history length: ${history.length}`,
      );
    } else {
      // New conversation
      convId = `conv_${fixtureId}_${Date.now()}`;
      this.logger.log(`New conversation created: ${convId}`);
    }

    // Build messages
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    // System prompt - different for initial vs follow-up
    if (isFollowUp) {
      messages.push({
        role: 'system',
        content: this.buildFollowUpSystemPrompt(fixture),
      });
    } else {
      messages.push({
        role: 'system',
        content: this.buildOutcomeAnalysisSystemPrompt(),
      });
    }

    // Add conversation history for follow-ups
    if (isFollowUp && history.length > 0) {
      messages.push(...history);
    }

    // Add current user message
    const userMessage =
      question ?? this.buildOutcomeAnalysisUserPrompt(fixture);
    messages.push({ role: 'user', content: userMessage });

    this.logger.log(
      isFollowUp
        ? `Processing follow-up question for fixture ${fixtureId}: "${question}"`
        : `Generating initial outcome analysis for fixture ${fixtureId}`,
    );

    const response = await this.openAiService.generateTextWithTools(
      messages,
      tools,
      { temperature: 0.3, maxToolIterations: 12 },
    );

    if (!response.text) {
      throw new BadRequestException(
        'OpenAI did not return any analysis content.',
      );
    }

    // Update conversation history
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: response.text });

    // Keep only last 10 messages to prevent context overflow
    if (history.length > 10) {
      history = history.slice(-10);
    }

    this.conversationHistory.set(convId, history);

    // Clean up old conversations periodically
    this.cleanupOldConversations();

    return {
      fixtureId: fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      finalScore: fixture.finalScore,
      analysis: response.text,
      conversationId: convId,
    };
  }

  private buildPreMatchFollowUpSystemPrompt(
    fixture: KickerGPTFixturesResponse,
  ): string {
    return `You are KickerGPT continuing a pre-match analysis conversation about ${fixture.teams.home.name} vs ${fixture.teams.away.name}.
  
  ## CONTEXT
  - Match: ${fixture.teams.home.name} vs ${fixture.teams.away.name}
  - Date: ${fixture.date}
  - Venue: ${fixture.venue?.name ?? 'Unknown'}
  - Odds: Home ${fixture.homeOdd ?? 'N/A'} | Away ${fixture.awayOdd ?? 'N/A'}
  
  ## YOUR TASK
  Answer the user's follow-up question DIRECTLY and CONVERSATIONALLY.
  
  ## RULES
  1. **Answer the specific question asked** - Don't repeat the full analysis
  2. **Use tools to get data** - Always back up claims with tool data
  3. **Be conversational** - This is a chat, not a report
  4. **Be concise** - Give focused answers, not essays
  
  ## AVAILABLE TOOLS
  You have access to all analytical tools:
  - get_match_info, get_head_to_head, get_recent_form, get_injuries
  - analyze_weather_patterns, analyze_day_patterns, analyze_referee_history
  - analyze_odds_patterns, analyze_injury_impact, analyze_goal_patterns
  - analyze_home_away_splits, analyze_momentum, analyze_rest_and_schedule
  
  ## EXAMPLE FOLLOW-UP RESPONSES
  
  User: "What about the weather?"
  Good: "Looking at the weather factor:
  - Conditions: ${fixture.weatherSummary ?? 'Unknown'}
  - ${fixture.teams.home.name}'s record in similar conditions: 3W-1D-2L (50%)
  - ${fixture.teams.away.name}'s record: 2W-2D-1L (40%)
  Weather slightly favors the home side."
  
  User: "How's the head to head?"
  Good: "The H2H history shows:
  - Total meetings: 12
  - ${fixture.teams.home.name}: 5 wins (42%)
  - ${fixture.teams.away.name}: 4 wins (33%)
  - Draws: 3
  Recent trend favors the home side with 3 wins in the last 5 meetings."
  
  User: "Any injury concerns?"
  Good: "${fixture.teams.home.name} has 3 players out including their starting striker. ${fixture.teams.away.name} has a full squad available. This gives the away side a significant advantage in attacking options."`;
  }

  /**
   * Clean up conversations older than TTL
   */
  private cleanupOldConversations(): void {
    // This is a simple cleanup - in production you'd want timestamps
    if (this.conversationHistory.size > 100) {
      // Keep only the 50 most recent
      const entries = Array.from(this.conversationHistory.entries());
      const toKeep = entries.slice(-50);
      this.conversationHistory.clear();
      toKeep.forEach(([k, v]) => this.conversationHistory.set(k, v));
    }
  }

  /**
   * System prompt for follow-up questions - more conversational
   */
  private buildFollowUpSystemPrompt(
    fixture: KickerGPTFixturesResponse,
  ): string {
    return `You are KickerGPT's Post-Match Analyst continuing a conversation about the ${fixture.teams.home.name} vs ${fixture.teams.away.name} match.

      ## CONTEXT
      - Match: ${fixture.teams.home.name} ${fixture.finalScore?.home ?? 0} - ${fixture.finalScore?.away ?? 0} ${fixture.teams.away.name}
      - Result: ${fixture.finalScore?.winner === 'home' ? fixture.teams.home.name + ' won' : fixture.finalScore?.winner === 'away' ? fixture.teams.away.name + ' won' : 'Draw'}

      ## YOUR TASK
      Answer the user's follow-up question DIRECTLY and CONVERSATIONALLY.

      ## RULES
      1. **Answer the specific question asked** - Don't repeat the full analysis
      2. **Use tools to get data** - Always back up claims with tool data
      3. **Be conversational** - This is a chat, not a report
      4. **Be concise** - Give focused answers, not essays

      ## AVAILABLE TOOLS
      You have access to all the same analytical tools. Use them to answer questions about:
      - Day/time patterns (analyze_weekday_patterns, analyze_kickoff_time_patterns, etc.)
      - Form and momentum
      - H2H history
      - Injuries, fatigue, weather
      - And more

      ## EXAMPLE FOLLOW-UP RESPONSES

      User: "What was the game day analysis?"
      Good: "Looking at the day patterns:
      - This was a Sunday 4:30pm kickoff
      - Manchester United's Sunday record: 2W-1D-3L (33%)
      - Everton's Sunday away record: 3W-1D-1L (60%)
      The day actually favored Everton."

      User: "How do they usually perform on Monday nights?"
      Good: "Monday night records:
      - Man United: 5W-2D-4L (45% win rate) - slightly below their average
      - Everton: 3W-1D-2L (50% win rate)
      Neither team has a strong Monday night pattern."

      User: "What about injuries?"
      Good: "United had 5 players out (including Martínez and Maguire), while Everton had only 3. The defensive injuries particularly hurt United - they've conceded 1.8 goals/game without Martínez vs 0.9 with him."`;
  }

  private buildOutcomeAnalysisSystemPrompt(): string {
    return `You are KickerGPT's Post-Match Analyst - an expert at explaining WHY football matches ended with specific results using historical data patterns.
  
  ## YOUR MISSION
  Analyze completed matches and identify the KEY FACTORS that contributed to the outcome. Your analysis must be DATA-DRIVEN - use the tools to find patterns, don't just state obvious things like "they upset the odds."
  
  ## CRITICAL: USE ALL AVAILABLE TOOLS
  
  You MUST use these tools to gather evidence before making any claims:
  
  **Match Context:**
  - get_match_context - Basic match info, odds, venue
  - get_final_result - Score details
  
  **Expectation Analysis:**
  - compare_pre_match_odds - Was this an upset?
  - calculate_expectation_delta - Expected vs actual
  
  **Form & History:**
  - analyze_form_trajectory - Were teams improving/declining?
  - analyze_h2h_patterns - Historical patterns between teams
  - analyze_momentum - Streaks and confidence
  
  **Contextual Factors:**
  - analyze_home_away_context - Venue impact
  - analyze_injury_impact - Squad availability
  - analyze_schedule_fatigue - Rest and workload
  - analyze_weather_influence - Weather performance
  - analyze_referee_tendencies - Referee history
  
  **⚠️ MANDATORY - Day & Time Patterns (ALWAYS USE THESE):**
  - analyze_weekday_patterns - How teams perform on this day of week
  - analyze_kickoff_time_patterns - Performance at this kickoff time
  - analyze_day_and_time_combined - Combined day + time analysis
  - analyze_monthly_patterns - Seasonal patterns
  - analyze_time_preference_comparison - Best/worst time slots for each team
  - analyze_weekday_preference_comparison - Best/worst days for each team
  
  **Upset Analysis:**
  - identify_upset_factors - What enabled an upset
  
  ## ANALYSIS REQUIREMENTS
  
  1. **ALWAYS check day/time patterns** - These often reveal hidden factors. A team might have a terrible Monday night record or struggle with early kickoffs. ALWAYS run these tools.
  
  2. **Lead with DATA, not obvious statements** - Don't say "Everton upset the odds." Instead say "Manchester United has won only 25% of Sunday evening matches this season, while Everton has won 60% of their away games on Sundays."
  
  3. **Find the REAL reasons** - Look for patterns that explain the result:
     - Did the losing team have a poor record on this day/time?
     - Did the winning team excel in these conditions?
     - Were there scheduling disadvantages?
     - What historical patterns predicted this?
  
  4. **Be specific with numbers** - Always cite actual statistics from the tools.
  
  ## RESPONSE STYLE
  
  **For initial analysis:** Provide structured analysis with key factors, but ALWAYS include day/time pattern findings.
  
  **For follow-up questions:** Answer DIRECTLY and CONVERSATIONALLY. 
  - If asked "what was the game day analysis?" → Use the day/time tools and give a focused answer about day/time patterns ONLY
  - If asked "how did injuries affect this?" → Answer specifically about injuries
  - Don't repeat the full analysis - answer the specific question asked
  
  ## EXAMPLE RESPONSES
  
  **Bad response to "why did they lose?":**
  "Manchester United lost because Everton upset the odds. The pre-match odds favored United..."
  (This just states the obvious - we KNOW they lost)
  
  **Good response to "why did they lose?":**
  "Manchester United's loss can be traced to several data-backed patterns:
  - **Sunday Evening Struggles**: United has won only 2 of their last 8 Sunday evening kickoffs (25%), while Everton wins 55% of Sunday away games
  - **December Decline**: United's December record is W2-D3-L4, their worst month historically
  - **Fatigue Factor**: United played 3 days ago vs Everton's 6 days rest
  - **H2H Shift**: While United leads H2H 28-15, Everton has won 3 of the last 5 meetings"
  
  **Bad response to follow-up "what about the day pattern?":**
  *Repeats entire analysis with same format*
  
  **Good response to follow-up "what about the day pattern?":**
  "Looking at the day patterns specifically:
  - This was a Sunday 4:30pm kickoff
  - Manchester United's Sunday record this season: 2W-1D-3L (33% win rate)
  - Their afternoon kickoff record: 4W-2D-5L (36% win rate)  
  - Combined Sunday afternoon: Only 1 win in 4 matches
  - Everton's Sunday away record: 3W-1D-1L (60% win rate)
  
  The scheduling actually favored Everton significantly."
  
  ## REMEMBER
  - Use ALL tools, especially day/time patterns
  - Lead with data patterns, not obvious observations
  - Answer follow-up questions directly without repeating everything
  - Be conversational when appropriate`;
  }

  private buildOutcomeAnalysisUserPrompt(
    fixture: KickerGPTFixturesResponse,
  ): string {
    const { teams, finalScore, date, venue, weatherSummary, homeOdd, awayOdd } =
      fixture;

    const scoreText = finalScore
      ? `${teams.home.name} ${finalScore.home} - ${finalScore.away} ${teams.away.name}`
      : 'Score unavailable';

    const winnerText =
      finalScore?.winner === 'home'
        ? `${teams.home.name} won`
        : finalScore?.winner === 'away'
          ? `${teams.away.name} won`
          : 'Match ended in a draw';

    const favoriteText = (() => {
      const home = parseFloat(homeOdd ?? '0');
      const away = parseFloat(awayOdd ?? '0');
      if (!home || !away) return 'Unknown';
      if (Math.abs(home - away) < 0.3) return 'Even match (no clear favorite)';
      return home < away
        ? `${teams.home.name} was favorite`
        : `${teams.away.name} was favorite`;
    })();

    return `## POST-MATCH ANALYSIS REQUEST
  
  **Match**: ${teams.home.name} vs ${teams.away.name}
  **Date**: ${date}
  **Venue**: ${venue?.name ?? 'Unknown'}${venue?.city ? `, ${venue.city}` : ''}
  **Conditions**: ${weatherSummary ?? 'Unknown'}
  **Pre-Match Odds**: Home ${homeOdd ?? 'N/A'} | Away ${awayOdd ?? 'N/A'}
  **Pre-Match Favorite**: ${favoriteText}
  
  ---
  
  **FINAL RESULT**: ${scoreText}
  **OUTCOME**: ${winnerText}
  
  ---
  
  Analyze this completed match and explain WHY it ended this way. Use your analytical tools to:
  
  1. Determine if this result matched pre-match expectations
  2. Identify the 3-5 most significant factors that influenced the outcome
  3. Find any notable patterns (H2H, form, conditions, etc.)
  4. Explain what the winning team did right AND/OR what went wrong for the losing team
  
  Provide a data-driven explanation with specific statistics from your tools.`;
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
