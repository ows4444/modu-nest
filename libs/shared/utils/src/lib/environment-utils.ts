import { parseBoolean } from './parse-boolean';

/**
 * Environment variable utilities
 */

/**
 * Gets an environment variable as a number with a default value
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Gets an environment variable as a float with a default value
 */
export function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Gets an environment variable as a string with a default value
 */
export function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Gets an environment variable as a boolean with a default value
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;

  return parseBoolean(value);
}

/**
 * Gets an environment variable as an array (comma-separated) with a default value
 */
export function getEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Gets a required environment variable, throwing an error if not found
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Gets a required environment variable as a number, throwing an error if not found or invalid
 */
export function getRequiredEnvNumber(key: string): number {
  const value = getRequiredEnv(key);
  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }

  return parsed;
}

/**
 * Checks if we're running in a specific environment
 */
export function isEnvironment(env: 'development' | 'production' | 'test'): boolean {
  return process.env.NODE_ENV === env;
}

/**
 * Checks if we're running in development mode
 */
export function isDevelopment(): boolean {
  return isEnvironment('development');
}

/**
 * Checks if we're running in production mode
 */
export function isProduction(): boolean {
  return isEnvironment('production');
}

/**
 * Checks if we're running in test mode
 */
export function isTest(): boolean {
  return isEnvironment('test');
}

/**
 * Gets all environment variables with a specific prefix
 */
export function getEnvWithPrefix(prefix: string): Record<string, string> {
  const result: Record<string, string> = {};

  Object.keys(process.env).forEach((key) => {
    if (key.startsWith(prefix)) {
      const value = process.env[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  });

  return result;
}
