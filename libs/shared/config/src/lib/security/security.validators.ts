import { ValidationOptions, registerDecorator, ValidationArguments } from 'class-validator';
import { isValidUrl } from '@libs/shared-utils';

/**
 * Custom validators for security configuration
 */

/**
 * Validates that a value is a secure password with minimum requirements
 */
export function IsSecurePassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSecurePassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          // Minimum 12 characters
          if (value.length < 12) return false;

          // Contains uppercase letter
          if (!/[A-Z]/.test(value)) return false;

          // Contains lowercase letter
          if (!/[a-z]/.test(value)) return false;

          // Contains number
          if (!/\d/.test(value)) return false;

          // Contains special character
          if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return false;

          return true;
        },
        defaultMessage() {
          return 'Password must be at least 12 characters long and contain uppercase, lowercase, number, and special character';
        },
      },
    });
  };
}

/**
 * Validates that a JWT expiration string is valid
 */
export function IsJwtExpiration(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isJwtExpiration',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          // Match patterns like '1h', '30m', '7d', '1y'
          return /^\d+[smhdy]$/.test(value);
        },
        defaultMessage() {
          return 'JWT expiration must be in format like "1h", "30m", "7d", "1y"';
        },
      },
    });
  };
}

/**
 * Validates an array of CORS origins
 */
export function IsCorsOrigins(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCorsOrigins',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) return false;

          return value.every((origin) => {
            if (typeof origin !== 'string') return false;

            // Allow '*' for all origins (not recommended for production)
            if (origin === '*') return true;

            // Must be valid URL or localhost
            return isValidUrl(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
          });
        },
        defaultMessage() {
          return 'CORS origins must be valid URLs or localhost addresses';
        },
      },
    });
  };
}

/**
 * Validates file size in bytes with reasonable limits
 */
export function IsValidFileSize(maxBytes: number = 100 * 1024 * 1024, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidFileSize',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;
          return value > 0 && value <= maxBytes;
        },
        defaultMessage() {
          return `File size must be between 1 byte and ${maxBytes} bytes`;
        },
      },
    });
  };
}

/**
 * Validates file extensions array
 */
export function IsFileExtensions(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFileExtensions',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) return false;

          return value.every((ext) => {
            if (typeof ext !== 'string') return false;

            // Must start with . and contain only alphanumeric characters
            return /^\.[a-zA-Z0-9]+$/.test(ext);
          });
        },
        defaultMessage() {
          return 'File extensions must be strings starting with "." followed by alphanumeric characters';
        },
      },
    });
  };
}

/**
 * Validates that a path is safe and doesn't contain directory traversal attempts
 */
export function IsSafePath(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafePath',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          // Check for directory traversal attempts
          if (value.includes('..') || value.includes('~')) return false;

          // Must be absolute path or relative without traversal
          return /^([^/\0]+\/)*$/.test(value) || /^[^/\0][^/\0]*$/.test(value);
        },
        defaultMessage() {
          return 'Path must be safe and not contain directory traversal attempts';
        },
      },
    });
  };
}

/**
 * Validates hash rounds for bcrypt (reasonable range)
 */
export function IsHashRounds(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHashRounds',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Reasonable range: 10-15 rounds
          return value >= 10 && value <= 15;
        },
        defaultMessage() {
          return 'Hash rounds must be between 10 and 15 for security and performance balance';
        },
      },
    });
  };
}

/**
 * Validates plugin trust levels
 */
export function IsPluginTrustLevels(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPluginTrustLevels',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) return false;

          const validLevels = ['internal', 'verified', 'community'];
          return value.every((level) => validLevels.includes(level));
        },
        defaultMessage() {
          return 'Plugin trust levels must be "internal", "verified", or "community"';
        },
      },
    });
  };
}

/**
 * Validates rate limit configuration
 */
export function IsRateLimit(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRateLimit',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'number') return false;

          const propertyName = args.property;

          if (propertyName === 'rateLimitWindowMs') {
            // Window should be between 1 minute and 1 hour
            return value >= 60000 && value <= 3600000;
          } else if (propertyName === 'rateLimitMaxRequests') {
            // Max requests should be reasonable
            return value >= 1 && value <= 10000;
          }

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const propertyName = args.property;
          if (propertyName === 'rateLimitWindowMs') {
            return 'Rate limit window must be between 1 minute (60000ms) and 1 hour (3600000ms)';
          } else if (propertyName === 'rateLimitMaxRequests') {
            return 'Rate limit max requests must be between 1 and 10000';
          }
          return 'Invalid rate limit value';
        },
      },
    });
  };
}
