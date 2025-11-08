import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { UserEntity } from '../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { RoleEnum } from '../../../../roles/roles.enum';
import { StatusEnum } from '../../../../statuses/statuses.enum';
import { RoleEntity } from '../../../../roles/infrastructure/persistence/relational/entities/role.entity';
import { StatusEntity } from '../../../../statuses/infrastructure/persistence/relational/entities/status.entity';

@Injectable()
export class UserSeedService {
  constructor(
    @InjectRepository(UserEntity)
    private repository: Repository<UserEntity>,
  ) {}

  async run() {
    const roleRepository = this.repository.manager.getRepository(RoleEntity);
    const statusRepository =
      this.repository.manager.getRepository(StatusEntity);

    const adminRole =
      (await roleRepository.findOne({
        where: { name: RoleEnum.admin },
      })) ??
      (await roleRepository.save(
        roleRepository.create({ name: RoleEnum.admin }),
      ));
    const userRole =
      (await roleRepository.findOne({
        where: { name: RoleEnum.user },
      })) ??
      (await roleRepository.save(
        roleRepository.create({ name: RoleEnum.user }),
      ));
    const activeStatus =
      (await statusRepository.findOne({
        where: { name: StatusEnum.active },
      })) ??
      (await statusRepository.save(
        statusRepository.create({ name: StatusEnum.active }),
      ));

    const countAdmin = await this.repository.count({
      where: {
        role: {
          id: adminRole?.id,
        },
      },
    });

    if (!countAdmin) {
      const salt = await bcrypt.genSalt();
      const password = await bcrypt.hash('secret', salt);

      await this.repository.save(
        this.repository.create({
          firstName: 'Super',
          lastName: 'Admin',
          email: 'admin@example.com',
          password,
          role: {
            id: adminRole.id,
            name: RoleEnum.admin,
          },
          status: {
            id: activeStatus.id,
            name: StatusEnum.active,
          },
        }),
      );
    }

    const countUser = await this.repository.count({
      where: {
        role: {
          id: userRole?.id,
        },
      },
    });

    if (!countUser) {
      const salt = await bcrypt.genSalt();
      const password = await bcrypt.hash('secret', salt);

      await this.repository.save(
        this.repository.create({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password,
          role: {
            id: userRole.id,
            name: RoleEnum.user,
          },
          status: {
            id: activeStatus.id,
            name: StatusEnum.active,
          },
        }),
      );
    }
  }
}
