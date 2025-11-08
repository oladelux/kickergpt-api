import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusEntity } from '../../../../statuses/infrastructure/persistence/relational/entities/status.entity';
import { StatusEnum } from '../../../../statuses/statuses.enum';

@Injectable()
export class StatusSeedService {
  constructor(
    @InjectRepository(StatusEntity)
    private repository: Repository<StatusEntity>,
  ) {}

  async run() {
    const active = await this.repository.findOne({
      where: {
        name: StatusEnum.active,
      },
    });

    if (!active) {
      await this.repository.save(
        this.repository.create({
          name: StatusEnum.active,
        }),
      );
    }

    const inactive = await this.repository.findOne({
      where: {
        name: StatusEnum.inactive,
      },
    });

    if (!inactive) {
      await this.repository.save(
        this.repository.create({
          name: StatusEnum.inactive,
        }),
      );
    }
  }
}
