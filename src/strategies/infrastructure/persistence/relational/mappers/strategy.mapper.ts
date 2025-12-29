import { Strategy } from '../../../../domain/strategy';
import { StrategyEntity } from '../entities/strategy.entity';

export class StrategyMapper {
  static toDomain(entity: StrategyEntity): Strategy {
    const domain = new Strategy();
    domain.id = entity.id;
    domain.userId = entity.userId;
    domain.name = entity.name;
    domain.description = entity.description ?? undefined;
    domain.conditions = entity.conditions ?? [];
    domain.isActive = entity.isActive;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static toPersistence(domain: Strategy): StrategyEntity {
    const entity = new StrategyEntity();
    if (domain.id) {
      entity.id = domain.id;
    }
    entity.userId = domain.userId;
    entity.name = domain.name;
    entity.description = domain.description ?? null;
    entity.conditions = domain.conditions ?? [];
    entity.isActive = domain.isActive;
    return entity;
  }
}

