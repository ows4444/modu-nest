import { PluginManifest, PluginValidationResult } from './plugin-interfaces';

export class PluginValidator {
  private static readonly REQUIRED_FIELDS: (keyof PluginManifest)[] = [
    'name',
    'version',
    'description',
    'author',
    'license',
    'entryPoint',
    'compatibilityVersion',
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

    // Validate compatibility version
    if (manifest.compatibilityVersion && !this.VERSION_REGEX.test(manifest.compatibilityVersion)) {
      errors.push('Compatibility version must follow semantic versioning (e.g., 1.0.0)');
    }

    // Validate entry point
    if (manifest.entryPoint && !/^[A-Z][a-zA-Z0-9]*$/.test(manifest.entryPoint)) {
      warnings.push('Entry point should be a valid class name (PascalCase)');
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
}
