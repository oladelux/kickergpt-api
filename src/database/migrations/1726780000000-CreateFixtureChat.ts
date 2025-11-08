import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFixtureChat1726780000000 implements MigrationInterface {
  name = 'CreateFixtureChat1726780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "fixture_chat" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fixtureId" integer NOT NULL, "message" text NOT NULL, "tone" character varying(50), "summary" text NOT NULL, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, CONSTRAINT "PK_0bce4e8372c65ea569dc866282d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a18476d849a9bfb364ab5394e9" ON "fixture_chat" ("fixtureId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb5c44f2b366592c766d968f0d" ON "fixture_chat" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fixture_chat" ADD CONSTRAINT "FK_fb5c44f2b366592c766d968f0d6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fixture_chat" DROP CONSTRAINT "FK_fb5c44f2b366592c766d968f0d6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fb5c44f2b366592c766d968f0d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a18476d849a9bfb364ab5394e9"`,
    );
    await queryRunner.query(`DROP TABLE "fixture_chat"`);
  }
}
