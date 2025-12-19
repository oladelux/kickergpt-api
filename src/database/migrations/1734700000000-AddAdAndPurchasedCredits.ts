import { MigrationInterface, QueryRunner, TableColumn, Table } from 'typeorm';

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

    // Create mobile_purchases table for audit trail
    await queryRunner.createTable(
      new Table({
        name: 'mobile_purchases',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'productId',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'transactionId',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'platform',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'creditsGranted',
            type: 'integer',
          },
          {
            name: 'purchaseDate',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'verifiedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'rawReceipt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        indices: [
          {
            name: 'IDX_mobile_purchases_user',
            columnNames: ['userId'],
          },
          {
            name: 'IDX_mobile_purchases_transaction',
            columnNames: ['transactionId'],
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop mobile_purchases table
    await queryRunner.dropTable('mobile_purchases', true);

    // Remove columns from prompt_usage table
    await queryRunner.dropColumn('prompt_usage', 'adCredits');
    await queryRunner.dropColumn('prompt_usage', 'purchasedCredits');
    await queryRunner.dropColumn('prompt_usage', 'lastAdWatchedAt');
    await queryRunner.dropColumn('prompt_usage', 'adsWatchedToday');
    await queryRunner.dropColumn('prompt_usage', 'adsWatchDate');
  }
}

