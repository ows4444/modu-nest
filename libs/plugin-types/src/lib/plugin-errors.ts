import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base plugin error class
 */
export abstract class PluginError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: HttpStatus;

  constructor(message: string, public readonly details?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Plugin validation errors
 */
export class PluginValidationError extends PluginError {
  readonly code = 'PLUGIN_VALIDATION_ERROR';
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(message: string, public readonly validationErrors: string[]) {
    super(message, { validationErrors });
  }
}

/**
 * Plugin not found error
 */
export class PluginNotFoundError extends PluginError {
  readonly code = 'PLUGIN_NOT_FOUND';
  readonly statusCode = HttpStatus.NOT_FOUND;

  constructor(pluginName: string) {
    super(`Plugin '${pluginName}' not found`, { pluginName });
  }
}

/**
 * Plugin already exists error
 */
export class PluginAlreadyExistsError extends PluginError {
  readonly code = 'PLUGIN_ALREADY_EXISTS';
  readonly statusCode = HttpStatus.CONFLICT;

  constructor(pluginName: string, version: string) {
    super(`Plugin '${pluginName}' version '${version}' already exists`, { pluginName, version });
  }
}

/**
 * Plugin file format error
 */
export class PluginFileFormatError extends PluginError {
  readonly code = 'PLUGIN_FILE_FORMAT_ERROR';
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(message: string, fileName?: string) {
    super(message, { fileName });
  }
}

/**
 * Plugin storage error
 */
export class PluginStorageError extends PluginError {
  readonly code = 'PLUGIN_STORAGE_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor(message: string, operation?: string) {
    super(message, { operation });
  }
}

/**
 * Plugin registry connection error
 */
export class PluginRegistryConnectionError extends PluginError {
  readonly code = 'PLUGIN_REGISTRY_CONNECTION_ERROR';
  readonly statusCode = HttpStatus.SERVICE_UNAVAILABLE;

  constructor(registryUrl: string, originalError?: Error) {
    super(`Failed to connect to plugin registry at ${registryUrl}`, { registryUrl, originalError });
  }
}

/**
 * Plugin installation error
 */
export class PluginInstallationError extends PluginError {
  readonly code = 'PLUGIN_INSTALLATION_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor(pluginName: string, reason: string) {
    super(`Failed to install plugin '${pluginName}': ${reason}`, { pluginName, reason });
  }
}

/**
 * Plugin loading error
 */
export class PluginLoadingError extends PluginError {
  readonly code = 'PLUGIN_LOADING_ERROR';
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor(pluginName: string, reason: string) {
    super(`Failed to load plugin '${pluginName}': ${reason}`, { pluginName, reason });
  }
}

/**
 * Utility function to convert plugin errors to HTTP exceptions
 */
export function toHttpException(error: PluginError): HttpException {
  return new HttpException(
    {
      statusCode: error.statusCode,
      message: error.message,
      error: error.name,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString(),
    },
    error.statusCode
  );
}

/**
 * Utility function to handle plugin errors in controllers
 */
export function handlePluginError(error: unknown): never {
  if (error instanceof PluginError) {
    throw toHttpException(error);
  }

  if (error instanceof HttpException) {
    throw error;
  }

  // Handle unknown errors
  throw new HttpException(
    {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'InternalServerError',
      timestamp: new Date().toISOString(),
    },
    HttpStatus.INTERNAL_SERVER_ERROR
  );
}
