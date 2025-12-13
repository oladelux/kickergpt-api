import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountryCodeToUser1734134000000 implements MigrationInterface {
  name = 'AddCountryCodeToUser1734134000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add countryCode column to user table (nullable to support existing users)
    await queryRunner.query(
      `ALTER TABLE "user" ADD "countryCode" character varying`,
    );

    // Add index on countryCode for query performance
    await queryRunner.query(
      `CREATE INDEX "IDX_user_country_code" ON "user" ("countryCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index on countryCode
    await queryRunner.query(`DROP INDEX "public"."IDX_user_country_code"`);

    // Drop countryCode column
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "countryCode"`);
  }
}
