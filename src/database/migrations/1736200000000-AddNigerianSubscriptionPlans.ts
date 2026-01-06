import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNigerianSubscriptionPlans1736200000000
  implements MigrationInterface
{
  name = 'AddNigerianSubscriptionPlans1736200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new enum values for Nigerian subscription plans
    await queryRunner.query(
      `ALTER TYPE "public"."subscription_plan_enum" ADD VALUE IF NOT EXISTS 'THREE_DAY_PASS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."subscription_plan_enum" ADD VALUE IF NOT EXISTS 'SEVEN_DAY_PASS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."subscription_plan_enum" ADD VALUE IF NOT EXISTS 'MONTHLY_UNLIMITED'`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public down(_queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly.
    // To properly revert, you would need to:
    // 1. Update all rows using new enum values to use old values
    // 2. Create a new enum type without the new values
    // 3. Update the column to use the new enum type
    // 4. Drop the old enum type
    // For simplicity, we'll just log a warning here.
    console.warn(
      'Cannot remove enum values from PostgreSQL. Manual intervention required to revert.',
    );
    return Promise.resolve();
  }
}
