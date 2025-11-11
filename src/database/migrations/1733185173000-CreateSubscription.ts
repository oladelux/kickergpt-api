import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscription1733185173000 implements MigrationInterface {
  name = 'CreateSubscription1733185173000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."subscription_plan_enum" AS ENUM('FREE', 'PRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."subscription_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "subscription" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plan" "public"."subscription_plan_enum" NOT NULL DEFAULT 'FREE', "status" "public"."subscription_status_enum" NOT NULL DEFAULT 'ACTIVE', "stripeCustomerId" character varying NOT NULL, "stripeSubscriptionId" character varying, "currentPeriodEnd" TIMESTAMP WITH TIME ZONE, "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_8a48d3e1cc0f4a5c1b4e5273315" PRIMARY KEY ("id"), CONSTRAINT "UQ_subscription_stripe_customer" UNIQUE ("stripeCustomerId"), CONSTRAINT "UQ_subscription_stripe_subscription" UNIQUE ("stripeSubscriptionId"), CONSTRAINT "UQ_subscription_user" UNIQUE ("userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_stripe_customer" ON "subscription" ("stripeCustomerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_stripe_subscription" ON "subscription" ("stripeSubscriptionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription" ADD CONSTRAINT "FK_subscription_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription" DROP CONSTRAINT "FK_subscription_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_subscription_stripe_subscription"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_subscription_stripe_customer"`,
    );
    await queryRunner.query(`DROP TABLE "subscription"`);
    await queryRunner.query(`DROP TYPE "public"."subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."subscription_plan_enum"`);
  }
}
