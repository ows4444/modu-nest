import { z } from 'zod';

/**
 * Zod-based runtime validators for plugin manifest types
 * Provides alternative validation using Zod schema validation
 */

// Base validation schemas
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/;
const pluginNameRegex = /^[a-z0-9-_]+$/;
const hexRegex = /^[a-fA-F0-9]+$/;

// Plugin Module Meta schema
export const PluginModuleMetaSchema = z.object({
  controllers: z.array(z.string()).optional(),
  providers: z.array(z.string()).optional(),
  exports: z.array(z.string()).optional(),
  imports: z.array(z.string()).optional(),
  guards: z.array(z.any()).optional(), // Will be validated by security schemas
  crossPluginServices: z.array(z.any()).optional(), // Will be validated by security schemas
}).strict();

// Plugin Compatibility schema
export const PluginCompatibilitySchema = z.object({
  minimumHostVersion: z.string().regex(semverRegex, 'Must follow semantic versioning').optional(),
  maximumHostVersion: z.string().regex(semverRegex, 'Must follow semantic versioning').optional(),
  nodeVersion: z.string().regex(semverRegex, 'Must follow semantic versioning'),
}).strict();

// Plugin Manifest schema
export const PluginManifestSchema = z.object({
  name: z.string().regex(pluginNameRegex, 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores'),
  version: z.string().regex(semverRegex, 'Version must follow semantic versioning'),
  description: z.string().min(1, 'Description cannot be empty'),
  author: z.string().min(1, 'Author cannot be empty'),
  license: z.string().min(1, 'License cannot be empty'),
  dependencies: z.array(z.string()).min(1, 'Dependencies array cannot be empty if provided').optional(),
  loadOrder: z.number().int().min(0, 'Load order must be a non-negative integer').optional(),
  critical: z.boolean().optional(),
  security: z.any().optional(), // Will be validated by security schemas
  compatibility: PluginCompatibilitySchema.optional(),
  module: PluginModuleMetaSchema,
}).strict();

// Plugin Metadata schema (extends manifest)
export const PluginMetadataSchema = PluginManifestSchema.extend({
  uploadedAt: z.string().datetime('Must be a valid ISO datetime string').or(z.string().min(1, 'Upload date cannot be empty')),
  fileSize: z.number().min(0, 'File size must be non-negative'),
  checksum: z.string().regex(hexRegex, 'Checksum must be a valid hexadecimal string'),
}).strict();

// Plugin Package schema
export const PluginPackageSchema = z.object({
  metadata: PluginMetadataSchema,
  filePath: z.string().min(1, 'File path cannot be empty'),
}).strict();

// Loaded Plugin schema
export const LoadedPluginSchema = z.object({
  manifest: PluginManifestSchema,
  module: z.any(), // Can be any valid JS module
  instance: z.any(), // Can be any valid JS object instance
}).strict();

// Plugin Update Info schema
export const PluginUpdateInfoSchema = z.object({
  name: z.string().regex(pluginNameRegex, 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores'),
  currentVersion: z.string().regex(semverRegex, 'Current version must follow semantic versioning'),
  availableVersion: z.string().regex(semverRegex, 'Available version must follow semantic versioning'),
}).strict();

// Plugin Validation Result schema
export const PluginValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();

// Plugin Config schema
export const PluginConfigSchema = z.object({
  allowedExtensions: z.array(z.string()).min(1, 'Allowed extensions cannot be empty'),
  allowedDirectories: z.array(z.string()).min(1, 'Allowed directories cannot be empty'),
  maxFileSize: z.number().min(0, 'Max file size must be non-negative'),
  storageLocation: z.string().min(1, 'Storage location cannot be empty'),
}).strict();

// Plugin Version schema
export const PluginVersionSchema = z.object({
  major: z.number().int().min(0, 'Major version must be non-negative'),
  minor: z.number().int().min(0, 'Minor version must be non-negative'),
  patch: z.number().int().min(0, 'Patch version must be non-negative'),
  prerelease: z.string().nullable().optional(),
  build: z.string().nullable().optional(),
  raw: z.string().optional(),
}).strict();

/**
 * Zod-based runtime validator utility for plugin manifest types
 */
export class PluginManifestZodValidator {
  /**
   * Validates a plugin manifest using Zod
   */
  static validateManifest(data: any) {
    try {
      const result = PluginManifestSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates plugin metadata using Zod
   */
  static validateMetadata(data: any) {
    try {
      const result = PluginMetadataSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates a plugin package using Zod
   */
  static validatePackage(data: any) {
    try {
      const result = PluginPackageSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates a loaded plugin using Zod
   */
  static validateLoadedPlugin(data: any) {
    try {
      const result = LoadedPluginSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates plugin configuration using Zod
   */
  static validateConfig(data: any) {
    try {
      const result = PluginConfigSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates plugin version information using Zod
   */
  static validateVersion(data: any) {
    try {
      const result = PluginVersionSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Validates update info using Zod
   */
  static validateUpdateInfo(data: any) {
    try {
      const result = PluginUpdateInfoSchema.parse(data);
      return {
        isValid: true,
        errors: [],
        warnings: [],
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
          warnings: [],
          data: null,
        };
      }
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        data: null,
      };
    }
  }

  /**
   * Safely parse and validate any plugin type with automatic type inference
   */
  static safeParseManifest(data: any) {
    return PluginManifestSchema.safeParse(data);
  }

  static safeParseMetadata(data: any) {
    return PluginMetadataSchema.safeParse(data);
  }

  static safeParsePackage(data: any) {
    return PluginPackageSchema.safeParse(data);
  }

  static safeParseLoadedPlugin(data: any) {
    return LoadedPluginSchema.safeParse(data);
  }

  static safeParseConfig(data: any) {
    return PluginConfigSchema.safeParse(data);
  }

  static safeParseVersion(data: any) {
    return PluginVersionSchema.safeParse(data);
  }

  static safeParseUpdateInfo(data: any) {
    return PluginUpdateInfoSchema.safeParse(data);
  }
}

// Export all schemas for direct use
export {
  PluginModuleMetaSchema,
  PluginCompatibilitySchema,
  PluginManifestSchema,
  PluginMetadataSchema,
  PluginPackageSchema,
  LoadedPluginSchema,
  PluginUpdateInfoSchema,
  PluginValidationResultSchema,
  PluginConfigSchema,
  PluginVersionSchema,
};