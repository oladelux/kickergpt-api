import { RevenueCatEvent } from '../../../../domain/revenuecat-event';
import { RevenueCatEventEntity } from '../entities/revenuecat-event.entity';

export class RevenueCatEventMapper {
  static toDomain(raw: RevenueCatEventEntity): RevenueCatEvent {
    const domain = new RevenueCatEvent();
    domain.id = raw.id;
    domain.eventType = raw.eventType;
    domain.userId = raw.userId;
    domain.transactionId = raw.transactionId;
    domain.productId = raw.productId;
    domain.entitlementIds = raw.entitlementIds;
    domain.expirationAt = raw.expirationAt;
    domain.store = raw.store;
    domain.rawData = raw.rawData;
    domain.processedAt = raw.processedAt;
    domain.createdAt = raw.createdAt;
    return domain;
  }

  static toPersistence(domain: RevenueCatEvent): RevenueCatEventEntity {
    const persistence = new RevenueCatEventEntity();
    if (domain.id) {
      persistence.id = domain.id;
    }
    persistence.eventType = domain.eventType;
    persistence.userId = domain.userId;
    persistence.transactionId = domain.transactionId;
    persistence.productId = domain.productId;
    persistence.entitlementIds = domain.entitlementIds;
    persistence.expirationAt = domain.expirationAt;
    persistence.store = domain.store;
    persistence.rawData = domain.rawData;
    persistence.processedAt = domain.processedAt;
    return persistence;
  }
}

