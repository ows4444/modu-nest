import * as semver from 'semver';

/**
 * Type checking and validation utilities
 */

/**
 * Type guard to check if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is an object (not null or array)
 */
export function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Type guard to check if a value is a valid date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Validates if a string is a valid semantic version
 */
export function isValidSemver(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Validates if a string is a valid email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid hex color
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

/**
 * Validates if a value is within a numeric range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validates if a string matches a pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

/**
 * Validates if an array contains only unique values
 */
export function hasUniqueValues<T>(array: T[]): boolean {
  return new Set(array).size === array.length;
}

/**
 * Validates if all items in array pass a predicate
 */
export function allPass<T>(array: T[], predicate: (item: T) => boolean): boolean {
  return array.every(predicate);
}

/**
 * Validates if any items in array pass a predicate
 */
export function anyPass<T>(array: T[], predicate: (item: T) => boolean): boolean {
  return array.some(predicate);
}

// Plugin-specific validation functions (consolidated from multiple locations)

/**
 * Validates if a string is a valid plugin name
 * Plugin names must be lowercase alphanumeric with hyphens/underscores
 * and between 2-50 characters long
 */
export function isValidPluginName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name) && name.length >= 2 && name.length <= 50;
}

/**
 * Validates if a string is a valid plugin version (semantic version)
 * Supports formats like 1.0.0, 1.0.0-beta, 1.0.0-alpha.1
 */
export function isValidPluginVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(value);
}

/**
 * Validates if a string is a valid checksum (hexadecimal)
 * Minimum 32 characters (for MD5), supports longer for SHA256/SHA512
 */
export function isValidChecksum(value: string): boolean {
  return /^[a-fA-F0-9]+$/.test(value) && value.length >= 32;
}

/**
 * Validates if a string is a valid service token
 * Service tokens should be uppercase with underscores
 */
export function isValidServiceToken(token: string): boolean {
  return /^[A-Z][A-Z0-9_]*[A-Z0-9]$/.test(token) && token.length >= 3 && token.length <= 100;
}

/**
 * Validates if a string is a valid plugin file path
 * Checks for allowed file extensions and directory structures
 */
export function isValidPluginFile(filename: string): boolean {
  const allowedExtensions = ['.js', '.json', '.md', '.txt', '.ts', '.d.ts'];
  const allowedDirs = ['dist/', 'src/', 'lib/', 'assets/', 'docs/'];
  
  // Check if file has valid extension
  const hasValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
  
  // Check if file is in allowed directory or at root level
  const isInAllowedDir = allowedDirs.some(dir => filename.startsWith(dir)) || !filename.includes('/');
  
  // Reject potentially dangerous files
  const isDangerous = filename.includes('..') || filename.startsWith('/') || filename.includes('node_modules');
  
  return hasValidExtension && isInAllowedDir && !isDangerous;
}
