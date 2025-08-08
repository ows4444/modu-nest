/**
 * Object manipulation utilities
 */

/**
 * Deep clones an object using JSON serialization
 * Note: This won't work with functions, undefined, Symbol, etc.
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as T;
  }

  if (typeof obj === 'object') {
    const cloned = {} as T;
    Object.keys(obj as any).forEach((key) => {
      (cloned as any)[key] = deepClone((obj as any)[key]);
    });
    return cloned;
  }

  return obj;
}

/**
 * Omits specified keys from an object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
}

/**
 * Picks specified keys from an object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Merges multiple objects deeply
 */
export function deepMerge<T extends Record<string, any>>(...objects: Partial<T>[]): T {
  const result = {} as T;

  objects.forEach((obj) => {
    if (obj) {
      Object.keys(obj).forEach((key) => {
        const value = obj[key];

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key as keyof T] = deepMerge((result[key as keyof T] as any) || {}, value);
        } else {
          result[key as keyof T] = value as T[keyof T];
        }
      });
    }
  });

  return result;
}

/**
 * Checks if an object has a specific property
 */
export function hasProperty<T extends Record<PropertyKey, any>>(obj: T, property: PropertyKey): property is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, property);
}

/**
 * Gets a nested property from an object using dot notation
 */
export function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Sets a nested property in an object using dot notation
 */
export function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;

  const target = keys.reduce((current, key) => {
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    return current[key];
  }, obj);

  target[lastKey] = value;
}

/**
 * Flattens a nested object to a single level with dot notation keys
 */
export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  });

  return flattened;
}

/**
 * Unflatten an object with dot notation keys back to nested structure
 */
export function unflatten(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  Object.keys(obj).forEach((key) => {
    setNestedProperty(result, key, obj[key]);
  });

  return result;
}

/**
 * Filters object properties based on a predicate
 */
export function filterObject<T extends Record<string, any>>(
  obj: T,
  predicate: (key: string, value: any) => boolean
): Partial<T> {
  const result: Partial<T> = {};

  Object.keys(obj).forEach((key) => {
    if (predicate(key, obj[key])) {
      result[key as keyof T] = obj[key];
    }
  });

  return result;
}

/**
 * Maps object values using a transform function
 */
export function mapValues<T extends Record<string, any>, U>(
  obj: T,
  mapper: (value: T[keyof T], key: keyof T) => U
): Record<keyof T, U> {
  const result = {} as Record<keyof T, U>;

  Object.keys(obj).forEach((key) => {
    result[key as keyof T] = mapper(obj[key], key as keyof T);
  });

  return result;
}

/**
 * Checks if two objects are deeply equal
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (obj1 == null || obj2 == null) return obj1 === obj2;

  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  return keys1.every((key) => keys2.includes(key) && deepEqual(obj1[key], obj2[key]));
}

/**
 * Gets the size of an object (number of enumerable properties)
 */
export function objectSize(obj: Record<string, any>): number {
  return Object.keys(obj).length;
}

/**
 * Checks if an object is empty
 */
export function isEmpty(obj: Record<string, any>): boolean {
  return Object.keys(obj).length === 0;
}
