import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStrategy1735400000000 implements MigrationInterface {
  name = 'CreateStrategy1735400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "strategy" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_strategy_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_strategy_user" ON "strategy" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "strategy" ADD CONSTRAINT "FK_strategy_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "strategy" DROP CONSTRAINT "FK_strategy_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_strategy_user"`);
    await queryRunner.query(`DROP TABLE "strategy"`);
  }
}

