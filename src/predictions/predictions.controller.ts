import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PredictionsService } from './predictions.service';
import { PredictionsScheduler } from './predictions.scheduler';
import { TodayPredictionsResponseDto } from './dto/prediction-response.dto';
import { TodayPredictionsResponse } from './types/prediction.types';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';

/** Maximum number of predictions shown to free users */
const FREE_USER_PREDICTION_LIMIT = 5;

@ApiTags('Predictions')
@Controller({
  path: 'predictions',
  version: '1',
})
export class PredictionsController {
  constructor(
    private readonly predictionsService: PredictionsService,
    private readonly predictionsScheduler: PredictionsScheduler,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get today's match predictions",
    description:
      'Returns match probability insights for today. Free users see up to 5 predictions, PRO users see all.',
  })
  @ApiOkResponse({
    description: "Today's predictions successfully retrieved",
    type: TodayPredictionsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated',
  })
  async getPredictions(@Request() request): Promise<TodayPredictionsResponse> {
    const predictions = await this.predictionsService.getTodayPredictions();

    // If no cached predictions, return empty response
    if (!predictions) {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      return {
        date: dateStr,
        predictions: [],
        totalFixturesAnalyzed: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    // Check if user is PRO subscriber
    const isProUser = await this.isProSubscriber(request.user?.id);

    // If PRO user, return all predictions
    if (isProUser) {
      return predictions;
    }

    // For free users, limit to 5 predictions
    return {
      ...predictions,
      predictions: predictions.predictions.slice(0, FREE_USER_PREDICTION_LIMIT),
    };
  }

  /**
   * Check if the user has an active PRO subscription.
   */
  private async isProSubscriber(userId: string | undefined): Promise<boolean> {
    if (!userId) {
      return false;
    }

    try {
      const subscription = await this.subscriptionsService.findByUserId(userId);

      if (!subscription) {
        return false;
      }

      return (
        subscription.plan === SubscriptionPlan.PRO &&
        subscription.status === SubscriptionStatus.ACTIVE
      );
    } catch {
      return false;
    }
  }

  @Post('admin/generate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually trigger predictions generation',
    description:
      'Admin endpoint to manually trigger predictions generation. Useful for testing or forcing a refresh.',
  })
  @ApiOkResponse({
    description: 'Predictions generated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        predictions: { type: 'number' },
        fixturesAnalyzed: { type: 'number' },
        duration: { type: 'number' },
      },
    },
  })
  async generatePredictions(): Promise<{
    message: string;
    predictions: number;
    fixturesAnalyzed: number;
    duration: number;
  }> {
    const result =
      await this.predictionsScheduler.triggerPredictionsGeneration();

    return {
      message: 'Predictions generated successfully',
      ...result,
    };
  }
}
