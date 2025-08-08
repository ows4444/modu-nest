/**
 * Array and collection manipulation utilities
 */

/**
 * Groups array items by a key function
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
 * Returns unique values from an array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Returns unique values from an array based on a key function
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
 * Splits an array into chunks of specified size
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
 * Flattens an array of arrays by one level
 */
export function flatten<T>(arrays: T[][]): T[] {
  return arrays.reduce((acc, arr) => acc.concat(arr), []);
}

/**
 * Deeply flattens nested arrays
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
 * Returns the intersection of two arrays
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
