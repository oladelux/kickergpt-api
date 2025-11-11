import { ApiProperty } from '@nestjs/swagger';

export class CheckoutResponseDto {
  @ApiProperty({
    example: 'https://checkout.stripe.com/c/pay/cs_test_123',
    nullable: true,
  })
  checkoutUrl: string | null;
}
