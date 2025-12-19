import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRevenueCatSupport1734800000000 implements MigrationInterface {
  name = 'AddRevenueCatSupport1734800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alter payment provider enum to add REVENUECAT
    await queryRunner.query(
      `ALTER TYPE "public"."subscription_payment_provider_enum" ADD VALUE 'REVENUECAT'`,
    );

    // Add RevenueCat user ID column
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatUserId" character varying`,
    );

    // Add index for RevenueCat user ID
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_revenuecat_user" ON "subscription" ("revenuecatUserId")`,
    );

    // Add RevenueCat product ID column
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatProductId" character varying`,
    );

    // Add RevenueCat auto-renew column
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD "revenuecatAutoRenew" boolean DEFAULT true`,
    );

    // Create revenuecat_events table
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

    // Add foreign key to users table
    await queryRunner.query(
      `ALTER TABLE "revenuecat_events" ADD CONSTRAINT "FK_revenuecat_events_user" 
       FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Create indexes for revenuecat_events table
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop revenuecat_events table indexes
    await queryRunner.query(
      `DROP INDEX "public"."IDX_revenuecat_events_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_revenuecat_events_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_revenuecat_events_transaction"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_revenuecat_events_user"`,
    );

    // Drop foreign key
    await queryRunner.query(
      `ALTER TABLE "revenuecat_events" DROP CONSTRAINT "FK_revenuecat_events_user"`,
    );

    // Drop revenuecat_events table
    await queryRunner.query(`DROP TABLE "revenuecat_events"`);

    // Drop RevenueCat columns from subscription table
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "revenuecatAutoRenew"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "revenuecatProductId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_subscription_revenuecat_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP COLUMN "revenuecatUserId"`,
    );

    // Note: Cannot remove enum value in PostgreSQL, would require recreating the enum
    // This is acceptable as the column values won't use REVENUECAT after rollback
  }
}

