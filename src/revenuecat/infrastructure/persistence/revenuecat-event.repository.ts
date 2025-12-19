import { NullableType } from '../../../utils/types/nullable.type';
import { RevenueCatEvent } from '../../domain/revenuecat-event';

export abstract class RevenueCatEventRepository {
  abstract create(
    data: Omit<RevenueCatEvent, 'id' | 'createdAt'>,
  ): Promise<RevenueCatEvent>;

  abstract findByTransactionId(
    transactionId: string,
  ): Promise<NullableType<RevenueCatEvent>>;

  abstract findByUserId(userId: string): Promise<RevenueCatEvent[]>;
}

