import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
  Matches,
  ArrayNotEmpty,
  validate,
  ValidationError,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PluginValidationResult } from './plugin-manifest.types';

export class PluginModuleMetaValidator {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controllers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exports?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imports?: string[];

  @IsOptional()
  @IsArray()
  guards?: any[]; // GuardEntry[] - will be validated by security validators

  @IsOptional()
  @IsArray()
  crossPluginServices?: any[]; // CrossPluginServiceConfig[] - will be validated by security validators
}

export class PluginCompatibilityValidator {
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'minimumHostVersion must follow semantic versioning (e.g., 1.0.0)',
  })
  minimumHostVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'maximumHostVersion must follow semantic versioning (e.g., 1.0.0)',
  })
  maximumHostVersion?: string;

  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'nodeVersion must follow semantic versioning (e.g., 1.0.0)',
  })
  nodeVersion!: string;
}

export class PluginManifestValidator {
  @IsString()
  @Matches(/^[a-z0-9-_]+$/, {
    message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores',
  })
  name!: string;

  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Version must follow semantic versioning (e.g., 1.0.0)',
  })
  version!: string;

  @IsString()
  description!: string;

  @IsString()
  author!: string;

  @IsString()
  license!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'Dependencies array cannot be empty if provided' })
  dependencies?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Load order must be a non-negative integer' })
  @Transform(({ value }) => parseInt(value))
  loadOrder?: number;

  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsObject()
  security?: any; // PluginSecurity - will be validated by security validators

  @IsOptional()
  @ValidateNested()
  @Type(() => PluginCompatibilityValidator)
  compatibility?: PluginCompatibilityValidator;

  @ValidateNested()
  @Type(() => PluginModuleMetaValidator)
  module!: PluginModuleMetaValidator;
}

export class PluginMetadataValidator extends PluginManifestValidator {
  @IsString()
  uploadedAt!: string;

  @IsNumber()
  @Min(0, { message: 'File size must be a non-negative number' })
  fileSize!: number;

  @IsString()
  @Matches(/^[a-fA-F0-9]+$/, {
    message: 'Checksum must be a valid hexadecimal string',
  })
  checksum!: string;
}

export class PluginPackageValidator {
  @ValidateNested()
  @Type(() => PluginMetadataValidator)
  metadata!: PluginMetadataValidator;

  @IsString()
  filePath!: string;
}

export class PluginUpdateInfoValidator {
  @IsString()
  @Matches(/^[a-z0-9-_]+$/, {
    message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores',
  })
  name!: string;

  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Current version must follow semantic versioning (e.g., 1.0.0)',
  })
  currentVersion!: string;

  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Available version must follow semantic versioning (e.g., 1.0.0)',
  })
  availableVersion!: string;
}

export class PluginValidationResultValidator {
  @IsBoolean()
  isValid!: boolean;

  @IsArray()
  @IsString({ each: true })
  errors!: string[];

  @IsArray()
  @IsString({ each: true })
  warnings!: string[];
}

export class PluginConfigValidator {
  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'Allowed extensions cannot be empty' })
  allowedExtensions!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'Allowed directories cannot be empty' })
  allowedDirectories!: string[];

  @IsNumber()
  @Min(0, { message: 'Max file size must be a non-negative number' })
  maxFileSize!: number;

  @IsString()
  storageLocation!: string;
}

export class PluginVersionValidator {
  @IsNumber()
  @Min(0, { message: 'Major version must be non-negative' })
  major!: number;

  @IsNumber()
  @Min(0, { message: 'Minor version must be non-negative' })
  minor!: number;

  @IsNumber()
  @Min(0, { message: 'Patch version must be non-negative' })
  patch!: number;

  @IsOptional()
  @IsString()
  prerelease?: string | null;

  @IsOptional()
  @IsString()
  build?: string | null;

  @IsOptional()
  @IsString()
  raw?: string;
}

export class LoadedPluginValidator {
  @ValidateNested()
  @Type(() => PluginManifestValidator)
  manifest!: PluginManifestValidator;

  // module can be any valid JS module
  @IsObject()
  module!: unknown;

  // instance can be any valid JS object instance
  @IsObject()
  instance!: unknown;
}

/**
 * Runtime validator utility for plugin manifest types
 */
export class PluginManifestRuntimeValidator {
  /**
   * Validates a plugin manifest using class-validator
   */
  static async validateManifest(data: any): Promise<PluginValidationResult> {
    const validator = new PluginManifestValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates plugin metadata using class-validator
   */
  static async validateMetadata(data: any): Promise<PluginValidationResult> {
    const validator = new PluginMetadataValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates a plugin package using class-validator
   */
  static async validatePackage(data: any): Promise<PluginValidationResult> {
    const validator = new PluginPackageValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates plugin configuration using class-validator
   */
  static async validateConfig(data: any): Promise<PluginValidationResult> {
    const validator = new PluginConfigValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates plugin version information using class-validator
   */
  static async validateVersion(data: any): Promise<PluginValidationResult> {
    const validator = new PluginVersionValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates a loaded plugin using class-validator
   */
  static async validateLoadedPlugin(data: any): Promise<PluginValidationResult> {
    const validator = new LoadedPluginValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    return this.formatValidationResult(errors);
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
