import { Module, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginEntity, PluginDownloadEntity, PluginVersionEntity, PluginTrustLevelEntity } from '../entities';
import { TypeORMPostgreSQLRepository, InMemoryRepository } from '../repositories';
import { PLUGIN_REPOSITORY_TOKEN } from '../services/plugin-storage.service';

type DatabaseType = 'postgres' | 'memory';

@Module({})
export class RepositoryModule {
  static forRoot(config?: {
    type?: DatabaseType;
    database?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    synchronize?: boolean;
  }): DynamicModule {
    const dbType: DatabaseType = config?.type || (process.env.DATABASE_TYPE as DatabaseType) || 'postgres';

    if (dbType === 'memory') {
      return {
        module: RepositoryModule,
        providers: [
          {
            provide: PLUGIN_REPOSITORY_TOKEN,
            useClass: InMemoryRepository,
          },
        ],
        exports: [PLUGIN_REPOSITORY_TOKEN],
        global: true,
      };
    }

    // TypeORM configuration for PostgreSQL
    const typeOrmConfig = {
      type: 'postgres' as const,
      host: config?.host || process.env.DATABASE_HOST || 'localhost',
      port: config?.port || parseInt(process.env.DATABASE_PORT || '5432'),
      username: config?.username || process.env.DATABASE_USERNAME || 'postgres',
      password: config?.password || process.env.DATABASE_PASSWORD || '',
      database: config?.database || process.env.DATABASE_NAME || 'plugin_registry',
      entities: [PluginEntity, PluginDownloadEntity, PluginVersionEntity, PluginTrustLevelEntity],
      synchronize: config?.synchronize ?? process.env.NODE_ENV === 'development',
      logging: process.env.DATABASE_LOGGING === 'true',
      ssl: process.env.DATABASE_SSL === 'true',
    };

    return {
      module: RepositoryModule,
      imports: [
        TypeOrmModule.forRoot(typeOrmConfig),
        TypeOrmModule.forFeature([PluginEntity, PluginDownloadEntity, PluginVersionEntity, PluginTrustLevelEntity]),
      ],
      providers: [
        TypeORMPostgreSQLRepository,
        {
          provide: PLUGIN_REPOSITORY_TOKEN,
          useClass: TypeORMPostgreSQLRepository,
        },
      ],
      exports: [PLUGIN_REPOSITORY_TOKEN],
      global: true,
    };
  }

  static forTesting(): DynamicModule {
    return {
      module: RepositoryModule,
      providers: [
        {
          provide: PLUGIN_REPOSITORY_TOKEN,
          useClass: InMemoryRepository,
        },
      ],
      exports: [PLUGIN_REPOSITORY_TOKEN],
      global: true,
    };
  }

  static forPostgreSQL(
    config: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: string;
    } = {}
  ): DynamicModule {
    return this.forRoot({
      type: 'postgres',
      ...config,
    });
  }
}
