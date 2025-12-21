import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaystackSupport1733500000000 implements MigrationInterface {
  name = 'AddPaystackSupport1733500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create payment provider enum
    await queryRunner.query(
      `CREATE TYPE "public"."subscription_payment_provider_enum" AS ENUM('STRIPE', 'PAYSTACK')`,
    );

    // Add payment provider column with default STRIPE for existing records
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "paymentProvider" "public"."subscription_payment_provider_enum" NOT NULL DEFAULT 'STRIPE'`,
    );

    // Make stripeCustomerId nullable
    await queryRunner.query(
      `ALTER TABLE "subscription" ALTER COLUMN "stripeCustomerId" DROP NOT NULL`,
    );

    // Add Paystack customer code column
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "paystackCustomerCode" character varying`,
    );

    // Add unique constraint for Paystack customer code
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD CONSTRAINT "UQ_subscription_paystack_customer" UNIQUE ("paystackCustomerCode")`,
    );

    // Add index for Paystack customer code
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_paystack_customer" ON "subscription" ("paystackCustomerCode")`,
    );

    // Add Paystack subscription code column
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "paystackSubscriptionCode" character varying`,
    );

    // Add unique constraint for Paystack subscription code
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD CONSTRAINT "UQ_subscription_paystack_subscription" UNIQUE ("paystackSubscriptionCode")`,
    );

    // Add index for Paystack subscription code
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_paystack_subscription" ON "subscription" ("paystackSubscriptionCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop Paystack subscription code index and constraint
    await queryRunner.query(
      `DROP INDEX "public"."IDX_subscription_paystack_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP CONSTRAINT "UQ_subscription_paystack_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "paystackSubscriptionCode"`,
    );

    // Drop Paystack customer code index and constraint
    await queryRunner.query(
      `DROP INDEX "public"."IDX_subscription_paystack_customer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP CONSTRAINT "UQ_subscription_paystack_customer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "paystackCustomerCode"`,
    );

    // Make stripeCustomerId non-nullable (restore original state)
    await queryRunner.query(
      `ALTER TABLE "subscription" ALTER COLUMN "stripeCustomerId" SET NOT NULL`,
    );

    // Drop payment provider column
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "paymentProvider"`,
    );

    // Drop payment provider enum
    await queryRunner.query(
      `DROP TYPE "public"."subscription_payment_provider_enum"`,
    );
  }
}
