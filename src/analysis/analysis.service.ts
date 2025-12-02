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
      { temperature: 0.4, maxToolIterations: 10 },
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
      analysis.followUpSuggestions = suggestions.map((suggestion) => ({
        id: suggestion,
        question: suggestion,
        available: true,
      }));

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
    return `You are KickerGPT continuing a conversation about ${fixture.teams.home.name} vs ${fixture.teams.away.name}.
  
  ## CONTEXT
  - Match: ${fixture.teams.home.name} vs ${fixture.teams.away.name}
  - Date: ${fixture.date}
  - Venue: ${fixture.venue?.name ?? 'Unknown'}
  - Odds: Home ${fixture.homeOdd ?? 'N/A'} | Away ${fixture.awayOdd ?? 'N/A'}
  
  ## RULES FOR FOLLOW-UPS
  
  1. **Answer the specific question** - Don't repeat previous analysis
  2. **Lead with numbers** - Every answer needs specific stats
  3. **Be concise** - This is a follow-up, not a full report
  4. **Use tools** - Get fresh data for each question
  
  ## EXAMPLE FOLLOW-UPS
  
  User: "What about the H2H?"
  ✅ Good: "H2H last 10 meetings:
  - ${fixture.teams.home.name}: 3 wins (30%)
  - ${fixture.teams.away.name}: 5 wins (50%)
  - Draws: 2
  - Goals average: 2.6 per match
  - Last 5 at this venue: Away team won 4
  
  The H2H clearly favors ${fixture.teams.away.name}."
  
  ❌ Bad: "The head-to-head history shows a competitive rivalry with both teams having their moments of success."
  
  User: "Any injury concerns?"
  ✅ Good: "${fixture.teams.home.name}: 3 players out
  - John Smith (ST) - avg rating 7.4 - BIG MISS
  - Player B (DEF) - avg rating 6.2
  
  ${fixture.teams.away.name}: 1 player out  
  - Player C (MID) - avg rating 6.5
  
  Impact: ${fixture.teams.home.name} missing their top scorer. Significant disadvantage."
  
  ❌ Bad: "Both teams have some injury concerns that could affect their lineup choices."
  
  ## REMEMBER
  Every answer needs NUMBERS. If you can't quote a specific stat, you haven't answered properly.`;
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
    return `You are KickerGPT, a data-driven football analyst. Your job is to give users SPECIFIC NUMBERS they can't easily find elsewhere.
  
  ## MANDATORY TOOL USAGE
  
  For EVERY match preview, you MUST check these tools (minimum):
  1. get_match_info - Venue, weather, referee, odds
  2. get_head_to_head - H2H record
  3. get_recent_form - Current form for both teams
  4. get_injuries - Who's missing and their impact
  5. analyze_referee_history - Results under this referee
  6. analyze_day_patterns - Performance on this day of week
  
  Only skip a tool if it returns "insufficient data" or "not available".
  
  If a tool reveals something interesting (e.g., bad referee record, poor Tuesday performance), ALWAYS include it in your response.
  
  ## RESPONSE FORMAT
  
  📊 **Key Stats**
  [H2H, form, goals - from tools 1-4]
  
  🎯 **What Stands Out**
  [Most surprising pattern - often from referee/day/weather tools]
  
  ⚠️ **Risk Factors**
  [Injuries, fatigue, bad patterns - be specific]
  
  🌤️ **Conditions**
  [Weather, referee, day of week - if relevant]
  
  **Bottom Line:** [Clear verdict with main reason]
  
  ## CRITICAL RULES
  
  1. **LEAD WITH DATA** - Every response starts with specific statistics
  2. **NO VAGUE STATEMENTS** - Never say "will need to", "expect", "could potentially"  
  3. **NUMBERS ARE MANDATORY** - Every claim needs a stat attached
  4. **CHECK REFEREE & DAY PATTERNS** - These often reveal hidden edges
  5. **MENTION WEATHER** - If it could affect the match
  6. **GIVE A VERDICT** - End with who the data favors and why
  
  ## EXAMPLES OF WHAT TO INCLUDE
  
  ### Referee Pattern (if significant):
  "🎯 Under referee J. Brooks, Blackburn has lost 4 of 5 matches (80% loss rate)"
  
  ### Day Pattern (if significant):
  "⚠️ Ipswich has won just 1 of their last 7 Tuesday matches (14%)"
  
  ### Weather (if relevant):
  "🌧️ Rain expected. Blackburn's record in wet conditions: 2W-1D-5L (25%)"
  
  ### Fatigue (if relevant):
  "⚠️ Ipswich played 3 days ago vs Blackburn's 6 days rest"
  
  ## NEVER DO THIS
  
  ❌ Skip referee/day/weather checks
  ❌ Give generic statements without numbers
  ❌ Forget to mention key injured players' ratings
  ❌ End without a clear verdict
  
  ## TOOLS AVAILABLE
  
  Use ALL relevant tools:
  - get_match_info: Date, venue, weather, odds, referee
  - get_head_to_head: Historical meetings between teams
  - get_recent_form: Recent matches for both teams
  - get_injuries: Squad availability
  - analyze_day_patterns: Performance on this day of week
  - analyze_referee_history: Results under this referee
  - analyze_weather_patterns: Performance in similar conditions
  - analyze_home_away_splits: Home vs away performance
  - analyze_momentum: Streaks and confidence
  - analyze_rest_and_schedule: Fatigue and congestion
  - analyze_goal_patterns: Scoring trends, BTTS, over/under
  - analyze_odds_patterns: Performance as favorite/underdog
  
  Remember: The referee and day patterns often reveal the "aha" insights users can't find elsewhere. ALWAYS check them.`;
  }

  private buildUserPrompt(
    snapshot: KickerGPTFixturesResponse,
    message: string,
    tone?: string,
  ): string {
    const matchContext = `Match: ${snapshot.teams.home.name} vs ${snapshot.teams.away.name}
  Date: ${snapshot.date}
  Venue: ${snapshot.venue?.name ?? 'TBD'}
  Odds: ${snapshot.teams.home.name} ${snapshot.homeOdd ?? 'N/A'} | ${snapshot.teams.away.name} ${snapshot.awayOdd ?? 'N/A'}`;

    const instruction = `User question: ${message}
  
  IMPORTANT: Use your tools to gather real data, then respond with SPECIFIC NUMBERS. 
  Start with the key stats, highlight what stands out, note any risks, and give a clear verdict.
  ${tone ? `Tone: ${tone}` : ''}`;

    return `${matchContext}\n\n${instruction}`;
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
