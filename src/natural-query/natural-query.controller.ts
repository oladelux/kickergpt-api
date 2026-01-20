import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiBody,
} from '@nestjs/swagger';
import { NaturalQueryService } from './natural-query.service';
import { FixtureFilterService } from './fixture-filter.service';
import {
  NaturalQueryRequestDto,
  EXAMPLE_QUERIES,
} from './dto/natural-query-request.dto';
import { NaturalQueryResponseDto } from './dto/natural-query-response.dto';
import { NaturalQueryResponse } from './types/natural-query.types';
import {
  getSupportedCountries,
  getSupportedLeagues,
} from './types/country-league-mapping';

@ApiTags('Natural Query')
@Controller({
  path: 'query',
  version: '1',
})
export class NaturalQueryController {
  private readonly logger = new Logger(NaturalQueryController.name);

  constructor(
    private readonly naturalQueryService: NaturalQueryService,
    private readonly fixtureFilterService: FixtureFilterService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query matches using natural language',
    description: `Search for football matches using natural language queries.

## Example Queries

**Basic Predictions:**
- "Over 1.5 goals from England"
- "BTTS from La Liga"
- "High-scoring fixtures from Germany"

**With Filters:**
- "Give me matches that will get over 1.5 goals from England this week"
- "Which matches have BTTS potential from La Liga?"
- "Find me high-scoring fixtures from Germany tomorrow"

**With Confidence:**
- "Top 5 confident over 2.5 predictions"
- "Safest BTTS bets today"
- "Very confident home wins from Italy"

**Result Predictions:**
- "Home wins from Spain"
- "Away wins from France today"
- "Draws from England"

## Supported Prediction Types
- **Over 1.5 goals** - Matches likely to have 2+ goals
- **Over 2.5 goals** - Matches likely to have 3+ goals
- **BTTS** - Both teams to score
- **Result** - Home win, Away win, or Draw
- **Home Win** - Home team victory
- **Away Win** - Away team victory
- **Draw** - Match ends in a tie

## Supported Countries
${getSupportedCountries().join(', ')}

## Supported Leagues
${getSupportedLeagues().join(', ')}

## Date Filters
- **today** - Matches playing today
- **tomorrow** - Matches playing tomorrow
- **this week / next few days** - Matches in the next 3 days (default)

## Confidence Levels
- **any** - All matches (default)
- **medium** - 50%+ probability
- **high** - 65%+ probability
- **very_high** - 80%+ probability

**Note:** Data is limited to fixtures in the 3-day cache.`,
  })
  @ApiBody({
    type: NaturalQueryRequestDto,
    examples: {
      basic: {
        summary: 'Basic query',
        value: { query: 'Over 1.5 goals from England' },
      },
      btts: {
        summary: 'BTTS query',
        value: { query: 'BTTS from La Liga today' },
      },
      confident: {
        summary: 'With confidence filter',
        value: { query: 'Top 5 confident over 2.5 predictions from Germany' },
      },
      result: {
        summary: 'Result prediction',
        value: { query: 'Home wins from Italy tomorrow' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Query results with matching fixtures and predictions',
    type: NaturalQueryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query format',
  })
  @ApiUnauthorizedResponse({
    description: 'User not authenticated',
  })
  async query(
    @Body() body: NaturalQueryRequestDto,
    @Request() request: { user?: { id: string } },
  ): Promise<NaturalQueryResponse> {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Validate query
    if (!body.query || body.query.trim().length < 2) {
      throw new BadRequestException('Query must be at least 2 characters long');
    }

    this.logger.log(`User ${userId} querying: "${body.query}"`);

    return this.naturalQueryService.queryMatches(body.query, userId);
  }

  @Get('suggestions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get example queries',
    description:
      'Returns a list of example queries to help users understand the query format.',
  })
  @ApiOkResponse({
    description: 'List of example queries',
    schema: {
      type: 'object',
      properties: {
        examples: {
          type: 'array',
          items: { type: 'string' },
        },
        supportedCountries: {
          type: 'array',
          items: { type: 'string' },
        },
        supportedLeagues: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  getSuggestions(): {
    examples: string[];
    supportedCountries: string[];
    supportedLeagues: string[];
  } {
    return {
      examples: EXAMPLE_QUERIES,
      supportedCountries: getSupportedCountries(),
      supportedLeagues: getSupportedLeagues(),
    };
  }

  @Get('health')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get cache health status',
    description: 'Returns information about the fixture cache status.',
  })
  @ApiOkResponse({
    description: 'Cache health information',
    schema: {
      type: 'object',
      properties: {
        dates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              fixtureCount: { type: 'number' },
            },
          },
        },
        totalFixtures: { type: 'number' },
      },
    },
  })
  async getCacheHealth(): Promise<{
    dates: Array<{ date: string; fixtureCount: number }>;
    totalFixtures: number;
  }> {
    return this.fixtureFilterService.getCacheHealth();
  }

  @Get('countries')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get available countries',
    description:
      'Returns a list of countries with available fixtures in the cache.',
  })
  @ApiOkResponse({
    description: 'List of available countries',
    schema: {
      type: 'object',
      properties: {
        countries: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async getAvailableCountries(): Promise<{ countries: string[] }> {
    const countries = await this.fixtureFilterService.getAvailableCountries();
    return { countries };
  }

  @Get('leagues')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get available leagues',
    description:
      'Returns a list of leagues with available fixtures in the cache.',
  })
  @ApiOkResponse({
    description: 'List of available leagues',
    schema: {
      type: 'object',
      properties: {
        leagues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getAvailableLeagues(): Promise<{
    leagues: Array<{ id: number; name: string; country: string }>;
  }> {
    const leagues = await this.fixtureFilterService.getAvailableLeagues();
    return { leagues };
  }
}
