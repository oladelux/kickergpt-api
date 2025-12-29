import { StrategyConditionType } from './strategy-condition-type.enum';
import { StrategyOperator } from './strategy-operator.enum';
import { StrategyTarget } from './strategy-target.enum';

export interface StrategyCondition {
  id: string;
  type: StrategyConditionType;
  operator: StrategyOperator;
  value: number;
  target: StrategyTarget;
  /** Number of recent matches to consider for this condition (default: 5) */
  lastMatches?: number;
}
