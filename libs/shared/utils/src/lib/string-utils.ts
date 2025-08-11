/**
 * String manipulation and validation utilities
 *
 * This module provides comprehensive utilities for string manipulation,
 * validation, and transformation. All functions are designed to handle
 * edge cases gracefully and provide consistent behavior across different
 * input types.
 *
 * @fileoverview String utilities with comprehensive validation and transformation
 * @version 1.0.0
 * @author Plugin System
 * @since 1.0.0
 */

/**
 * Sanitizes a plugin name to contain only safe characters.
 *
 * Converts the input to lowercase and replaces any character that is not
 * a lowercase letter, digit, hyphen, or underscore with a hyphen.
 * This ensures the resulting string is safe for use in file names,
 * URLs, and other contexts where special characters may cause issues.
 *
 * @param {string} name - The plugin name to sanitize
 *
 * @returns {string} A sanitized string containing only [a-z0-9-_] characters
 *
 * @example
 * // Sanitize complex plugin name
 * const messy = 'My Plugin Name! (v2.0)';
 * const clean = sanitizePluginName(messy);
 * // Result: 'my-plugin-name---v2-0-'
 *
 * @example
 * // Already clean name
 * const clean = 'my-plugin-name';
 * const stillClean = sanitizePluginName(clean);
 * // Result: 'my-plugin-name'
 *
 * @example
 * // Handle special characters
 * const special = 'plugin@name#with$symbols';
 * const sanitized = sanitizePluginName(special);
 * // Result: 'plugin-name-with-symbols'
 *
 * @since 1.0.0
 */
export function sanitizePluginName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

// NOTE: isValidPluginName has been moved to validation-utils.ts to consolidate validation logic
// Import from '@libs/shared-utils' if you need this function

/**
 * Normalizes a string by trimming whitespace and converting to lowercase.
 *
 * This function performs common string normalization by removing leading
 * and trailing whitespace and converting all characters to lowercase.
 * Useful for case-insensitive comparisons and clean data processing.
 *
 * @param {string} str - The string to normalize
 *
 * @returns {string} The normalized string (trimmed and lowercase)
 *
 * @example
 * // Normalize user input
 * const userInput = '  Hello World  ';
 * const normalized = normalizeString(userInput);
 * // Result: 'hello world'
 *
 * @example
 * // Handle mixed case
 * const mixed = 'CamelCase';
 * const normalized = normalizeString(mixed);
 * // Result: 'camelcase'
 *
 * @example
 * // Handle whitespace variations
 * const messy = '\t  SpAcEd OuT  \n';
 * const clean = normalizeString(messy);
 * // Result: 'spaced out'
 *
 * @since 1.0.0
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
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
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
