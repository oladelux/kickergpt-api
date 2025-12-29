import { NullableType } from '../../../utils/types/nullable.type';
import { Strategy } from '../../domain/strategy';

export abstract class StrategyRepository {
  abstract create(
    data: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Strategy>;

  abstract findById(id: Strategy['id']): Promise<NullableType<Strategy>>;

  abstract findByIdAndUserId(
    id: Strategy['id'],
    userId: Strategy['userId'],
  ): Promise<NullableType<Strategy>>;

  abstract findByUserId(userId: Strategy['userId']): Promise<Strategy[]>;

  abstract findActiveByUserId(userId: Strategy['userId']): Promise<Strategy[]>;

  abstract update(
    id: Strategy['id'],
    payload: Partial<Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Strategy>;

  abstract delete(id: Strategy['id']): Promise<void>;

  abstract deleteByUserId(userId: Strategy['userId']): Promise<void>;
}

