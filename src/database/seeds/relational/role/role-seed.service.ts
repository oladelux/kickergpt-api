import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../../roles/infrastructure/persistence/relational/entities/role.entity';
import { RoleEnum } from '../../../../roles/roles.enum';

@Injectable()
export class RoleSeedService {
  constructor(
    @InjectRepository(RoleEntity)
    private repository: Repository<RoleEntity>,
  ) {}

  async run() {
    const userRole = await this.repository.findOne({
      where: {
        name: RoleEnum.user,
      },
    });

    if (!userRole) {
      await this.repository.save(
        this.repository.create({
          name: RoleEnum.user,
        }),
      );
    }

    const adminRole = await this.repository.findOne({
      where: {
        name: RoleEnum.admin,
      },
    });

    if (!adminRole) {
      await this.repository.save(
        this.repository.create({
          name: RoleEnum.admin,
        }),
      );
    }
  }
}
