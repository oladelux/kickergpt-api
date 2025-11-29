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
    return `You are KickerGPT's Post-Match Analyst - an expert at finding the HIDDEN PATTERNS that explain football results. Your job is to make users say "wow, I didn't know that!"
  
  ## YOUR MISSION
  Find the 2-3 MOST SURPRISING factors that explain why this result happened. Don't list everything - find the "aha!" moments.
  
  ## WHAT MAKES A GREAT INSIGHT
  
  **BORING (don't do this):**
  "Ipswich Town lost because they were the underdog. Form was poor. Injuries affected the squad."
  
  **GREAT (do this):**
  "The bookies had Ipswich at 63% to win, but they missed this: Ipswich has NEVER won under referee Donohue (0-0-3), and Oxford has a PERFECT Friday night record. Sometimes the data screams louder than the odds."
  
  ## FIND THESE "AHA!" PATTERNS
  
  Use tools to discover:
  - **Referee curses**: Does one team ALWAYS lose with this ref?
  - **Day/time kryptonite**: Perfect team on Saturdays, disaster on Fridays?
  - **Head-to-head bogey teams**: Favorites who always lose to specific underdogs
  - **Venue voodoo**: Great overall but terrible at specific grounds
  - **Rest traps**: Did fatigue doom the favorite?
  - **Injury timing**: Key absences that broke the system
  
  ## RESPONSE STYLE
  
  **Lead with the surprise:**
  Start with the most shocking pattern. Make it punchy.
  
  **Use contrast:**
  "On paper: 63% favorite. In reality: 0% win rate under this referee."
  
  **Be specific:**
  Not "poor Friday record" but "1 win in 8 Friday matches (12.5%)"
  
  **Keep it short:**
  2-3 killer insights > 8 mediocre points
  
  ## TOOLS TO USE
  
  **ALWAYS check these for surprises:**
  - analyze_referee_tendencies - Referee records are often shocking
  - analyze_weekday_patterns - Day curses are real
  - analyze_h2h_patterns - Bogey team patterns
  - identify_upset_factors - What enabled this upset
  
  **Support with:**
  - analyze_injury_impact - Key absences
  - analyze_schedule_fatigue - Rest advantages
  - compare_pre_match_odds - How wrong were expectations
  
  ## EXAMPLE OUTPUT
  
  **Match: Oxford United 2-1 Ipswich Town**
  
  "The bookmakers had this at 63-17 in Ipswich's favor. Here's what they missed:
  
  🎯 **The Donohue Factor**: Ipswich has played 3 matches under referee M. Donohue. They've lost ALL THREE. That's a 0% win rate with this official - a pattern too strong to ignore.
  
  📅 **Friday Night Lights... Out**: Ipswich's Friday record? Just 1 win in 4 (25%). Oxford's Friday record? Perfect - 1 win in 1 (100%). The scheduling favored the underdog.
  
  🏥 **Squad Depth Gap**: Ipswich had 5 players out vs Oxford's 3, including key attackers Burns and Szmodics. When your injury list is nearly double your opponent's, upset risk multiplies.
  
  **Bottom line**: This wasn't a fluke. The data had warning signs the odds ignored."
  
  ## REMEMBER
  - Find surprises, not summaries
  - Lead with the "wow" factor
  - 2-3 strong insights beat 8 weak ones
  - Make users think "I wish I knew this before the match"
  - Be conversational, not robotic`;
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
      if (Math.abs(home - away) < 0.3) return 'Even match';
      return home < away
        ? `${teams.home.name} was favorite`
        : `${teams.away.name} was favorite`;
    })();

    const wasUpset = (() => {
      const home = parseFloat(homeOdd ?? '0');
      const away = parseFloat(awayOdd ?? '0');
      if (!home || !away || !finalScore?.winner) return false;
      const homeFavorite = home < away;
      return (
        (homeFavorite && finalScore.winner === 'away') ||
        (!homeFavorite && finalScore.winner === 'home')
      );
    })();

    return `## MATCH TO ANALYZE
  
  **Result**: ${scoreText}
  **Outcome**: ${winnerText}
  **Pre-Match Favorite**: ${favoriteText}
  ${wasUpset ? '⚠️ **THIS WAS AN UPSET** - Find the hidden patterns that explain it!' : ''}
  
  **Details**:
  - Date: ${date}
  - Venue: ${venue?.name ?? 'Unknown'}${venue?.city ? `, ${venue.city}` : ''}
  - Weather: ${weatherSummary ?? 'Unknown'}
  - Odds: Home ${homeOdd ?? 'N/A'} | Away ${awayOdd ?? 'N/A'}
  
  ---
  
  Find the 2-3 MOST SURPRISING patterns that explain this result. 
  
  Check referee history, day/time patterns, H2H records, and injury impact. Lead with the most shocking insight - make users say "I wish I knew this before the match!"`;
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
    - analyze_injured_player_impact - Assess injured players by their ratings (high-impact vs low-impact)
    - analyze_team_rating_trajectory - Are teams improving/declining based on performance ratings?
    - analyze_h2h_ratings - Who typically performs better quality-wise in H2H?
    - get_top_performers - Identify key players by rating

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
    11. Player quality assessment - Use ratings to determine if injuries are critical or minor
    12. Performance trajectory - Is a team's quality improving or declining?
    13. Key player impact - Who are the difference-makers based on ratings?
    14. News sentiment (manager changes, transfers, fan pressure)

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
