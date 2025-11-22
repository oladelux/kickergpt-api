import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { AdminMetricsDto } from './dto/admin-metrics.dto';

@ApiTags('Admin')
@Controller({
  path: 'admin',
  version: '1',
})
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(private readonly adminMetricsService: AdminMetricsService) {}

  @Get('metrics')
  @ApiOkResponse({ type: AdminMetricsDto })
  async getMetrics(): Promise<AdminMetricsDto> {
    return this.adminMetricsService.getMetrics();
  }
}
