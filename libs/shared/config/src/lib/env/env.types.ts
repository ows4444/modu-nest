import { EnvironmentType } from '@libs/shared-core';

export const ENVIRONMENT_ENV = 'ENVIRONMENT_ENV';
export interface Environment {
  environment: EnvironmentType;
  isProduction: boolean;
  port: number;
  appName: string;

  awsRegion: string;
  host: string;
  url: string;
  enableSwagger: boolean;
  apiPrefix?: string;
  corsOrigins?: string[];
}
