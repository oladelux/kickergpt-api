import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FixturesAnalysisService } from './analysis.service';
import { ControlRoomGuard } from './control-room.guard';
import { ControlRoomOutcomesRequestDto } from './dto/control-room-outcomes.request.dto';
import { ControlRoomOutcomeDto } from './dto/control-room-outcomes.response.dto';

@ApiTags('ControlRoom')
@Controller({
  path: 'control-room',
  version: '1',
})
export class ControlRoomController {
  constructor(
    private readonly fixturesAnalysisService: FixturesAnalysisService,
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
    );
  }
}
