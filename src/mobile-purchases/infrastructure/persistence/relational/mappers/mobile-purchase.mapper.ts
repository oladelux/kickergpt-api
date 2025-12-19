import { MobilePurchase } from '../../../../domain/mobile-purchase';
import { MobilePurchaseEntity } from '../entities/mobile-purchase.entity';

export class MobilePurchaseMapper {
  static toDomain(entity: MobilePurchaseEntity): MobilePurchase {
    const domain = new MobilePurchase();
    domain.id = entity.id;
    domain.userId = entity.userId;
    domain.productId = entity.productId;
    domain.transactionId = entity.transactionId;
    domain.platform = entity.platform;
    domain.creditsGranted = entity.creditsGranted;
    domain.purchaseDate = entity.purchaseDate;
    domain.verifiedAt = entity.verifiedAt;
    domain.rawReceipt = entity.rawReceipt;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static toPersistence(domain: MobilePurchase): MobilePurchaseEntity {
    const entity = new MobilePurchaseEntity();
    if (domain.id) {
      entity.id = domain.id;
    }
    entity.userId = domain.userId;
    entity.productId = domain.productId;
    entity.transactionId = domain.transactionId;
    entity.platform = domain.platform;
    entity.creditsGranted = domain.creditsGranted;
    entity.purchaseDate = domain.purchaseDate;
    entity.verifiedAt = domain.verifiedAt;
    entity.rawReceipt = domain.rawReceipt;
    return entity;
  }
}

