import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { UserMapper } from '../../../../../users/infrastructure/persistence/relational/mappers/user.mapper';
import { Subscription } from '../../../../domain/subscription';
import { SubscriptionEntity } from '../entities/subscription.entity';

export class SubscriptionMapper {
  static toDomain(raw: SubscriptionEntity): Subscription {
    const domain = new Subscription();
    domain.id = raw.id;
    domain.plan = raw.plan;
    domain.status = raw.status;
    domain.stripeCustomerId = raw.stripeCustomerId;
    domain.stripeSubscriptionId = raw.stripeSubscriptionId;
    domain.currentPeriodEnd = raw.currentPeriodEnd;
    domain.paymentProvider = raw.paymentProvider;
    domain.paystackCustomerCode = raw.paystackCustomerCode;
    domain.paystackSubscriptionCode = raw.paystackSubscriptionCode;
    domain.revenuecatUserId = raw.revenuecatUserId;
    domain.revenuecatProductId = raw.revenuecatProductId;
    domain.revenuecatAutoRenew = raw.revenuecatAutoRenew;
    if (raw.user) {
      domain.user = UserMapper.toDomain(raw.user);
      domain.userId = raw.user.id;
    } else {
      domain.userId = raw.userId;
    }
    domain.createdAt = raw.createdAt;
    domain.updatedAt = raw.updatedAt;
    domain.deletedAt = raw.deletedAt;
    return domain;
  }

  static toPersistence(domain: Subscription): SubscriptionEntity {
    const persistence = new SubscriptionEntity();
    if (domain.id) {
      persistence.id = String(domain.id);
    }
    persistence.plan = domain.plan;
    persistence.status = domain.status;
    persistence.stripeCustomerId = domain.stripeCustomerId;
    persistence.stripeSubscriptionId = domain.stripeSubscriptionId ?? null;
    persistence.currentPeriodEnd = domain.currentPeriodEnd ?? null;
    persistence.paymentProvider = domain.paymentProvider;
    persistence.paystackCustomerCode = domain.paystackCustomerCode;
    persistence.paystackSubscriptionCode = domain.paystackSubscriptionCode;
    persistence.revenuecatUserId = domain.revenuecatUserId;
    persistence.revenuecatProductId = domain.revenuecatProductId;
    persistence.revenuecatAutoRenew = domain.revenuecatAutoRenew;
    const user = new UserEntity();
    user.id = String(domain.user?.id ?? domain.userId);
    persistence.user = user;
    persistence.userId = user.id;

    return persistence;
  }
}
