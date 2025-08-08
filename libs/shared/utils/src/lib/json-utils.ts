/**
 * JSON parsing and serialization utilities
 */

/**
 * Safely parses JSON with a fallback value
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * Safely parses JSON and validates the result with a type guard
 */
export function safeJsonParseWithValidation<T>(
  json: string,
  validator: (value: unknown) => value is T,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(json);
    return validator(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Formats JSON with pretty printing
 */
export function prettyJsonStringify(obj: any, indent = 2): string {
  return JSON.stringify(obj, null, indent);
}

/**
 * Compacts JSON by removing all whitespace
 */
export function compactJsonStringify(obj: any): string {
  return JSON.stringify(obj);
}

/**
 * Safely stringifies an object, handling circular references
 */
export function safeJsonStringify(obj: any, indent?: number): string {
  const seen = new Set();
  
  return JSON.stringify(
    obj,
    (key, value) => {
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    },
    indent
  );
}

/**
 * Parses JSON and throws a custom error on failure
 */
export function parseJsonOrThrow(json: string, errorMessage?: string): any {
  try {
    return JSON.parse(json);
  } catch (originalError) {
    throw new Error(
      errorMessage || `Failed to parse JSON: ${(originalError as Error).message}`
    );
  }
}

/**
 * Checks if a string is valid JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep merges JSON-compatible objects
 */
export function mergeJson<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  Object.keys(source).forEach(key => {
    const sourceValue = source[key as keyof T];
    const targetValue = result[key as keyof T];
    
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key as keyof T] = mergeJson(targetValue as any, sourceValue as any);
    } else {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  });
  
  return result;
}

/**
 * Converts a JSON-compatible object to a query string
 */
export function jsonToQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, String(item)));
      } else if (typeof value === 'object') {
        params.append(key, JSON.stringify(value));
      } else {
        params.append(key, String(value));
      }
    }
  });
  
  return params.toString();
}

/**
 * Parses a query string back to a JSON-compatible object
 */
export function queryStringToJson(queryString: string): Record<string, any> {
  const params = new URLSearchParams(queryString);
  const result: Record<string, any> = {};
  
  for (const [key, value] of params.entries()) {
    if (result[key]) {
      // Handle multiple values for the same key
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      // Try to parse as JSON, fallback to string
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Filters out undefined values from an object before JSON serialization
 */
export function cleanForJson<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const cleanedNested = cleanForJson(value);
        if (Object.keys(cleanedNested).length > 0) {
          cleaned[key as keyof T] = cleanedNested as T[keyof T];
        }
      } else {
        cleaned[key as keyof T] = value;
      }
    }
  });
  
  return cleaned;
}

/**
 * Flattens a nested JSON object for easier processing
 */
export function flattenJson(
  obj: Record<string, any>,
  prefix = '',
  separator = '.'
): Record<string, any> {
  const flattened: Record<string, any> = {};
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}${separator}${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenJson(value, newKey, separator));
    } else {
      flattened[newKey] = value;
    }
  });
  
  return flattened;
}