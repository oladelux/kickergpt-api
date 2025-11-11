import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromptUsage1733189000000 implements MigrationInterface {
  name = 'CreatePromptUsage1733189000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "prompt_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "promptsUsed" integer NOT NULL DEFAULT 0, "addonCredits" integer NOT NULL DEFAULT 0, "periodStart" date NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d25cabf2a0ff3a1b8b3f9c4ce5c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "prompt_usage" ADD CONSTRAINT "UQ_prompt_usage_user" UNIQUE ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_prompt_usage_user" ON "prompt_usage" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "prompt_usage" ADD CONSTRAINT "FK_prompt_usage_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prompt_usage" DROP CONSTRAINT "FK_prompt_usage_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_prompt_usage_user"`);
    await queryRunner.query(
      `ALTER TABLE "prompt_usage" DROP CONSTRAINT "UQ_prompt_usage_user"`,
    );
    await queryRunner.query(`DROP TABLE "prompt_usage"`);
  }
}
