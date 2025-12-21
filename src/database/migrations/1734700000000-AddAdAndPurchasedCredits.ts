import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAdAndPurchasedCredits1734700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add ad credits tracking columns to prompt_usage table
    await queryRunner.addColumns('prompt_usage', [
      new TableColumn({
        name: 'adCredits',
        type: 'integer',
        default: 0,
      }),
      new TableColumn({
        name: 'purchasedCredits',
        type: 'integer',
        default: 0,
      }),
      new TableColumn({
        name: 'lastAdWatchedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'adsWatchedToday',
        type: 'integer',
        default: 0,
      }),
      new TableColumn({
        name: 'adsWatchDate',
        type: 'date',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns from prompt_usage table
    await queryRunner.dropColumn('prompt_usage', 'adCredits');
    await queryRunner.dropColumn('prompt_usage', 'purchasedCredits');
    await queryRunner.dropColumn('prompt_usage', 'lastAdWatchedAt');
    await queryRunner.dropColumn('prompt_usage', 'adsWatchedToday');
    await queryRunner.dropColumn('prompt_usage', 'adsWatchDate');
  }
}
