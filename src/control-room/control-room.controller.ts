import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FixturesAnalysisService } from '../analysis/analysis.service';
import { ControlRoomGuard } from './control-room.guard';
import { ControlRoomOutcomesRequestDto } from './dto/control-room-outcomes.request.dto';
import { ControlRoomOutcomeDto } from './dto/control-room-outcomes.response.dto';
import { SportmonksFixturesResponse } from '../sportmonks/types/fixture';
import { CacheTTL } from '@nestjs/cache-manager';
import { SportmonksFixturesResponseDto } from '../sportmonks/dto/sportmonks-fixtures-response.dto';
import { SportmonksService } from '../sportmonks/sportmonks.service';

@ApiTags('ControlRoom')
@Controller({
  path: 'control-room',
  version: '1',
})
export class ControlRoomController {
  constructor(
    private readonly fixturesAnalysisService: FixturesAnalysisService,
    private readonly sportmonksService: SportmonksService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), ControlRoomGuard)
  @Post('outcomes')
  @ApiOkResponse({
    description: 'Explains why the specified fixture ended with its result.',
    type: ControlRoomOutcomeDto,
  })
  async explainOutcomes(
    @Body() body: ControlRoomOutcomesRequestDto,
  ): Promise<ControlRoomOutcomeDto> {
    return this.fixturesAnalysisService.explainOutcomeForFixture(
      body.fixtureId,
      body.date,
      body.question,
      body.conversationId,
    );
  }

  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format. Defaults to today.',
    example: '2024-08-04',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'Order by starting time.',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @ApiQuery({
    name: 'per_page',
    required: false,
    description: 'Number of fixtures per page (max 50).',
    example: 30,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number when paginating.',
    example: 2,
  })
  @ApiOkResponse({
    description: 'Fixtures scheduled for the requested day.',
    type: SportmonksFixturesResponseDto,
  })
  @Get()
  @CacheTTL(14_400)
  @ApiQuery({
    name: 'timezone',
    required: false,
    description:
      'IANA timezone identifier to localize fixture times (e.g. America/New_York). Defaults to the server timezone.',
    example: 'America/New_York',
  })
  async getControlRoomFixturesOfDay(
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    return this.sportmonksService.getControlRoomFixturesOfDay(date, timezone);
  }
}
