/**
 * Security configuration types
 */

export const SECURITY_CONFIG = 'SECURITY_CONFIG';

export interface SecurityConfig {
  // Authentication & Authorization
  jwtSecret?: string;
  jwtExpiration: string;
  refreshTokenExpiration: string;
  
  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  
  // CORS configuration
  corsOrigins: string[];
  corsCredentials: boolean;
  corsMaxAge: number;
  
  // SSL/TLS
  enableHttps: boolean;
  sslKeyPath?: string;
  sslCertPath?: string;
  
  // Security headers
  enableHelmet: boolean;
  contentSecurityPolicy: boolean;
  
  // Session security
  sessionSecret?: string;
  sessionMaxAge: number;
  sessionSecure: boolean;
  
  // File upload security
  maxFileSize: number;
  allowedFileTypes: string[];
  uploadPath: string;
  
  // API Security
  apiKeyRequired: boolean;
  apiKeyHeader: string;
  
  // Plugin security
  allowUnsignedPlugins: boolean;
  pluginTrustLevels: string[];
  
  // Database security
  encryptionKey?: string;
  hashRounds: number;
  
  // Monitoring & Logging
  enableSecurityLogging: boolean;
  logSecurityEvents: boolean;
  
  // Environment-specific flags
  debugMode: boolean;
  devToolsEnabled: boolean;
}