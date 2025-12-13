import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionPlan } from '../../../../domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../../../domain/subscription-status.enum';
import { PaymentProvider } from '../../../../domain/payment-provider.enum';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';

@Entity({
  name: 'subscription',
})
export class SubscriptionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.STRIPE,
  })
  paymentProvider: PaymentProvider;

  @Index('IDX_subscription_stripe_customer')
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeCustomerId: string | null;

  @Index('IDX_subscription_stripe_subscription')
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  @Index('IDX_subscription_paystack_customer')
  @Column({ type: 'varchar', nullable: true, unique: true })
  paystackCustomerCode: string | null;

  @Index('IDX_subscription_paystack_subscription')
  @Column({ type: 'varchar', nullable: true, unique: true })
  paystackSubscriptionCode: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @OneToOne(() => UserEntity, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
