/**
 * Compiled Plugin Validator Service
 * 
 * Pre-compiles validation rules into optimized JavaScript functions
 * for maximum runtime performance.
 */

import { Injectable, Logger } from '@nestjs/common';
import { 
  PluginManifest, 
  PluginValidationResult 
} from '@libs/plugin-core';

interface CompiledValidator {
  validate: (manifest: any) => PluginValidationResult;
  checksum: string;
  createdAt: number;
}

interface CompilationStats {
  compiledValidators: number;
  compilationTime: number;
  averageValidationTime: number;
  totalValidations: number;
}

@Injectable()
export class CompiledValidatorService {
  private readonly logger = new Logger(CompiledValidatorService.name);
  private readonly compiledValidators = new Map<string, CompiledValidator>();
  private readonly stats: CompilationStats = {
    compiledValidators: 0,
    compilationTime: 0,
    averageValidationTime: 0,
    totalValidations: 0,
  };

  /**
   * Validate manifest using compiled validator
   */
  async validateManifest(
    manifest: Partial<PluginManifest>,
    validationType: 'full' | 'essential' | 'trusted' = 'full'
  ): Promise<PluginValidationResult> {
    const startTime = performance.now();
    
    try {
      const validator = await this.getCompiledValidator(validationType);
      const result = validator.validate(manifest);
      
      return result;
    } finally {
      const validationTime = performance.now() - startTime;
      this.updateValidationStats(validationTime);
    }
  }

  /**
   * Pre-compile validators for known validation types
   */
  async precompileValidators(): Promise<void> {
    this.logger.log('Pre-compiling validation functions...');
    
    const validationTypes = ['full', 'essential', 'trusted'] as const;
    
    for (const type of validationTypes) {
      await this.getCompiledValidator(type);
    }
    
    this.logger.log(`Pre-compiled ${validationTypes.length} validation functions`);
  }

  /**
   * Get compilation statistics
   */
  getStats(): CompilationStats & { cacheSize: number } {
    return {
      ...this.stats,
      cacheSize: this.compiledValidators.size,
    };
  }

  private async getCompiledValidator(
    validationType: 'full' | 'essential' | 'trusted'
  ): Promise<CompiledValidator> {
    const cacheKey = `validator:${validationType}`;
    
    let validator = this.compiledValidators.get(cacheKey);
    if (!validator) {
      validator = await this.compileValidator(validationType);
      this.compiledValidators.set(cacheKey, validator);
      this.stats.compiledValidators++;
    }
    
    return validator;
  }

  private async compileValidator(
    validationType: 'full' | 'essential' | 'trusted'
  ): Promise<CompiledValidator> {
    const startTime = performance.now();
    
    try {
      let validationCode: string;
      
      switch (validationType) {
        case 'trusted':
          validationCode = this.compileTrustedValidator();
          break;
        case 'essential':
          validationCode = this.compileEssentialValidator();
          break;
        case 'full':
        default:
          validationCode = this.compileFullValidator();
          break;
      }
      
      // Create the compiled function
      const validateFunction = this.createValidationFunction(validationCode);
      
      return {
        validate: validateFunction,
        checksum: this.generateChecksum(validationCode),
        createdAt: Date.now(),
      };
    } finally {
      const compilationTime = performance.now() - startTime;
      this.stats.compilationTime += compilationTime;
      this.logger.debug(`Compiled ${validationType} validator in ${compilationTime.toFixed(2)}ms`);
    }
  }

  private compileTrustedValidator(): string {
    return `
      function validateTrusted(manifest) {
        const errors = [];
        const warnings = [];
        
        // Critical fields only for trusted plugins
        if (!manifest.name) errors.push('Missing required field: name');
        if (!manifest.version) errors.push('Missing required field: version');
        
        // Quick format checks
        if (manifest.name && !/^[a-z0-9-_]+$/.test(manifest.name)) {
          errors.push('Invalid plugin name format');
        }
        
        if (manifest.version && !/^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9-]+)?$/.test(manifest.version)) {
          errors.push('Invalid version format');
        }
        
        return {
          isValid: errors.length === 0,
          errors,
          warnings
        };
      }
    `;
  }

  private compileEssentialValidator(): string {
    return `
      function validateEssential(manifest) {
        const errors = [];
        const warnings = [];
        
        // Required fields
        const requiredFields = ['name', 'version', 'description', 'author', 'license'];
        for (const field of requiredFields) {
          if (!manifest[field]) {
            errors.push(\`Missing required field: \${field}\`);
          }
        }
        
        // Basic format validation
        if (manifest.name && !/^[a-z0-9-_]+$/.test(manifest.name)) {
          errors.push('Plugin name must contain only lowercase letters, numbers, hyphens, and underscores');
        }
        
        if (manifest.version && !/^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9-]+)?$/.test(manifest.version)) {
          errors.push('Version must follow semantic versioning (e.g., 1.0.0)');
        }
        
        // Dependencies validation
        if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
          for (const dep of manifest.dependencies) {
            if (typeof dep !== 'string' || !dep.trim()) {
              errors.push('All dependencies must be non-empty strings');
              break;
            }
          }
        }
        
        // Load order validation
        if (manifest.loadOrder !== undefined) {
          if (!Number.isInteger(manifest.loadOrder) || manifest.loadOrder < 0) {
            errors.push('Load order must be a non-negative integer');
          }
        }
        
        return {
          isValid: errors.length === 0,
          errors,
          warnings
        };
      }
    `;
  }

  private compileFullValidator(): string {
    return `
      function validateFull(manifest) {
        const errors = [];
        const warnings = [];
        
        // Required fields check
        const requiredFields = ['name', 'version', 'description', 'author', 'license'];
        for (const field of requiredFields) {
          if (!manifest[field]) {
            errors.push(\`Missing required field: \${field}\`);
          }
        }
        
        // Name format validation
        if (manifest.name && !/^[a-z0-9-_]+$/.test(manifest.name)) {
          errors.push('Plugin name must contain only lowercase letters, numbers, hyphens, and underscores');
        }
        
        // Version format validation
        if (manifest.version && !/^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9-]+)?$/.test(manifest.version)) {
          errors.push('Version must follow semantic versioning (e.g., 1.0.0)');
        }
        
        // Dependencies validation
        if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
          for (const dep of manifest.dependencies) {
            if (typeof dep !== 'string' || !dep.trim()) {
              errors.push('All dependencies must be non-empty strings');
              break;
            }
          }
        }
        
        // Load order validation
        if (manifest.loadOrder !== undefined) {
          if (!Number.isInteger(manifest.loadOrder) || manifest.loadOrder < 0) {
            errors.push('Load order must be a non-negative integer');
          }
        }
        
        // Module configuration validation
        if (manifest.module) {
          const moduleValidation = validateModuleConfiguration(manifest.module);
          errors.push(...moduleValidation.errors);
          warnings.push(...moduleValidation.warnings);
        }
        
        // Security configuration validation
        if (manifest.security) {
          const securityValidation = validateSecurityConfiguration(manifest.security);
          errors.push(...securityValidation.errors);
          warnings.push(...securityValidation.warnings);
        }
        
        return {
          isValid: errors.length === 0,
          errors,
          warnings
        };
        
        // Helper functions
        function validateModuleConfiguration(module) {
          const modErrors = [];
          const modWarnings = [];
          
          // Validate array fields
          const arrayFields = ['controllers', 'providers', 'exports', 'imports'];
          for (const field of arrayFields) {
            if (module[field] !== undefined) {
              if (!Array.isArray(module[field])) {
                modErrors.push(\`Module \${field} must be an array\`);
              } else {
                for (const item of module[field]) {
                  if (typeof item !== 'string' || !item.trim()) {
                    modErrors.push(\`All \${field} entries must be non-empty strings\`);
                    break;
                  }
                }
              }
            }
          }
          
          // Guards validation (simplified for performance)
          if (module.guards !== undefined && !Array.isArray(module.guards)) {
            modErrors.push('Module guards must be an array');
          }
          
          return {
            errors: modErrors,
            warnings: modWarnings
          };
        }
        
        function validateSecurityConfiguration(security) {
          const secErrors = [];
          const secWarnings = [];
          
          // Trust level validation
          if (!security.trustLevel || typeof security.trustLevel !== 'string') {
            secErrors.push('Security trustLevel is required and must be a string');
          } else if (!['internal', 'verified', 'community'].includes(security.trustLevel)) {
            secErrors.push('Invalid trust level - must be internal, verified, or community');
          }
          
          // Checksum validation
          if (security.checksum) {
            if (!security.checksum.algorithm || !security.checksum.hash) {
              secErrors.push('Checksum must include both algorithm and hash');
            } else {
              if (!['sha256', 'sha512', 'md5'].includes(security.checksum.algorithm)) {
                secErrors.push('Checksum algorithm must be sha256, sha512, or md5');
              }
              
              if (security.checksum.algorithm === 'md5') {
                secWarnings.push('MD5 is cryptographically weak - consider using SHA-256 or SHA-512');
              }
            }
          }
          
          return {
            errors: secErrors,
            warnings: secWarnings
          };
        }
      }
    `;
  }

  private createValidationFunction(validationCode: string): (manifest: any) => PluginValidationResult {
    try {
      // Create a safe evaluation context
      const context = {
        Number: Number,
        Array: Array,
        Object: Object,
        String: String,
        RegExp: RegExp,
        parseInt: parseInt,
        isInteger: Number.isInteger,
      };
      
      // Compile the function
      const compiledFunction = new Function(
        ...Object.keys(context),
        `
        ${validationCode}
        
        return function(manifest) {
          return validateTrusted ? validateTrusted(manifest) : 
                 validateEssential ? validateEssential(manifest) :
                 validateFull(manifest);
        };
        `
      )(...Object.values(context));
      
      return compiledFunction;
    } catch (error) {
      this.logger.error('Failed to compile validation function:', error);
      // Fallback to a simple validator
      return this.createFallbackValidator();
    }
  }

  private createFallbackValidator(): (manifest: any) => PluginValidationResult {
    return (manifest: any): PluginValidationResult => {
      const errors: string[] = [];
      
      // Basic validation as fallback
      const requiredFields = ['name', 'version', 'description', 'author', 'license'];
      for (const field of requiredFields) {
        if (!manifest[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings: ['Using fallback validator due to compilation error'],
      };
    };
  }

  private generateChecksum(content: string): string {
    // Simple hash for tracking compilation versions
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private updateValidationStats(validationTime: number): void {
    this.stats.totalValidations++;
    const totalTime = (this.stats.averageValidationTime * (this.stats.totalValidations - 1)) + validationTime;
    this.stats.averageValidationTime = totalTime / this.stats.totalValidations;
  }
}