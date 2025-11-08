import {
  // common
  Module,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersController } from './users.controller';

import { UsersService } from './users.service';
import { RelationalUserPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { FilesModule } from '../files/files.module';
import { RoleEntity } from '../roles/infrastructure/persistence/relational/entities/role.entity';
import { StatusEntity } from '../statuses/infrastructure/persistence/relational/entities/status.entity';

const infrastructurePersistenceModule = RelationalUserPersistenceModule;

@Module({
  imports: [
    // import modules, etc.
    infrastructurePersistenceModule,
    FilesModule,
    TypeOrmModule.forFeature([RoleEntity, StatusEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, infrastructurePersistenceModule],
})
export class UsersModule {}
