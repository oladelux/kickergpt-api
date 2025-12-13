import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { NullableType } from '../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from './dto/query-user.dto';
import { UserRepository } from './infrastructure/persistence/user.repository';
import { User } from './domain/user';
import bcrypt from 'bcryptjs';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { FilesService } from '../files/files.service';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { FileType } from '../files/domain/file';
import { Role } from '../roles/domain/role';
import { Status } from '../statuses/domain/status';
import { UpdateUserDto } from './dto/update-user.dto';
import { RoleEnum } from '../roles/roles.enum';
import { StatusEnum } from '../statuses/statuses.enum';
import { Repository } from 'typeorm';
import { RoleEntity } from '../roles/infrastructure/persistence/relational/entities/role.entity';
import { StatusEntity } from '../statuses/infrastructure/persistence/relational/entities/status.entity';

type RoleInput = {
  id?: Role['id'] | null;
  name?: RoleEnum | string | null;
};

type StatusInput = {
  id?: Status['id'] | null;
  name?: StatusEnum | string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UserRepository,
    private readonly filesService: FilesService,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusesRepository: Repository<StatusEntity>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Do not remove comment below.
    // <creating-property />

    let password: string | undefined = undefined;

    if (createUserDto.password) {
      const salt = await bcrypt.genSalt();
      password = await bcrypt.hash(createUserDto.password, salt);
    }

    let email: string | null = null;

    if (createUserDto.email) {
      const userObject = await this.usersRepository.findByEmail(
        createUserDto.email,
      );
      if (userObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }
      email = createUserDto.email;
    }

    let photo: FileType | null | undefined = undefined;

    if (createUserDto.photo?.id) {
      const fileObject = await this.filesService.findById(
        createUserDto.photo.id,
      );
      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }
      photo = fileObject;
    } else if (createUserDto.photo === null) {
      photo = null;
    }

    const role = await this.resolveRoleInput(createUserDto.role);
    const status = await this.resolveStatusInput(createUserDto.status);

    return this.usersRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      email: email,
      password: password,
      photo: photo,
      role: role,
      status: status,
      provider: createUserDto.provider ?? AuthProvidersEnum.email,
      socialId: createUserDto.socialId,
      countryCode: createUserDto.countryCode ?? null,
    });
  }

  findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterUserDto | null;
    sortOptions?: SortUserDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<User[]> {
    return this.usersRepository.findManyWithPagination({
      filterOptions,
      sortOptions,
      paginationOptions,
    });
  }

  findById(id: User['id']): Promise<NullableType<User>> {
    return this.usersRepository.findById(id);
  }

  findByIds(ids: User['id'][]): Promise<User[]> {
    return this.usersRepository.findByIds(ids);
  }

  findByEmail(email: User['email']): Promise<NullableType<User>> {
    return this.usersRepository.findByEmail(email);
  }

  findBySocialIdAndProvider({
    socialId,
    provider,
  }: {
    socialId: User['socialId'];
    provider: User['provider'];
  }): Promise<NullableType<User>> {
    return this.usersRepository.findBySocialIdAndProvider({
      socialId,
      provider,
    });
  }

  async update(
    id: User['id'],
    updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    // Do not remove comment below.
    // <updating-property />

    let password: string | undefined = undefined;

    if (updateUserDto.password) {
      const userObject = await this.usersRepository.findById(id);

      if (userObject && userObject?.password !== updateUserDto.password) {
        const salt = await bcrypt.genSalt();
        password = await bcrypt.hash(updateUserDto.password, salt);
      }
    }

    let email: string | null | undefined = undefined;

    if (updateUserDto.email) {
      const userObject = await this.usersRepository.findByEmail(
        updateUserDto.email,
      );

      if (userObject && userObject.id !== id) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }

      email = updateUserDto.email;
    } else if (updateUserDto.email === null) {
      email = null;
    }

    let photo: FileType | null | undefined = undefined;

    if (updateUserDto.photo?.id) {
      const fileObject = await this.filesService.findById(
        updateUserDto.photo.id,
      );
      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }
      photo = fileObject;
    } else if (updateUserDto.photo === null) {
      photo = null;
    }

    const role = await this.resolveRoleInput(updateUserDto.role);
    const status = await this.resolveStatusInput(updateUserDto.status);

    return this.usersRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      firstName: updateUserDto.firstName,
      lastName: updateUserDto.lastName,
      email,
      countryCode: updateUserDto.countryCode ?? null,
      password,
      photo,
      role,
      status,
      provider: updateUserDto.provider,
      socialId: updateUserDto.socialId,
    });
  }

  async remove(id: User['id']): Promise<void> {
    await this.usersRepository.remove(id);
  }

  private async resolveRoleInput(
    roleInput?: RoleInput | null,
  ): Promise<Role | undefined> {
    if (roleInput === null) {
      return undefined;
    }

    if (!roleInput?.id && !roleInput?.name) {
      return undefined;
    }

    if (roleInput?.id) {
      const existing = await this.rolesRepository.findOne({
        where: { id: String(roleInput.id) },
      });

      if (existing) {
        return { id: existing.id, name: existing.name };
      }

      if (!roleInput?.name) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            role: 'roleNotExists',
          },
        });
      }
    }

    if (roleInput?.name) {
      let role = await this.rolesRepository.findOne({
        where: { name: roleInput.name },
      });

      if (!role) {
        const isAllowed = Object.values(RoleEnum)
          .map(String)
          .includes(String(roleInput.name));

        if (!isAllowed) {
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              role: 'roleNotExists',
            },
          });
        }

        role = await this.rolesRepository.save(
          this.rolesRepository.create({
            name: roleInput.name,
          }),
        );
      }

      return { id: role.id, name: role.name };
    }

    return undefined;
  }

  private async resolveStatusInput(
    statusInput?: StatusInput | null,
  ): Promise<Status | undefined> {
    if (statusInput === null) {
      return undefined;
    }

    if (!statusInput?.id && !statusInput?.name) {
      return undefined;
    }

    if (statusInput?.id) {
      const existing = await this.statusesRepository.findOne({
        where: { id: String(statusInput.id) },
      });

      if (existing) {
        return { id: existing.id, name: existing.name };
      }

      if (!statusInput?.name) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            status: 'statusNotExists',
          },
        });
      }
    }

    if (statusInput?.name) {
      let status = await this.statusesRepository.findOne({
        where: { name: statusInput.name },
      });

      if (!status) {
        const isAllowed = Object.values(StatusEnum)
          .map(String)
          .includes(String(statusInput.name));

        if (!isAllowed) {
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              status: 'statusNotExists',
            },
          });
        }

        status = await this.statusesRepository.save(
          this.statusesRepository.create({
            name: statusInput.name,
          }),
        );
      }

      return { id: status.id, name: status.name };
    }

    return undefined;
  }
}
