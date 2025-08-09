/**
 * Array and collection manipulation utilities
 * 
 * This module provides a comprehensive set of utilities for working with arrays
 * and collections, including grouping, filtering, transforming, and statistical operations.
 * All functions are designed to be immutable and functional programming friendly.
 * 
 * @fileoverview Array manipulation utilities with comprehensive type safety
 * @version 1.0.0
 * @author Plugin System
 * @since 1.0.0
 */

/**
 * Groups array items by a key function into a record of arrays.
 * 
 * This function takes an array and groups its elements based on the result
 * of a key function applied to each element. The key function should return
 * a value that can be used as an object key.
 * 
 * @template T - The type of elements in the input array
 * @template K - The type of keys that will be used for grouping (must be valid object keys)
 * 
 * @param {T[]} array - The array to group. Can be empty.
 * @param {(item: T) => K} keyFn - Function that extracts the grouping key from each element
 * 
 * @returns {Record<K, T[]>} An object where keys are the result of keyFn and values are arrays of matching elements
 * 
 * @example
 * // Group people by age
 * const people = [
 *   { name: 'Alice', age: 25 },
 *   { name: 'Bob', age: 30 },
 *   { name: 'Charlie', age: 25 }
 * ];
 * const byAge = groupBy(people, person => person.age);
 * // Result: { 25: [{ name: 'Alice', age: 25 }, { name: 'Charlie', age: 25 }], 30: [{ name: 'Bob', age: 30 }] }
 * 
 * @example
 * // Group strings by their first letter
 * const words = ['apple', 'banana', 'apricot', 'cherry'];
 * const byFirstLetter = groupBy(words, word => word[0]);
 * // Result: { a: ['apple', 'apricot'], b: ['banana'], c: ['cherry'] }
 * 
 * @example
 * // Handle empty array
 * const empty = groupBy([], x => x);
 * // Result: {}
 * 
 * @since 1.0.0
 */
export function groupBy<T, K extends keyof any>(array: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

/**
 * Returns unique values from an array, preserving the order of first occurrence.
 * 
 * Uses Set to efficiently remove duplicates while maintaining the original order
 * of elements. Only the first occurrence of each unique value is kept.
 * 
 * @template T - The type of elements in the array
 * 
 * @param {T[]} array - The input array that may contain duplicates
 * 
 * @returns {T[]} A new array with only unique values in order of first occurrence
 * 
 * @example
 * // Remove duplicate numbers
 * const numbers = [1, 2, 2, 3, 1, 4];
 * const uniqueNumbers = unique(numbers);
 * // Result: [1, 2, 3, 4]
 * 
 * @example
 * // Remove duplicate strings
 * const words = ['apple', 'banana', 'apple', 'cherry', 'banana'];
 * const uniqueWords = unique(words);
 * // Result: ['apple', 'banana', 'cherry']
 * 
 * @example
 * // Works with objects (by reference)
 * const obj1 = { id: 1 };
 * const obj2 = { id: 2 };
 * const objects = [obj1, obj2, obj1];
 * const uniqueObjects = unique(objects);
 * // Result: [{ id: 1 }, { id: 2 }]
 * 
 * @since 1.0.0
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Returns unique values from an array based on a key function.
 * 
 * This function allows you to specify what makes an element unique by providing
 * a key function. Only the first element with each unique key is kept.
 * 
 * @template T - The type of elements in the array
 * @template K - The type of the key returned by the key function
 * 
 * @param {T[]} array - The input array that may contain duplicates
 * @param {(item: T) => K} keyFn - Function that extracts the uniqueness key from each element
 * 
 * @returns {T[]} A new array with elements unique by the key function result
 * 
 * @example
 * // Remove duplicate objects by ID
 * const users = [
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' },
 *   { id: 1, name: 'Alice Clone' },
 *   { id: 3, name: 'Charlie' }
 * ];
 * const uniqueUsers = uniqueBy(users, user => user.id);
 * // Result: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }]
 * 
 * @example
 * // Remove duplicate strings by length
 * const words = ['cat', 'dog', 'bird', 'ant', 'elephant'];
 * const uniqueByLength = uniqueBy(words, word => word.length);
 * // Result: ['cat', 'bird', 'elephant'] (first occurrence of each length)
 * 
 * @example
 * // Remove duplicates by computed property
 * const items = [1, 2, 3, 4, 5, 6];
 * const uniqueByParity = uniqueBy(items, x => x % 2);
 * // Result: [1, 2] (first odd and first even number)
 * 
 * @since 1.0.0
 */
export function uniqueBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Splits an array into chunks of specified size.
 * 
 * Divides the input array into smaller arrays of the specified size.
 * The last chunk may contain fewer elements if the array length is not
 * evenly divisible by the chunk size.
 * 
 * @template T - The type of elements in the array
 * 
 * @param {T[]} array - The array to split into chunks
 * @param {number} size - The size of each chunk (must be positive)
 * 
 * @returns {T[][]} An array of chunks, where each chunk is an array of up to `size` elements
 * 
 * @throws {Error} When size is not a positive number
 * 
 * @example
 * // Split numbers into chunks of 3
 * const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
 * const chunks = chunk(numbers, 3);
 * // Result: [[1, 2, 3], [4, 5, 6], [7, 8]]
 * 
 * @example
 * // Split array into pairs
 * const items = ['a', 'b', 'c', 'd', 'e'];
 * const pairs = chunk(items, 2);
 * // Result: [['a', 'b'], ['c', 'd'], ['e']]
 * 
 * @example
 * // Handle empty array
 * const empty = chunk([], 3);
 * // Result: []
 * 
 * @example
 * // Error case
 * try {
 *   chunk([1, 2, 3], 0); // Throws Error: 'Chunk size must be positive'
 * } catch (error) {
 *   console.error(error.message);
 * }
 * 
 * @since 1.0.0
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be positive');
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flattens an array of arrays by one level.
 * 
 * Takes a two-dimensional array and flattens it into a one-dimensional array.
 * Only flattens one level deep - nested arrays within the sub-arrays remain nested.
 * 
 * @template T - The type of elements in the inner arrays
 * 
 * @param {T[][]} arrays - Array of arrays to flatten
 * 
 * @returns {T[]} A new flattened array containing all elements from the sub-arrays
 * 
 * @example
 * // Flatten array of number arrays
 * const nested = [[1, 2], [3, 4], [5]];
 * const flattened = flatten(nested);
 * // Result: [1, 2, 3, 4, 5]
 * 
 * @example
 * // Flatten array of string arrays
 * const words = [['hello', 'world'], ['foo', 'bar']];
 * const flatWords = flatten(words);
 * // Result: ['hello', 'world', 'foo', 'bar']
 * 
 * @example
 * // Only flattens one level
 * const deepNested = [[1, [2, 3]], [4, [5, 6]]];
 * const oneLevelFlat = flatten(deepNested);
 * // Result: [1, [2, 3], 4, [5, 6]]
 * 
 * @since 1.0.0
 */
export function flatten<T>(arrays: T[][]): T[] {
  return arrays.reduce((acc, arr) => acc.concat(arr), []);
}

/**
 * Deeply flattens nested arrays recursively to any depth.
 * 
 * Recursively flattens an array, removing all levels of nesting.
 * This function will continue flattening until no more arrays are found.
 * 
 * @param {any[]} array - The potentially deeply nested array to flatten
 * 
 * @returns {any[]} A new array with all nesting removed
 * 
 * @example
 * // Flatten deeply nested arrays
 * const deepNested = [1, [2, [3, [4, 5]], 6], 7];
 * const fullyFlat = flattenDeep(deepNested);
 * // Result: [1, 2, 3, 4, 5, 6, 7]
 * 
 * @example
 * // Mixed types
 * const mixed = ['a', ['b', ['c', 'd']], 'e'];
 * const flatMixed = flattenDeep(mixed);
 * // Result: ['a', 'b', 'c', 'd', 'e']
 * 
 * @example
 * // Already flat array
 * const alreadyFlat = [1, 2, 3];
 * const stillFlat = flattenDeep(alreadyFlat);
 * // Result: [1, 2, 3]
 * 
 * @since 1.0.0
 */
export function flattenDeep(array: any[]): any[] {
  return array.reduce((acc, item) => {
    if (Array.isArray(item)) {
      return acc.concat(flattenDeep(item));
    }
    return acc.concat(item);
  }, []);
}

/**
 * Returns the intersection of two arrays (elements present in both).
 * 
 * Finds all elements that exist in both arrays. The result preserves the order
 * of elements as they appear in the first array, and removes duplicates.
 * 
 * @template T - The type of elements in the arrays
 * 
 * @param {T[]} array1 - The first array
 * @param {T[]} array2 - The second array to intersect with
 * 
 * @returns {T[]} A new array containing elements present in both input arrays
 * 
 * @example
 * // Find common numbers
 * const nums1 = [1, 2, 3, 4, 5];
 * const nums2 = [3, 4, 5, 6, 7];
 * const common = intersection(nums1, nums2);
 * // Result: [3, 4, 5]
 * 
 * @example
 * // Find common strings
 * const words1 = ['apple', 'banana', 'cherry'];
 * const words2 = ['banana', 'cherry', 'date'];
 * const commonWords = intersection(words1, words2);
 * // Result: ['banana', 'cherry']
 * 
 * @example
 * // No intersection
 * const set1 = [1, 2, 3];
 * const set2 = [4, 5, 6];
 * const noCommon = intersection(set1, set2);
 * // Result: []
 * 
 * @example
 * // With duplicates in first array
 * const dup1 = [1, 2, 2, 3];
 * const dup2 = [2, 3, 4];
 * const uniqueCommon = intersection(dup1, dup2);
 * // Result: [2, 3] (duplicates from first array are preserved)
 * 
 * @since 1.0.0
 */
export function intersection<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return array1.filter((item) => set2.has(item));
}

/**
 * Returns the difference between two arrays (items in first but not second)
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return array1.filter((item) => !set2.has(item));
}

/**
 * Returns the symmetric difference between two arrays
 */
export function symmetricDifference<T>(array1: T[], array2: T[]): T[] {
  const set1 = new Set(array1);
  const set2 = new Set(array2);

  return [...array1.filter((item) => !set2.has(item)), ...array2.filter((item) => !set1.has(item))];
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Takes a random sample of n items from an array
 */
export function sample<T>(array: T[], n: number): T[] {
  if (n >= array.length) {
    return shuffle(array);
  }

  return shuffle(array).slice(0, n);
}

/**
 * Partitions an array based on a predicate
 */
export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];

  array.forEach((item) => {
    if (predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  });

  return [truthy, falsy];
}

/**
 * Counts occurrences of each item in an array
 */
export function countBy<T>(array: T[]): Map<T, number> {
  const counts = new Map<T, number>();

  array.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });

  return counts;
}

/**
 * Finds the most frequent item(s) in an array
 */
export function mostFrequent<T>(array: T[]): T[] {
  if (array.length === 0) return [];

  const counts = countBy(array);
  const maxCount = Math.max(...counts.values());

  return Array.from(counts.entries())
    .filter(([, count]) => count === maxCount)
    .map(([item]) => item);
}

/**
 * Compacts an array by removing falsy values
 */
export function compact<T>(array: (T | null | undefined | false | 0 | '')[]): T[] {
  return array.filter(Boolean) as T[];
}
