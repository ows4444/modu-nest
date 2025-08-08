/**
 * Configuration documentation generator
 */
export class ConfigDocumentationGenerator {
  
  /**
   * Generates comprehensive documentation for all configuration options
   */
  static generateConfigurationDocumentation(): string {
    const lines: string[] = [];
    
    lines.push('# Configuration Documentation');
    lines.push('');
    lines.push('This document describes all available configuration options for the Modu-Nest Plugin Architecture.');
    lines.push('');

    // Environment Variables Section
    this.addEnvironmentSection(lines);
    this.addSecuritySection(lines);
    this.addDatabaseSection(lines);
    this.addPluginSection(lines);
    this.addNetworkingSection(lines);
    this.addLoggingSection(lines);
    this.addFileUploadSection(lines);
    this.addSwaggerSection(lines);
    this.addExamplesSection(lines);

    return lines.join('\n');
  }

  private static addEnvironmentSection(lines: string[]): void {
    lines.push('## Core Environment Variables');
    lines.push('');
    lines.push('### NODE_ENV');
    lines.push('- **Type:** `development` | `production` | `test`');
    lines.push('- **Default:** `development`');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Application environment mode');
    lines.push('');

    lines.push('### PORT');
    lines.push('- **Type:** Number (1-65535)');
    lines.push('- **Default:** `3000`');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Application server port');
    lines.push('- **Security Note:** Ports < 1024 require elevated privileges');
    lines.push('');

    lines.push('### APP_NAME');
    lines.push('- **Type:** String (alphanumeric, hyphens, underscores, spaces)');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Application name for logging and identification');
    lines.push('');

    lines.push('### HOST');
    lines.push('- **Type:** String (valid hostname or IP)');
    lines.push('- **Default:** `localhost`');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Application host address');
    lines.push('');

    lines.push('### API_PREFIX');
    lines.push('- **Type:** String (should start with "/")');
    lines.push('- **Default:** None');
    lines.push('- **Required:** No');
    lines.push('- **Description:** API route prefix');
    lines.push('');
  }

  private static addSecuritySection(lines: string[]): void {
    lines.push('## Security Configuration');
    lines.push('');

    lines.push('### Authentication & Authorization');
    lines.push('');
    lines.push('#### JWT_SECRET');
    lines.push('- **Type:** String (minimum 32 characters in production)');
    lines.push('- **Required:** Yes (in production)');
    lines.push('- **Description:** Secret key for JWT token signing');
    lines.push('- **Security:** Must be cryptographically secure');
    lines.push('');

    lines.push('#### JWT_EXPIRATION');
    lines.push('- **Type:** String (format: "1h", "30m", "7d")');
    lines.push('- **Default:** `1h`');
    lines.push('- **Description:** JWT token expiration time');
    lines.push('');

    lines.push('#### REFRESH_TOKEN_EXPIRATION');
    lines.push('- **Type:** String (format: "1h", "30m", "7d")');
    lines.push('- **Default:** `7d`');
    lines.push('- **Description:** Refresh token expiration time');
    lines.push('');

    lines.push('### CORS Configuration');
    lines.push('');
    lines.push('#### CORS_ORIGINS');
    lines.push('- **Type:** Comma-separated URLs');
    lines.push('- **Default:** `http://localhost:3000`');
    lines.push('- **Description:** Allowed CORS origins');
    lines.push('- **Security:** Never use "*" in production');
    lines.push('');

    lines.push('#### CORS_CREDENTIALS');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `false`');
    lines.push('- **Description:** Allow credentials in CORS requests');
    lines.push('');

    lines.push('### SSL/TLS Configuration');
    lines.push('');
    lines.push('#### ENABLE_HTTPS');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `false`');
    lines.push('- **Description:** Enable HTTPS server');
    lines.push('');

    lines.push('#### SSL_KEY_PATH');
    lines.push('- **Type:** String (file path)');
    lines.push('- **Required:** Yes (when HTTPS enabled)');
    lines.push('- **Description:** Path to SSL private key file');
    lines.push('');

    lines.push('#### SSL_CERT_PATH');
    lines.push('- **Type:** String (file path)');
    lines.push('- **Required:** Yes (when HTTPS enabled)');
    lines.push('- **Description:** Path to SSL certificate file');
    lines.push('');

    lines.push('### Rate Limiting');
    lines.push('');
    lines.push('#### RATE_LIMIT_WINDOW_MS');
    lines.push('- **Type:** Number (60000-3600000)');
    lines.push('- **Default:** `900000` (15 minutes)');
    lines.push('- **Description:** Rate limiting time window in milliseconds');
    lines.push('');

    lines.push('#### RATE_LIMIT_MAX_REQUESTS');
    lines.push('- **Type:** Number (1-10000)');
    lines.push('- **Default:** `100`');
    lines.push('- **Description:** Maximum requests per time window');
    lines.push('');
  }

  private static addDatabaseSection(lines: string[]): void {
    lines.push('## Database Configuration');
    lines.push('');

    lines.push('### Connection Settings');
    lines.push('');
    lines.push('#### DB_HOST');
    lines.push('- **Type:** String');
    lines.push('- **Default:** `localhost`');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Database host address');
    lines.push('');

    lines.push('#### DB_PORT');
    lines.push('- **Type:** Number (1-65535)');
    lines.push('- **Default:** `5432`');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Database port');
    lines.push('');

    lines.push('#### DB_USERNAME');
    lines.push('- **Type:** String');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Database username');
    lines.push('');

    lines.push('#### DB_PASSWORD');
    lines.push('- **Type:** String');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Database password');
    lines.push('- **Security:** Should be stored securely');
    lines.push('');

    lines.push('#### DB_DATABASE');
    lines.push('- **Type:** String');
    lines.push('- **Required:** Yes');
    lines.push('- **Description:** Database name');
    lines.push('');

    lines.push('### Connection Pool');
    lines.push('');
    lines.push('#### DB_POOL_MIN');
    lines.push('- **Type:** Number (1-20)');
    lines.push('- **Default:** `2`');
    lines.push('- **Description:** Minimum connection pool size');
    lines.push('');

    lines.push('#### DB_POOL_MAX');
    lines.push('- **Type:** Number (5-100, must be > DB_POOL_MIN)');
    lines.push('- **Default:** `10`');
    lines.push('- **Description:** Maximum connection pool size');
    lines.push('- **Production Note:** Should be at least 5 for production');
    lines.push('');

    lines.push('### SSL Configuration');
    lines.push('');
    lines.push('#### DB_SSL');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `false`');
    lines.push('- **Description:** Enable database SSL connection');
    lines.push('- **Production:** Should be `true` in production');
    lines.push('');

    lines.push('### Backup Configuration');
    lines.push('');
    lines.push('#### DB_ENABLE_BACKUP');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `true`');
    lines.push('- **Description:** Enable automatic database backups');
    lines.push('');

    lines.push('#### DB_BACKUP_SCHEDULE');
    lines.push('- **Type:** String (cron expression)');
    lines.push('- **Default:** `0 2 * * *` (daily at 2 AM)');
    lines.push('- **Description:** Backup schedule in cron format');
    lines.push('');
  }

  private static addPluginSection(lines: string[]): void {
    lines.push('## Plugin System Configuration');
    lines.push('');

    lines.push('#### ALLOW_UNSIGNED_PLUGINS');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `true` (development), `false` (production)');
    lines.push('- **Description:** Allow loading of unsigned plugins');
    lines.push('- **Security:** Must be `false` in production');
    lines.push('');

    lines.push('#### PLUGIN_TRUST_LEVELS');
    lines.push('- **Type:** Comma-separated values ("internal", "verified", "community")');
    lines.push('- **Default:** `internal,verified,community`');
    lines.push('- **Description:** Allowed plugin trust levels');
    lines.push('');

    lines.push('#### PLUGINS_DIR');
    lines.push('- **Type:** String (safe file path)');
    lines.push('- **Default:** `./plugins`');
    lines.push('- **Description:** Directory for plugin storage');
    lines.push('- **Security:** Must not contain ".." or "~"');
    lines.push('');

    lines.push('#### PLUGIN_LOAD_TIMEOUT');
    lines.push('- **Type:** Number (milliseconds)');
    lines.push('- **Default:** `30000`');
    lines.push('- **Description:** Plugin loading timeout');
    lines.push('');

    lines.push('#### MAX_PLUGIN_SIZE');
    lines.push('- **Type:** Number (bytes)');
    lines.push('- **Default:** `52428800` (50MB)');
    lines.push('- **Description:** Maximum plugin file size');
    lines.push('');
  }

  private static addNetworkingSection(lines: string[]): void {
    lines.push('## Networking Configuration');
    lines.push('');

    lines.push('#### API_KEY_REQUIRED');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `false`');
    lines.push('- **Description:** Require API key for requests');
    lines.push('');

    lines.push('#### API_KEY_HEADER');
    lines.push('- **Type:** String');
    lines.push('- **Default:** `X-API-Key`');
    lines.push('- **Description:** HTTP header name for API key');
    lines.push('');
  }

  private static addLoggingSection(lines: string[]): void {
    lines.push('## Logging Configuration');
    lines.push('');

    lines.push('#### DEBUG_MODE');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `false`');
    lines.push('- **Description:** Enable debug logging');
    lines.push('- **Security:** Must be `false` in production');
    lines.push('');

    lines.push('#### LOG_SECURITY_EVENTS');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `true`');
    lines.push('- **Description:** Log security-related events');
    lines.push('');

    lines.push('#### ENABLE_SECURITY_LOGGING');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `true`');
    lines.push('- **Description:** Enable structured security logging');
    lines.push('');
  }

  private static addFileUploadSection(lines: string[]): void {
    lines.push('## File Upload Configuration');
    lines.push('');

    lines.push('#### MAX_FILE_SIZE');
    lines.push('- **Type:** Number (bytes, max 100MB)');
    lines.push('- **Default:** `10485760` (10MB)');
    lines.push('- **Description:** Maximum file upload size');
    lines.push('');

    lines.push('#### ALLOWED_FILE_TYPES');
    lines.push('- **Type:** Comma-separated file extensions');
    lines.push('- **Default:** `.jpg,.jpeg,.png,.pdf,.txt,.json`');
    lines.push('- **Description:** Allowed file upload extensions');
    lines.push('');

    lines.push('#### UPLOAD_PATH');
    lines.push('- **Type:** String (safe file path)');
    lines.push('- **Default:** `./uploads`');
    lines.push('- **Description:** Directory for file uploads');
    lines.push('');
  }

  private static addSwaggerSection(lines: string[]): void {
    lines.push('## API Documentation (Swagger)');
    lines.push('');

    lines.push('#### ENABLE_SWAGGER');
    lines.push('- **Type:** Boolean');
    lines.push('- **Default:** `true` (development), `false` (production)');
    lines.push('- **Description:** Enable Swagger API documentation');
    lines.push('');
  }

  private static addExamplesSection(lines: string[]): void {
    lines.push('## Configuration Examples');
    lines.push('');

    lines.push('### Development (.env.development)');
    lines.push('```env');
    lines.push('NODE_ENV=development');
    lines.push('PORT=4001');
    lines.push('APP_NAME=Modu-Nest Plugin Host');
    lines.push('HOST=localhost');
    lines.push('API_PREFIX=/api');
    lines.push('');
    lines.push('# Security (development)');
    lines.push('JWT_SECRET=development-secret-key-change-in-production');
    lines.push('JWT_EXPIRATION=1h');
    lines.push('CORS_ORIGINS=http://localhost:3000,http://localhost:4200');
    lines.push('ALLOW_UNSIGNED_PLUGINS=true');
    lines.push('DEBUG_MODE=true');
    lines.push('');
    lines.push('# Database (development)');
    lines.push('DB_HOST=localhost');
    lines.push('DB_PORT=5432');
    lines.push('DB_USERNAME=plugin_user');
    lines.push('DB_PASSWORD=plugin_password');
    lines.push('DB_DATABASE=plugin_registry');
    lines.push('DB_SSL=false');
    lines.push('DB_LOG_QUERIES=true');
    lines.push('```');
    lines.push('');

    lines.push('### Production (.env.production)');
    lines.push('```env');
    lines.push('NODE_ENV=production');
    lines.push('PORT=4001');
    lines.push('APP_NAME=Modu-Nest Plugin Host');
    lines.push('HOST=0.0.0.0');
    lines.push('API_PREFIX=/api');
    lines.push('');
    lines.push('# Security (production)');
    lines.push('JWT_SECRET=${SECURE_JWT_SECRET}');
    lines.push('SESSION_SECRET=${SECURE_SESSION_SECRET}');
    lines.push('ENCRYPTION_KEY=${SECURE_ENCRYPTION_KEY}');
    lines.push('JWT_EXPIRATION=15m');
    lines.push('REFRESH_TOKEN_EXPIRATION=7d');
    lines.push('CORS_ORIGINS=https://yourapp.com');
    lines.push('ALLOW_UNSIGNED_PLUGINS=false');
    lines.push('DEBUG_MODE=false');
    lines.push('');
    lines.push('# HTTPS');
    lines.push('ENABLE_HTTPS=true');
    lines.push('SSL_KEY_PATH=/etc/ssl/private/yourapp.key');
    lines.push('SSL_CERT_PATH=/etc/ssl/certs/yourapp.crt');
    lines.push('');
    lines.push('# Database (production)');
    lines.push('DB_HOST=${DB_HOST}');
    lines.push('DB_PORT=5432');
    lines.push('DB_USERNAME=${DB_USERNAME}');
    lines.push('DB_PASSWORD=${DB_PASSWORD}');
    lines.push('DB_DATABASE=${DB_DATABASE}');
    lines.push('DB_SSL=true');
    lines.push('DB_LOG_QUERIES=false');
    lines.push('DB_POOL_MIN=5');
    lines.push('DB_POOL_MAX=25');
    lines.push('```');
    lines.push('');

    lines.push('## Security Best Practices');
    lines.push('');
    lines.push('1. **Never hardcode secrets** - Use environment variables or secret management systems');
    lines.push('2. **Use HTTPS in production** - Enable SSL/TLS for all connections');
    lines.push('3. **Restrict CORS origins** - Never use "*" in production environments');
    lines.push('4. **Enable database SSL** - Encrypt database connections in production');
    lines.push('5. **Disable debug modes** - Turn off debug logging and dev tools in production');
    lines.push('6. **Use signed plugins only** - Disable unsigned plugins in production');
    lines.push('7. **Implement proper logging** - Enable security event logging');
    lines.push('8. **Regular security audits** - Review configuration settings regularly');
    lines.push('9. **Use strong secrets** - Minimum 32 characters for JWT and session secrets');
    lines.push('10. **Implement rate limiting** - Protect against abuse and DoS attacks');
    lines.push('');

    lines.push('## Validation and Testing');
    lines.push('');
    lines.push('The configuration system includes comprehensive validation that:');
    lines.push('- Checks required variables are present');
    lines.push('- Validates data types and formats');
    lines.push('- Enforces security requirements by environment');
    lines.push('- Provides detailed error messages for misconfigurations');
    lines.push('- Generates warnings and recommendations');
    lines.push('');

    lines.push('Use the built-in validation tools to verify your configuration:');
    lines.push('```typescript');
    lines.push('import { ConfigValidator } from "@modu-nest/config";');
    lines.push('');
    lines.push('const result = ConfigValidator.validateConfiguration(process.env);');
    lines.push('console.log(ConfigValidator.generateReport(result));');
    lines.push('```');
    lines.push('');
  }
}