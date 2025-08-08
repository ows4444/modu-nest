/**
 * String manipulation and validation utilities
 */

/**
 * Sanitizes a plugin name to contain only safe characters
 */
export function sanitizePluginName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

/**
 * Validates if a plugin name follows the expected format
 */
export function isValidPluginName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name) && name.length >= 2 && name.length <= 50;
}

/**
 * Normalizes a string by trimming and converting to lowercase
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Creates a search predicate function for case-insensitive text matching
 */
export function createSearchPredicate(query: string): (text: string) => boolean {
  const lowercaseQuery = query.toLowerCase();
  return (text: string) => text.toLowerCase().includes(lowercaseQuery);
}

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Truncates a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  return str.length <= maxLength ? str : `${str.substring(0, maxLength)}...`;
}

/**
 * Escapes special characters in a string for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes extra whitespace and normalizes line endings
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}