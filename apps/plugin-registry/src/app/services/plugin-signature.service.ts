import { Injectable, Logger } from '@nestjs/common';
import { createVerify, createHash } from 'crypto';
import {
  PluginSecurityError,
  PluginValidationError,
  PluginErrorMetrics,
  PluginSecurity,
  PluginManifest,
} from '@modu-nest/plugin-types';

export interface SignatureValidationResult {
  isValid: boolean;
  trustLevel: 'internal' | 'verified' | 'community';
  errors: string[];
  warnings: string[];
  verified?: boolean;
  algorithm?: string;
}

export interface SigningKeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
}

export interface TrustedPublicKey {
  key: string;
  algorithm: string;
  issuer: string;
  trustLevel: 'internal' | 'verified';
  validFrom: Date;
  validUntil?: Date;
}

@Injectable()
export class PluginSignatureService {
  private readonly logger = new Logger(PluginSignatureService.name);
  private errorMetrics = PluginErrorMetrics.getInstance();

  // Configuration from environment variables
  private readonly REQUIRE_SIGNATURES = process.env.REQUIRE_PLUGIN_SIGNATURES === 'true';
  private readonly ALLOW_UNSIGNED_PLUGINS = process.env.ALLOW_UNSIGNED_PLUGINS === 'true';
  private readonly SIGNATURE_ALGORITHMS = ['RS256', 'RS512', 'ES256', 'ES512'];
  private readonly DEFAULT_ALGORITHM = 'RS256';

  // Trusted public keys registry (in production, this would be from a database or key management service)
  private readonly trustedKeys: Map<string, TrustedPublicKey> = new Map();

  constructor() {
    this.initializeTrustedKeys();
    this.logger.log(
      `Plugin signature verification initialized: requireSignatures=${this.REQUIRE_SIGNATURES}, allowUnsigned=${this.ALLOW_UNSIGNED_PLUGINS}`
    );
  }

  /**
   * Initialize trusted public keys from environment or configuration
   */
  private initializeTrustedKeys(): void {
    // Example: Load trusted keys from environment variables or configuration file
    // In production, this would typically load from a secure key management service
    const trustedKeysConfig = process.env.TRUSTED_PLUGIN_KEYS;

    if (trustedKeysConfig) {
      try {
        const keys = JSON.parse(trustedKeysConfig) as TrustedPublicKey[];
        keys.forEach((key) => {
          this.trustedKeys.set(key.issuer, {
            ...key,
            validFrom: new Date(key.validFrom),
            validUntil: key.validUntil ? new Date(key.validUntil) : undefined,
          });
        });
        this.logger.log(`Loaded ${keys.length} trusted public keys`);
      } catch (error) {
        this.logger.error('Failed to parse trusted keys configuration:', error);
      }
    }

    // Add default development key if no keys are configured
    if (this.trustedKeys.size === 0 && process.env.NODE_ENV === 'development') {
      this.addDevelopmentTrustedKey();
    }
  }

  /**
   * Add a development trusted key for testing purposes
   */
  private addDevelopmentTrustedKey(): void {
    const devKey: TrustedPublicKey = {
      key: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdef...
-----END PUBLIC KEY-----`,
      algorithm: 'RS256',
      issuer: 'development',
      trustLevel: 'internal',
      validFrom: new Date(),
    };

    this.trustedKeys.set('development', devKey);
    this.logger.warn('Using development trusted key - NOT FOR PRODUCTION USE');
  }

  /**
   * Validate plugin signature according to security policy
   */
  async validatePluginSignature(pluginBuffer: Buffer, manifest: PluginManifest): Promise<SignatureValidationResult> {
    const pluginName = manifest.name;

    try {
      // Check if plugin has security configuration
      if (!manifest.security) {
        return this.handleUnsignedPlugin(pluginName);
      }

      const security = manifest.security;

      // Validate signature if present
      if (security.signature) {
        return await this.verifySignature(pluginBuffer, security, pluginName);
      }

      // Handle unsigned plugins
      return this.handleUnsignedPlugin(pluginName, security.trustLevel);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const signatureError = new PluginSecurityError(
        pluginName,
        [`Signature validation failed: ${errorMessage}`],
        'high'
      );
      this.errorMetrics.recordError(signatureError, {
        pluginName,
        operation: 'signature-validation',
      });

      return {
        isValid: false,
        trustLevel: 'community',
        errors: [signatureError.message],
        warnings: [],
      };
    }
  }

  /**
   * Handle unsigned plugins based on security policy
   */
  private handleUnsignedPlugin(
    pluginName: string,
    trustLevel: 'internal' | 'verified' | 'community' = 'community'
  ): SignatureValidationResult {
    if (this.REQUIRE_SIGNATURES && !this.ALLOW_UNSIGNED_PLUGINS) {
      const error = new PluginSecurityError(pluginName, ['Plugin signature is required but missing'], 'high');
      this.errorMetrics.recordError(error, {
        pluginName,
        operation: 'signature-requirement-check',
      });

      return {
        isValid: false,
        trustLevel: 'community',
        errors: [error.message],
        warnings: [],
      };
    }

    const warnings = [];
    if (!this.ALLOW_UNSIGNED_PLUGINS) {
      warnings.push('Plugin is unsigned - use with caution');
    }

    this.logger.warn(`Allowing unsigned plugin: ${pluginName} (trustLevel: ${trustLevel})`);

    return {
      isValid: true,
      trustLevel,
      errors: [],
      warnings,
    };
  }

  /**
   * Verify cryptographic signature of plugin
   */
  private async verifySignature(
    pluginBuffer: Buffer,
    security: PluginSecurity,
    pluginName: string
  ): Promise<SignatureValidationResult> {
    if (!security.signature) {
      throw new Error('Signature configuration is missing');
    }

    const { algorithm, publicKey, signature } = security.signature;

    // Validate algorithm
    if (!this.SIGNATURE_ALGORITHMS.includes(algorithm)) {
      throw new PluginValidationError(pluginName, [
        `Unsupported signature algorithm: ${algorithm}. Supported: ${this.SIGNATURE_ALGORITHMS.join(', ')}`,
      ]);
    }

    // Find trusted key or validate provided key
    const trustedKey = this.findTrustedKey(publicKey);
    let actualTrustLevel: 'internal' | 'verified' | 'community' = 'community';
    const warnings: string[] = [];

    if (trustedKey) {
      // Validate key expiration
      if (trustedKey.validUntil && new Date() > trustedKey.validUntil) {
        throw new PluginSecurityError(pluginName, ['Trusted key has expired'], 'high');
      }

      actualTrustLevel = trustedKey.trustLevel;
      this.logger.debug(`Using trusted key from issuer: ${trustedKey.issuer}`);
    } else {
      warnings.push('Plugin uses untrusted public key - signature verified but trust level is community');
      this.logger.warn(`Plugin ${pluginName} uses untrusted public key`);
    }

    // Calculate plugin content hash
    const pluginHash = await this.calculatePluginHash(pluginBuffer);

    // Verify signature
    const verify = createVerify(this.mapAlgorithmToCrypto(algorithm));
    verify.update(pluginHash);
    verify.end();

    const isSignatureValid = verify.verify(publicKey, signature, 'base64');

    if (!isSignatureValid) {
      throw new PluginSecurityError(
        pluginName,
        ['Plugin signature verification failed - signature is invalid'],
        'high'
      );
    }

    this.logger.log(`Plugin signature verified successfully: ${pluginName} (trustLevel: ${actualTrustLevel})`);

    return {
      isValid: true,
      trustLevel: actualTrustLevel,
      errors: [],
      warnings,
    };
  }

  /**
   * Calculate hash of plugin content for signature verification
   */
  private async calculatePluginHash(pluginBuffer: Buffer): Promise<string> {
    // Create hash of the plugin content
    const hash = createHash('sha256');
    hash.update(new Uint8Array(pluginBuffer));
    return hash.digest('hex');
  }

  /**
   * Find trusted public key by key content or issuer
   */
  private findTrustedKey(publicKey: string): TrustedPublicKey | null {
    // First try to find by exact key match
    for (const [, trustedKey] of this.trustedKeys) {
      if (trustedKey.key === publicKey) {
        return trustedKey;
      }
    }

    // Could also implement key fingerprint matching here
    return null;
  }

  /**
   * Map signature algorithm to crypto module algorithm
   */
  private mapAlgorithmToCrypto(algorithm: string): string {
    const algorithmMap: Record<string, string> = {
      RS256: 'RSA-SHA256',
      RS512: 'RSA-SHA512',
      ES256: 'sha256',
      ES512: 'sha512',
    };

    return algorithmMap[algorithm] || 'RSA-SHA256';
  }

  /**
   * Generate a new key pair for signing (utility method for development)
   */
  generateKeyPair(algorithm: string = this.DEFAULT_ALGORITHM): SigningKeyPair {
    const { generateKeyPairSync } = require('crypto');

    let keyOptions: any;

    if (algorithm.startsWith('RS')) {
      keyOptions = {
        type: 'rsa',
        options: {
          modulusLength: algorithm === 'RS512' ? 4096 : 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        },
      };
    } else if (algorithm.startsWith('ES')) {
      keyOptions = {
        type: 'ec',
        options: {
          namedCurve: algorithm === 'ES512' ? 'secp521r1' : 'prime256v1',
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        },
      };
    } else {
      throw new Error(`Unsupported algorithm for key generation: ${algorithm}`);
    }

    const { publicKey, privateKey } = generateKeyPairSync(keyOptions.type, keyOptions.options);

    return {
      publicKey,
      privateKey,
      algorithm,
    };
  }

  /**
   * Sign plugin content with private key (utility method for plugin developers)
   */
  signPluginContent(pluginBuffer: Buffer, privateKey: string, algorithm: string = this.DEFAULT_ALGORITHM): string {
    const pluginHash = createHash('sha256').update(pluginBuffer).digest('hex');

    const sign = require('crypto').createSign(this.mapAlgorithmToCrypto(algorithm));
    sign.update(pluginHash);
    sign.end();

    return sign.sign(privateKey, 'base64');
  }

  /**
   * Add a trusted public key to the registry
   */
  addTrustedKey(key: TrustedPublicKey): void {
    this.trustedKeys.set(key.issuer, key);
    this.logger.log(`Added trusted key for issuer: ${key.issuer} (trustLevel: ${key.trustLevel})`);
  }

  /**
   * Remove a trusted public key from the registry
   */
  removeTrustedKey(issuer: string): boolean {
    const removed = this.trustedKeys.delete(issuer);
    if (removed) {
      this.logger.log(`Removed trusted key for issuer: ${issuer}`);
    }
    return removed;
  }

  /**
   * Get list of trusted keys (for administrative purposes)
   */
  getTrustedKeys(): TrustedPublicKey[] {
    return Array.from(this.trustedKeys.values());
  }

  /**
   * Get signature verification statistics
   */
  getSignatureStats(): {
    requireSignatures: boolean;
    allowUnsignedPlugins: boolean;
    supportedAlgorithms: string[];
    trustedKeysCount: number;
  } {
    return {
      requireSignatures: this.REQUIRE_SIGNATURES,
      allowUnsignedPlugins: this.ALLOW_UNSIGNED_PLUGINS,
      supportedAlgorithms: [...this.SIGNATURE_ALGORITHMS],
      trustedKeysCount: this.trustedKeys.size,
    };
  }
}
