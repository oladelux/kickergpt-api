import { User } from '../../../users/domain/user';
import { NullableType } from '../../../utils/types/nullable.type';
import { PaymentProvider } from '../../domain/payment-provider.enum';
import { Subscription } from '../../domain/subscription';
import { SubscriptionPlan } from '../../domain/subscription-plan.enum';
import { SubscriptionStatus } from '../../domain/subscription-status.enum';

export abstract class SubscriptionRepository {
  abstract create(
    data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<Subscription>;

  abstract update(
    id: Subscription['id'],
    payload: Partial<
      Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Subscription>;

  abstract findByUserId(
    userId: User['id'],
  ): Promise<NullableType<Subscription>>;

  abstract findByStripeCustomerId(
    stripeCustomerId: Subscription['stripeCustomerId'],
  ): Promise<NullableType<Subscription>>;

  abstract findByStripeSubscriptionId(
    stripeSubscriptionId: Subscription['stripeSubscriptionId'],
  ): Promise<NullableType<Subscription>>;

  abstract findByPaystackCustomerCode(
    paystackCustomerCode: Subscription['paystackCustomerCode'],
  ): Promise<NullableType<Subscription>>;

  abstract findByPaystackSubscriptionCode(
    paystackSubscriptionCode: Subscription['paystackSubscriptionCode'],
  ): Promise<NullableType<Subscription>>;

  abstract updatePlanAndStatus(
    id: Subscription['id'],
    data: {
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      stripeSubscriptionId: Subscription['stripeSubscriptionId'] | null;
      paystackSubscriptionCode: Subscription['paystackSubscriptionCode'] | null;
      paystackCustomerCode: Subscription['paystackCustomerCode'] | null;
      stripeCustomerId: Subscription['stripeCustomerId'] | null;
      paymentProvider: PaymentProvider;
      currentPeriodEnd: Subscription['currentPeriodEnd'];
    },
  ): Promise<Subscription>;
}
