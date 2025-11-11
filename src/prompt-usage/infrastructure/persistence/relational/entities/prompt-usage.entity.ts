import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';

@Entity({ name: 'prompt_usage' })
export class PromptUsageEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_prompt_usage_user')
  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'integer', default: 0 })
  promptsUsed: number;

  @Column({ type: 'integer', default: 0 })
  addonCredits: number;

  @Column({ type: 'date' })
  periodStart: Date;

  @OneToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
