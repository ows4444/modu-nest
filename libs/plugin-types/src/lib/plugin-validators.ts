import { PluginManifest, PluginValidationResult, LocalGuardEntry, ExternalGuardEntry } from './plugin-interfaces';

export class PluginValidator {
  private static readonly REQUIRED_FIELDS: (keyof PluginManifest)[] = [
    'name',
    'version',
    'description',
    'author',
    'license',
  ];

  private static readonly VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/;
  private static readonly NAME_REGEX = /^[a-z0-9-_]+$/;

  static validateManifest(manifest: Partial<PluginManifest>): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    for (const field of this.REQUIRED_FIELDS) {
      if (!manifest[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate name format
    if (manifest.name && !this.NAME_REGEX.test(manifest.name)) {
      errors.push('Plugin name must contain only lowercase letters, numbers, hyphens, and underscores');
    }

    // Validate version format
    if (manifest.version && !this.VERSION_REGEX.test(manifest.version)) {
      errors.push('Version must follow semantic versioning (e.g., 1.0.0)');
    }

    // Validate dependencies
    if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
      for (const dep of manifest.dependencies) {
        if (typeof dep !== 'string' || !dep.trim()) {
          errors.push('All dependencies must be non-empty strings');
          break;
        }
      }
    }

    // Validate load order
    if (manifest.loadOrder !== undefined) {
      if (!Number.isInteger(manifest.loadOrder) || manifest.loadOrder < 0) {
        errors.push('Load order must be a non-negative integer');
      }
    }

    // Validate module configuration
    if (manifest.module) {
      const moduleValidation = this.validateModuleConfiguration(manifest.module);
      errors.push(...moduleValidation.errors);
      warnings.push(...moduleValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validatePluginStructure(files: string[]): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required files
    const requiredFiles = ['plugin.manifest.json', 'index.js'];
    for (const file of requiredFiles) {
      if (!files.includes(file)) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    // Check for recommended files
    const recommendedFiles = ['README.md', 'package.json'];
    for (const file of recommendedFiles) {
      if (!files.includes(file)) {
        warnings.push(`Missing recommended file: ${file}`);
      }
    }

    // Validate file extensions
    const allowedExtensions = ['.js', '.json', '.md', '.txt', '.d.ts'];
    for (const file of files) {
      const ext = file.substring(file.lastIndexOf('.'));
      if (!allowedExtensions.includes(ext) && !file.endsWith('/')) {
        warnings.push(`Unusual file extension: ${file}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Deep validation for module configuration including guards
   */
  private static validateModuleConfiguration(module: any): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate array fields
    const arrayFields = ['controllers', 'providers', 'exports', 'imports'];
    for (const field of arrayFields) {
      if (module[field] !== undefined) {
        if (!Array.isArray(module[field])) {
          errors.push(`Module ${field} must be an array`);
        } else {
          for (const item of module[field]) {
            if (typeof item !== 'string' || !item.trim()) {
              errors.push(`All ${field} entries must be non-empty strings`);
              break;
            }
          }
        }
      }
    }

    // Deep validation for guards
    if (module.guards !== undefined) {
      if (!Array.isArray(module.guards)) {
        errors.push('Module guards must be an array');
      } else {
        const guardValidation = this.validateGuardEntries(module.guards);
        errors.push(...guardValidation.errors);
        warnings.push(...guardValidation.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Deep validation for guard entries with comprehensive security checks
   */
  private static validateGuardEntries(guards: any[]): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seenGuardNames = new Set<string>();

    for (let i = 0; i < guards.length; i++) {
      const guard = guards[i];
      const guardPrefix = `Guard ${i + 1}`;

      // Basic structure validation
      if (!guard || typeof guard !== 'object') {
        errors.push(`${guardPrefix}: must be an object`);
        continue;
      }

      // Required fields validation
      if (!guard.name || typeof guard.name !== 'string' || !guard.name.trim()) {
        errors.push(`${guardPrefix}: name is required and must be a non-empty string`);
      } else {
        // Check for duplicate guard names
        if (seenGuardNames.has(guard.name)) {
          errors.push(`${guardPrefix}: duplicate guard name '${guard.name}'`);
        } else {
          seenGuardNames.add(guard.name);
        }

        // Validate guard name format (security: prevent injection attacks)
        if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(guard.name)) {
          errors.push(`${guardPrefix}: guard name '${guard.name}' must start with a letter and contain only letters, numbers, hyphens, and underscores`);
        }
      }

      if (!guard.scope || typeof guard.scope !== 'string') {
        errors.push(`${guardPrefix}: scope is required and must be a string`);
      } else if (!['local', 'external'].includes(guard.scope)) {
        errors.push(`${guardPrefix}: scope must be either 'local' or 'external'`);
      }

      // Optional description validation
      if (guard.description !== undefined && (typeof guard.description !== 'string' || !guard.description.trim())) {
        warnings.push(`${guardPrefix}: description should be a non-empty string if provided`);
      }

      // Scope-specific validation
      if (guard.scope === 'local') {
        this.validateLocalGuardEntry(guard as LocalGuardEntry, guardPrefix, errors, warnings);
      } else if (guard.scope === 'external') {
        this.validateExternalGuardEntry(guard as ExternalGuardEntry, guardPrefix, errors, warnings);
      }

      // Security validation: check for potentially dangerous patterns
      this.validateGuardSecurity(guard, guardPrefix, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate local guard entry
   */
  private static validateLocalGuardEntry(guard: LocalGuardEntry, prefix: string, errors: string[], _warnings: string[]): void {
    // Class name is required for local guards
    if (!guard.class || typeof guard.class !== 'string' || !guard.class.trim()) {
      errors.push(`${prefix}: class is required for local guards and must be a non-empty string`);
    } else {
      // Validate class name format (security: prevent code injection)
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(guard.class)) {
        errors.push(`${prefix}: class name '${guard.class}' must be a valid PascalCase identifier`);
      }
    }

    // Validate dependencies
    if (guard.dependencies !== undefined) {
      if (!Array.isArray(guard.dependencies)) {
        errors.push(`${prefix}: dependencies must be an array`);
      } else {
        for (const dep of guard.dependencies) {
          if (typeof dep !== 'string' || !dep.trim()) {
            errors.push(`${prefix}: all dependencies must be non-empty strings`);
            break;
          }
          // Validate dependency name format
          if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(dep)) {
            errors.push(`${prefix}: dependency '${dep}' must be a valid identifier`);
          }
        }
      }
    }

    // Validate exported flag
    if (guard.exported !== undefined && typeof guard.exported !== 'boolean') {
      errors.push(`${prefix}: exported must be a boolean if provided`);
    }
  }

  /**
   * Validate external guard entry
   */
  private static validateExternalGuardEntry(guard: ExternalGuardEntry, prefix: string, errors: string[], warnings: string[]): void {
    // Source is required for external guards
    if (!guard.source || typeof guard.source !== 'string' || !guard.source.trim()) {
      errors.push(`${prefix}: source is required for external guards and must be a non-empty string`);
    } else {
      // Validate source format (security: prevent malicious plugin references)
      if (!/^[a-z0-9-_]+$/.test(guard.source)) {
        errors.push(`${prefix}: source '${guard.source}' must contain only lowercase letters, numbers, hyphens, and underscores`);
      }
    }

    // External guards should not have class or dependencies
    if ((guard as any).class !== undefined) {
      warnings.push(`${prefix}: external guards should not specify a class property`);
    }
    if ((guard as any).dependencies !== undefined) {
      warnings.push(`${prefix}: external guards should not specify dependencies`);
    }
    if ((guard as any).exported !== undefined) {
      warnings.push(`${prefix}: external guards should not specify exported property`);
    }
  }

  /**
   * Security validation for guard entries
   */
  private static validateGuardSecurity(guard: any, prefix: string, errors: string[], _warnings: string[]): void {
    // Check for suspicious properties that might indicate malicious intent
    const suspiciousProperties = ['__proto__', 'constructor', 'prototype', 'eval', 'Function'];
    for (const prop of suspiciousProperties) {
      if (Object.prototype.hasOwnProperty.call(guard, prop)) {
        errors.push(`${prefix}: suspicious property '${prop}' detected - potential security risk`);
      }
    }

    // Check for excessively long strings that might indicate buffer overflow attempts
    const maxStringLength = 1000;
    for (const [key, value] of Object.entries(guard)) {
      if (typeof value === 'string' && value.length > maxStringLength) {
        errors.push(`${prefix}: property '${key}' exceeds maximum length (${maxStringLength} characters)`);
      }
    }

    // Check for circular dependencies in guard dependencies
    if (guard.dependencies && Array.isArray(guard.dependencies)) {
      if (guard.dependencies.includes(guard.name)) {
        errors.push(`${prefix}: guard cannot depend on itself`);
      }
    }
  }
}
