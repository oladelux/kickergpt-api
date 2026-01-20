import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { NaturalQueryService } from './natural-query.service';
import { NaturalQueryRequestDto } from './dto/natural-query-request.dto';
import { NaturalQueryResponseDto } from './dto/natural-query-response.dto';
import { NaturalQueryResponse } from './types/natural-query.types';

@ApiTags('Natural Query')
@Controller({
  path: 'query',
  version: '1',
})
export class NaturalQueryController {
  constructor(private readonly naturalQueryService: NaturalQueryService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query matches using natural language',
    description: `Search for football matches using natural language queries.

**Example queries:**
- "Give me matches that will get over 1.5 goals from England this week"
- "Which matches have BTTS potential from La Liga?"
- "Find me high-scoring fixtures from Germany"
- "Show me confident over 2.5 predictions for tomorrow"
- "Top 5 result predictions from Spain"

**Supported prediction types:**
- Over 1.5 goals
- Over 2.5 goals
- BTTS (Both Teams To Score)
- Match result (Home/Away/Draw)

**Supported countries:**
England, Spain, Germany, Italy, France, Netherlands, Portugal, Belgium, Scotland, Turkey

**Note:** Data is limited to fixtures in the 3-day cache.`,
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

    return this.naturalQueryService.queryMatches(body.query, userId);
  }
}
