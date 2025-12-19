import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { RevenueCatEventType } from '../../../../domain/revenuecat-event-type.enum';

@Entity({ name: 'revenuecat_events' })
export class RevenueCatEventEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  eventType: RevenueCatEventType;

  @Index('IDX_revenuecat_events_user')
  @Column({ type: 'uuid' })
  userId: string;

  @Index('IDX_revenuecat_events_transaction')
  @Column({ type: 'varchar', unique: true })
  transactionId: string;

  @Column({ type: 'varchar', nullable: true })
  productId: string | null;

  @Column({ type: 'text', array: true, nullable: true })
  entitlementIds: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  expirationAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  store: string | null;

  @Column({ type: 'jsonb' })
  rawData: Record<string, any>;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  processedAt: Date;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Index('IDX_revenuecat_events_created')
  @CreateDateColumn()
  createdAt: Date;
}

