import { registerAs } from '@nestjs/config';
import { EnvironmentType } from '@libs/shared-const';
import { parseBoolean } from '@libs/shared-utils';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import path from 'path';
import { EnvironmentSchema } from './env.schema';
import { Environment, ENVIRONMENT_ENV } from './env.types';
import { configCache } from '../config-cache.service';

/**
 * Optimized environment file sorting with memoization
 */
export function sortEnvFiles(files: string[]): string[] {
  const cacheKey = `sort:${files.join(',')}`;

  return configCache.getSync(cacheKey, () => {
    return files.sort((a, b) => {
      const aSegments = a.split(path.sep).length;
      const bSegments = b.split(path.sep).length;
      if (aSegments !== bSegments) {
        return bSegments - aSegments;
      }
      return b.length - a.length;
    });
  });
}

/**
 * Optimized environment file resolution with caching
 */
export function getEnvFile(envFilePath: string | string[] | undefined): string[] {
  const nodeEnv = process.env.NODE_ENV ?? EnvironmentType.Development;
  const cacheKey = `envFile:${nodeEnv}:${JSON.stringify(envFilePath)}`;

  return configCache.getSync(cacheKey, () => {
    const envFiles = new Map<EnvironmentType, string>([
      [EnvironmentType.Development, '.env.development'],
      [EnvironmentType.Production, '.env.production'],
    ]);

    const envFileNames = [envFiles.get(nodeEnv as EnvironmentType), '.env'].filter(
      (envFile): envFile is string => envFile !== undefined
    );

    const envFilePathStr = Array.isArray(envFilePath) ? envFilePath[0] : envFilePath;

    return sortEnvFiles(
      envFilePathStr
        ? [
            ...envFileNames.map((name) =>
              path.join(
                'apps',
                envFilePathStr.split(path.sep)[envFilePathStr.split(path.sep).indexOf('apps') + 1],
                name
              )
            ),
            ...envFileNames,
          ]
        : envFileNames
    );
  });
}

/**
 * Cached environment variable parser
 */
function parseEnvironmentVariables(): EnvironmentSchema {
  const cacheKey = `envParsing:${JSON.stringify(process.env)}`;

  return configCache.getSync(
    cacheKey,
    () => {
      const config = plainToInstance(EnvironmentSchema, process.env, {
        enableImplicitConversion: true,
        excludeExtraneousValues: true,
      });

      const errors = validateSync(config, {
        skipMissingProperties: false,
        forbidUnknownValues: true,
        whitelist: true,
      });

      if (errors.length > 0) {
        const errorMessages = errors
          .flatMap((error) => Object.values(error.constraints ?? { [error.property]: 'Invalid value' }))
          .join('\n- ');

        throw new Error(`Environment validation failed:\n- ${errorMessages}`);
      }

      return config;
    },
    10 * 60 * 1000
  ); // Cache for 10 minutes since env vars don't change often
}

/**
 * Optimized environment configuration loader with comprehensive caching
 */
export const optimizedEnvLoader = registerAs(ENVIRONMENT_ENV, (): Environment => {
  const envCacheKey = `env:${process.env.NODE_ENV}:${process.env.HOST}:${process.env.PORT}`;

  return configCache.getSync(
    envCacheKey,
    () => {
      const config = parseEnvironmentVariables();

      return {
        url: `${config.HOST}:${config.PORT}`,
        host: config.HOST,
        appName: config.APP_NAME,
        apiPrefix: config.API_PREFIX,
        environment: config.NODE_ENV,
        isProduction: config.NODE_ENV === EnvironmentType.Production,
        port: config.PORT,
        enableSwagger: parseBoolean(config.ENABLE_SWAGGER),
        awsRegion: config.AWS_REGION,
        corsOrigins: config.CORS_ORIGINS,
      };
    },
    15 * 60 * 1000
  ); // Cache for 15 minutes
});

/**
 * Lazy-loaded environment configuration
 */
let cachedEnvironment: Environment | null = null;

export function getEnvironmentConfig(): Environment {
  if (!cachedEnvironment) {
    cachedEnvironment = optimizedEnvLoader();
  }
  return cachedEnvironment;
}

/**
 * Reset cached environment (useful for testing)
 */
export function resetEnvironmentCache(): void {
  cachedEnvironment = null;
  configCache.clear();
}
