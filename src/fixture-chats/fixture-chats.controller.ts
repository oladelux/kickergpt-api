import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FixtureChatsService } from './fixture-chats.service';
import { GetFixtureChatHistoryQueryDto } from '../fixtures/dto/get-fixture-chat-history-query.dto';
import { FixtureChatMessageDto } from '../fixtures/dto/fixture-chat-message.dto';
import { FixtureChatMapper } from '../fixtures/mappers/fixture-chat.mapper';

@ApiTags('Fixtures')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'fixtures',
  version: '1',
})
export class FixtureChatsController {
  constructor(private readonly fixtureChatsService: FixtureChatsService) {}

  @Get('user/chats')
  @ApiOkResponse({
    type: FixtureChatMessageDto,
    isArray: true,
  })
  async getUserChats(
    @Request() request,
    @Query() query: GetFixtureChatHistoryQueryDto,
  ): Promise<FixtureChatMessageDto[]> {
    const chats = await this.fixtureChatsService.getChatsForUser({
      userId: request.user.id,
      limit: query.limit,
      offset: query.offset,
    });

    return chats.map(FixtureChatMapper.toDto);
  }

  @Get(':fixtureId/chats')
  @ApiParam({
    name: 'fixtureId',
    example: 123456,
    description: 'API-Football fixture identifier.',
  })
  @ApiOkResponse({
    type: FixtureChatMessageDto,
    isArray: true,
  })
  async getFixtureChats(
    @Request() request,
    @Param('fixtureId', ParseIntPipe) fixtureId: number,
    @Query() query: GetFixtureChatHistoryQueryDto,
  ): Promise<FixtureChatMessageDto[]> {
    const chats = await this.fixtureChatsService.getChatsForFixture({
      userId: request.user.id,
      fixtureId,
      limit: query.limit,
      offset: query.offset,
    });

    return chats.map(FixtureChatMapper.toDto);
  }
}
