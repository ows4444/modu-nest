import { Injectable } from '@nestjs/common';

/**
 * Configuration management for plugins
 */
export interface PluginConfigOptions {
  storageType: 'memory' | 'file' | 'database';
  encryptSensitive: boolean;
  configPath?: string;
  schemaValidation: boolean;
}

export interface PluginConfigSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, PluginConfigSchema>;
  required?: string[];
  default?: any;
  description?: string;
  sensitive?: boolean; // Mark as sensitive data
}

export interface PluginConfigValue {
  key: string;
  value: any;
  type: string;
  encrypted: boolean;
  updatedAt: string;
}

@Injectable()
export class PluginConfigManager {
  private configurations = new Map<string, Map<string, PluginConfigValue>>();

  /**
   * Set configuration value for a plugin
   */
  setConfig(pluginName: string, key: string, value: any, options?: { encrypt?: boolean }): void {
    if (!this.configurations.has(pluginName)) {
      this.configurations.set(pluginName, new Map());
    }

    const pluginConfig = this.configurations.get(pluginName)!;
    pluginConfig.set(key, {
      key,
      value: options?.encrypt ? this.encrypt(value) : value,
      type: typeof value,
      encrypted: options?.encrypt || false,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Get configuration value for a plugin
   */
  getConfig<T = any>(pluginName: string, key: string, defaultValue?: T): T | undefined {
    const pluginConfig = this.configurations.get(pluginName);
    if (!pluginConfig) return defaultValue;

    const configValue = pluginConfig.get(key);
    if (!configValue) return defaultValue;

    return configValue.encrypted ? this.decrypt(configValue.value) : configValue.value;
  }

  /**
   * Get all configurations for a plugin
   */
  getAllConfig(pluginName: string): Record<string, any> {
    const pluginConfig = this.configurations.get(pluginName);
    if (!pluginConfig) return {};

    const result: Record<string, any> = {};
    for (const [key, configValue] of pluginConfig) {
      result[key] = configValue.encrypted ? this.decrypt(configValue.value) : configValue.value;
    }
    return result;
  }

  /**
   * Delete configuration for a plugin
   */
  deleteConfig(pluginName: string, key?: string): void {
    if (!key) {
      this.configurations.delete(pluginName);
      return;
    }

    const pluginConfig = this.configurations.get(pluginName);
    if (pluginConfig) {
      pluginConfig.delete(key);
    }
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(pluginName: string, schema: PluginConfigSchema): { valid: boolean; errors: string[] } {
    const config = this.getAllConfig(pluginName);
    return this.validateValue(config, schema, pluginName);
  }

  private validateValue(value: any, schema: PluginConfigSchema, path: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Type validation
    if (schema.type && typeof value !== schema.type) {
      errors.push(`${path}: Expected ${schema.type}, got ${typeof value}`);
    }

    // Required properties validation
    if (schema.type === 'object' && schema.properties) {
      if (schema.required) {
        for (const requiredKey of schema.required) {
          if (!(requiredKey in value)) {
            errors.push(`${path}.${requiredKey}: Required property missing`);
          }
        }
      }

      // Validate nested properties
      for (const [key, nestedSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          const nestedResult = this.validateValue(value[key], nestedSchema, `${path}.${key}`);
          errors.push(...nestedResult.errors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private encrypt(value: any): string {
    // Simple base64 encoding for demonstration
    // In production, use proper encryption
    return Buffer.from(JSON.stringify(value)).toString('base64');
  }

  private decrypt(encryptedValue: string): any {
    // Simple base64 decoding for demonstration
    // In production, use proper decryption
    return JSON.parse(Buffer.from(encryptedValue, 'base64').toString());
  }
}