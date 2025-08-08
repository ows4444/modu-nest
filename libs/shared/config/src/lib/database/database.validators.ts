import { ValidationOptions, registerDecorator, ValidationArguments } from 'class-validator';

/**
 * Custom validators for database configuration
 */

/**
 * Validates database connection timeout values
 */
export function IsConnectionTimeout(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isConnectionTimeout',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Timeout should be between 1 second and 5 minutes
          return value >= 1000 && value <= 300000;
        },
        defaultMessage() {
          return 'Connection timeout must be between 1000ms (1 second) and 300000ms (5 minutes)';
        },
      },
    });
  };
}

/**
 * Validates connection pool settings
 */
export function IsConnectionPool(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isConnectionPool',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'number') return false;

          const propertyName = args.property;

          if (propertyName === 'connectionPoolMin') {
            return value >= 1 && value <= 20;
          } else if (propertyName === 'connectionPoolMax') {
            const obj = args.object as any;
            const min = obj.connectionPoolMin || 1;
            return value >= min && value <= 100;
          }

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const propertyName = args.property;
          if (propertyName === 'connectionPoolMin') {
            return 'Connection pool minimum must be between 1 and 20';
          } else if (propertyName === 'connectionPoolMax') {
            return 'Connection pool maximum must be greater than minimum and up to 100';
          }
          return 'Invalid connection pool value';
        },
      },
    });
  };
}

/**
 * Validates backup retention period
 */
export function IsBackupRetention(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBackupRetention',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Retention should be between 1 day and 365 days (1 year)
          return value >= 1 && value <= 365;
        },
        defaultMessage() {
          return 'Backup retention days must be between 1 and 365 days';
        },
      },
    });
  };
}

/**
 * Validates cron expression for backup schedule
 */
export function IsCronExpression(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCronExpression',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          // Basic cron validation (minute hour day month dayOfWeek)
          const cronRegex =
            /^(\*|[0-5]?\d|\*\/\d+)\s+(\*|[01]?\d|2[0-3]|\*\/\d+)\s+(\*|[0-2]?\d|3[01]|\*\/\d+)\s+(\*|[0]?\d|1[0-2]|\*\/\d+)\s+(\*|[0-6]|\*\/\d+)$/;
          return cronRegex.test(value);
        },
        defaultMessage() {
          return 'Backup schedule must be a valid cron expression (minute hour day month dayOfWeek)';
        },
      },
    });
  };
}

/**
 * Validates query execution timeout
 */
export function IsQueryTimeout(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isQueryTimeout',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Query timeout should be between 1 second and 10 minutes
          return value >= 1000 && value <= 600000;
        },
        defaultMessage() {
          return 'Query timeout must be between 1000ms (1 second) and 600000ms (10 minutes)';
        },
      },
    });
  };
}

/**
 * Validates cache duration
 */
export function IsCacheDuration(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCacheDuration',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Cache duration should be between 1 second and 1 hour
          return value >= 1000 && value <= 3600000;
        },
        defaultMessage() {
          return 'Cache duration must be between 1000ms (1 second) and 3600000ms (1 hour)';
        },
      },
    });
  };
}

/**
 * Validates metrics interval
 */
export function IsMetricsInterval(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMetricsInterval',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'number') return false;

          // Metrics interval should be between 30 seconds and 1 hour
          return value >= 30000 && value <= 3600000;
        },
        defaultMessage() {
          return 'Metrics interval must be between 30000ms (30 seconds) and 3600000ms (1 hour)';
        },
      },
    });
  };
}
