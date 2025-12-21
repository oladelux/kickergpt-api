import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRevenueCatSupport1734900000000
  implements MigrationInterface
{
  name = 'RemoveRevenueCatSupport1734900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop revenuecat_events table indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_revenuecat_events_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_revenuecat_events_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_revenuecat_events_transaction"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_revenuecat_events_user"`,
    );

    // Drop foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "revenuecat_events" DROP CONSTRAINT IF EXISTS "FK_revenuecat_events_user"`,
    );

    // Drop revenuecat_events table
    await queryRunner.query(`DROP TABLE IF EXISTS "revenuecat_events"`);

    // Drop RevenueCat columns from subscription table
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_subscription_revenuecat_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "revenuecatAutoRenew"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "revenuecatProductId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN IF EXISTS "revenuecatUserId"`,
    );

    // Note: PostgreSQL doesn't allow removing enum values, so REVENUECAT will remain
    // in the payment_provider enum but won't be used
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add RevenueCat columns to subscription table
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatUserId" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_revenuecat_user" ON "subscription" ("revenuecatUserId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatProductId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatAutoRenew" boolean DEFAULT true`,
    );

    // Re-create revenuecat_events table
    await queryRunner.query(
      `CREATE TABLE "revenuecat_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventType" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "transactionId" character varying NOT NULL,
        "productId" character varying,
        "entitlementIds" text array,
        "expirationAt" TIMESTAMP WITH TIME ZONE,
        "store" character varying,
        "rawData" jsonb NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        CONSTRAINT "PK_revenuecat_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_revenuecat_events_transaction" UNIQUE ("transactionId")
      )`,
    );

    // Re-add foreign key to users table
    await queryRunner.query(
      `ALTER TABLE "revenuecat_events" ADD CONSTRAINT "FK_revenuecat_events_user" 
       FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Re-create indexes for revenuecat_events table
    await queryRunner.query(
      `CREATE INDEX "IDX_revenuecat_events_user" ON "revenuecat_events" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_revenuecat_events_transaction" ON "revenuecat_events" ("transactionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_revenuecat_events_type" ON "revenuecat_events" ("eventType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_revenuecat_events_created" ON "revenuecat_events" ("createdAt")`,
    );
  }
}
