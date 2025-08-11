import { IsString, IsIn, validate, ValidationError } from 'class-validator';
import { PluginValidationResult } from '@plugin/core';

export class PluginLifecycleHookValidator {
  @IsString()
  @IsIn(['beforeLoad', 'afterLoad', 'beforeUnload', 'afterUnload', 'onError'], {
    message: 'Lifecycle hook must be one of: beforeLoad, afterLoad, beforeUnload, afterUnload, onError',
  })
  hook!: string;
}

/**
 * Runtime validator utility for plugin lifecycle types
 */
export class PluginLifecycleRuntimeValidator {
  /**
   * Validates a plugin lifecycle hook
   */
  static async validateLifecycleHook(data: unknown): Promise<PluginValidationResult> {
    if (typeof data !== 'string') {
      return {
        isValid: false,
        errors: ['Lifecycle hook must be a string'],
        warnings: [],
      };
    }

    const validator = new PluginLifecycleHookValidator();
    validator.hook = data;

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates an array of plugin lifecycle hooks
   */
  static async validateLifecycleHooks(data: unknown): Promise<PluginValidationResult> {
    if (!Array.isArray(data)) {
      return {
        isValid: false,
        errors: ['Lifecycle hooks must be an array'],
        warnings: [],
      };
    }

    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const result = await this.validateLifecycleHook(data[i]);
      result.errors.forEach((error) => {
        allErrors.push(`Hook ${i + 1}: ${error}`);
      });
      result.warnings.forEach((warning) => {
        allWarnings.push(`Hook ${i + 1}: ${warning}`);
      });
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Format validation errors into PluginValidationResult
   */
  private static formatValidationResult(errors: ValidationError[]): PluginValidationResult {
    const formattedErrors: string[] = [];
    const warnings: string[] = [];

    const extractErrors = (error: ValidationError, path = '') => {
      const fieldPath = path ? `${path}.${error.property}` : error.property;

      if (error.constraints) {
        Object.values(error.constraints).forEach((constraint) => {
          formattedErrors.push(`${fieldPath}: ${constraint}`);
        });
      }

      if (error.children && error.children.length > 0) {
        error.children.forEach((child) => extractErrors(child, fieldPath));
      }
    };

    errors.forEach((error) => extractErrors(error));

    return {
      isValid: formattedErrors.length === 0,
      errors: formattedErrors,
      warnings,
    };
  }
}
