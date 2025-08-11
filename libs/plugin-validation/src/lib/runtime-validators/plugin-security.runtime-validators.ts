import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
  Max,
  Matches,
  validate,
  ValidationError,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PluginValidationResult } from '@libs/plugin-core';

export class BaseGuardEntryValidator {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9-_]*$/, {
    message: 'Guard name must start with a letter and contain only letters, numbers, hyphens, and underscores',
  })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  source!: string;

  @IsString()
  @IsIn(['local', 'external'])
  scope!: 'local' | 'external';
}

export class LocalGuardEntryValidator extends BaseGuardEntryValidator {
  declare scope: 'local';

  @IsString()
  @Matches(/^[A-Z][a-zA-Z0-9]*$/, {
    message: 'Class name must be a valid PascalCase identifier',
  })
  class!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-zA-Z][a-zA-Z0-9-_]*$/, { each: true, message: 'Dependencies must be valid identifiers' })
  dependencies?: string[];

  @IsOptional()
  @IsBoolean()
  exported?: boolean;
}

export class ExternalGuardEntryValidator extends BaseGuardEntryValidator {
  declare scope: 'external';

  declare source: string;
}

export class ServiceDeprecationInfoValidator {
  @IsString()
  since!: string;

  @IsString()
  removeIn!: string;

  @IsOptional()
  @IsString()
  replacement?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CrossPluginServiceConfigValidator {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9-_]*$/, {
    message: 'Service name must be a valid identifier',
  })
  serviceName!: string;

  @IsString()
  token!: string;

  @IsOptional()
  @IsBoolean()
  global?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Version must follow semantic versioning (e.g., 1.0.0)',
  })
  version?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    each: true,
    message: 'Compatible versions must follow semantic versioning',
  })
  compatibleVersions?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceDeprecationInfoValidator)
  deprecated?: ServiceDeprecationInfoValidator;
}

export class ServiceVersionInfoValidator {
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Version must follow semantic versioning (e.g., 1.0.0)',
  })
  version!: string;

  @IsBoolean()
  isCompatible!: boolean;

  @IsString()
  @IsIn(['exact', 'compatible', 'incompatible'])
  compatibilityLevel!: 'exact' | 'compatible' | 'incompatible';

  @IsOptional()
  @IsObject()
  deprecationInfo?: {
    isDeprecated: boolean;
    since: string;
    removeIn: string;
    replacement?: string;
    reason?: string;
  };
}

export class PluginSignatureValidator {
  @IsString()
  @IsIn(['RSA-SHA256', 'ECDSA-SHA256', 'EdDSA'], {
    message: 'Algorithm must be RSA-SHA256, ECDSA-SHA256, or EdDSA',
  })
  algorithm!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9+/=\-_]+$/, {
    message: 'Public key must be a valid base64 or PEM formatted string',
  })
  publicKey!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9+/=\-_]+$/, {
    message: 'Signature must be a valid base64 encoded string',
  })
  signature!: string;
}

export class PluginChecksumValidator {
  @IsString()
  @IsIn(['sha256', 'sha512', 'md5'], {
    message: 'Algorithm must be sha256, sha512, or md5',
  })
  algorithm!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]+$/, {
    message: 'Hash must be a valid hexadecimal string',
  })
  hash!: string;
}

export class ResourceLimitsValidator {
  @IsOptional()
  @IsNumber()
  @Min(16777216, { message: 'maxMemory should be at least 16MB' })
  @Max(2147483648, { message: 'maxMemory should not exceed 2GB' })
  maxMemory?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'maxCPU cannot be negative' })
  @Max(100, { message: 'maxCPU cannot exceed 100 percent' })
  maxCPU?: number;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'maxFileSize must be positive' })
  @Max(104857600, { message: 'maxFileSize should not exceed 100MB' })
  maxFileSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'maxNetworkBandwidth must be positive' })
  @Max(104857600, { message: 'maxNetworkBandwidth should not exceed 100MB/s' })
  maxNetworkBandwidth?: number;
}

export class PluginSandboxValidator {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['process', 'vm', 'container'], {
    message: 'isolationLevel must be process, vm, or container',
  })
  isolationLevel?: 'process' | 'vm' | 'container';

  @IsOptional()
  @ValidateNested()
  @Type(() => ResourceLimitsValidator)
  resourceLimits?: ResourceLimitsValidator;
}

export class PluginSecurityValidator {
  @IsString()
  @IsIn(['internal', 'verified', 'community'], {
    message: 'trustLevel must be internal, verified, or community',
  })
  trustLevel!: 'internal' | 'verified' | 'community';

  @IsOptional()
  @ValidateNested()
  @Type(() => PluginSignatureValidator)
  signature?: PluginSignatureValidator;

  @IsOptional()
  @ValidateNested()
  @Type(() => PluginChecksumValidator)
  checksum?: PluginChecksumValidator;

  @IsOptional()
  @ValidateNested()
  @Type(() => PluginSandboxValidator)
  sandbox?: PluginSandboxValidator;
}

export class LoadedGuardValidator {
  @ValidateNested()
  @Type(() => BaseGuardEntryValidator)
  entry!: BaseGuardEntryValidator;

  @IsString()
  @Matches(/^[a-z0-9-_]+$/, {
    message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores',
  })
  pluginName!: string;

  @IsOptional()
  guardClass?: Function;
}

export class GuardResolutionResultValidator {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadedGuardValidator)
  guards!: LoadedGuardValidator[];

  @IsArray()
  @IsString({ each: true })
  missingDependencies!: string[];

  @IsArray()
  @IsString({ each: true })
  circularDependencies!: string[];
}

/**
 * Runtime validator utility for plugin security types
 */
export class PluginSecurityRuntimeValidator {
  /**
   * Validates a guard entry dynamically based on its scope
   */
  static async validateGuardEntry(data: any): Promise<PluginValidationResult> {
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        errors: ['Guard entry must be an object'],
        warnings: [],
      };
    }

    let validator: LocalGuardEntryValidator | ExternalGuardEntryValidator;

    if (data.scope === 'local') {
      validator = new LocalGuardEntryValidator();
    } else if (data.scope === 'external') {
      validator = new ExternalGuardEntryValidator();
    } else {
      return {
        isValid: false,
        errors: ['Guard scope must be either "local" or "external"'],
        warnings: [],
      };
    }

    Object.assign(validator, data);
    const errors = await validate(validator);
    return this.formatValidationResult(errors);
  }

  /**
   * Validates cross-plugin service configuration
   */
  static async validateCrossPluginService(data: any): Promise<PluginValidationResult> {
    const validator = new CrossPluginServiceConfigValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    const result = this.formatValidationResult(errors);

    // Add custom warnings for security best practices
    if (data.deprecated?.reason === undefined && data.deprecated) {
      result.warnings.push('Consider providing a reason for deprecation');
    }

    return result;
  }

  /**
   * Validates plugin security configuration
   */
  static async validateSecurity(data: any): Promise<PluginValidationResult> {
    const validator = new PluginSecurityValidator();
    Object.assign(validator, data);

    const errors = await validate(validator);
    const result = this.formatValidationResult(errors);

    // Add custom warnings for security best practices
    if (data.checksum?.algorithm === 'md5') {
      result.warnings.push('MD5 is cryptographically weak - consider using SHA-256 or SHA-512');
    }

    if (data.signature?.publicKey && data.signature.publicKey.length < 64) {
      result.warnings.push('Public key appears to be very short - verify format');
    }

    if (data.signature?.signature && data.signature.signature.length < 64) {
      result.warnings.push('Signature appears to be very short - verify format');
    }

    if (data.sandbox?.resourceLimits) {
      const limits = data.sandbox.resourceLimits;
      if (limits.maxMemory > 1073741824) {
        result.warnings.push('Memory limit exceeds recommended maximum (1GB)');
      }
      if (limits.maxCPU > 80) {
        result.warnings.push('CPU limit is very high (>80%) - may impact system performance');
      }
    }

    return result;
  }

  /**
   * Validates guard resolution result
   */
  static async validateGuardResolution(data: any): Promise<PluginValidationResult> {
    const validator = new GuardResolutionResultValidator();
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
