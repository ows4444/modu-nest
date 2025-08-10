import { FileAccessPermissions } from '@modu-nest/plugin-types';

export interface FileAccessValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class FileAccessValidator {
  private static readonly ALLOWED_EXTENSIONS = [
    '.json',
    '.txt',
    '.md',
    '.csv',
    '.log',
    '.xml',
    '.yaml',
    '.yml',
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.html',
    '.css',
    '.scss',
    '.sass',
  ];

  private static readonly MAX_FILE_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

  static validateFileAccessPermissions(permissions: FileAccessPermissions): FileAccessValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate allowed extensions
    if (permissions.allowedExtensions) {
      const invalidExtensions = permissions.allowedExtensions.filter((ext) => !ext.startsWith('.') || ext.length < 2);

      if (invalidExtensions.length > 0) {
        errors.push(`Invalid file extensions: ${invalidExtensions.join(', ')}`);
      }

      const suspiciousExtensions = permissions.allowedExtensions.filter(
        (ext) => !this.ALLOWED_EXTENSIONS.includes(ext.toLowerCase())
      );

      if (suspiciousExtensions.length > 0) {
        warnings.push(`Potentially unsafe file extensions: ${suspiciousExtensions.join(', ')}`);
      }
    }

    // Validate file size
    if (permissions.maxFileSize !== undefined) {
      if (permissions.maxFileSize < 0) {
        errors.push('Maximum file size cannot be negative');
      } else if (permissions.maxFileSize > this.MAX_FILE_SIZE_LIMIT) {
        errors.push(`Maximum file size exceeds limit of ${this.MAX_FILE_SIZE_LIMIT} bytes`);
      } else if (permissions.maxFileSize > 50 * 1024 * 1024) {
        // 50MB
        warnings.push(`Large file size limit: ${permissions.maxFileSize} bytes`);
      }
    }

    // Validate permission flags
    const hasAnyPermission =
      permissions.canRead !== false ||
      permissions.canWrite !== false ||
      permissions.canDelete !== false ||
      permissions.canList !== false;

    if (
      !hasAnyPermission &&
      permissions.canRead === false &&
      permissions.canWrite === false &&
      permissions.canDelete === false &&
      permissions.canList === false
    ) {
      warnings.push('Plugin has no file access permissions');
    }

    // Security warnings
    if (permissions.canWrite !== false && permissions.canDelete !== false) {
      warnings.push('Plugin has both write and delete permissions - ensure this is necessary');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static getDefaultFileAccessPermissions(): FileAccessPermissions {
    return {
      allowedExtensions: ['.json', '.txt', '.md', '.log'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      canRead: true,
      canWrite: true,
      canDelete: false,
      canList: true,
    };
  }

  static getRestrictedFileAccessPermissions(): FileAccessPermissions {
    return {
      allowedExtensions: ['.json', '.txt'],
      maxFileSize: 1 * 1024 * 1024, // 1MB
      canRead: true,
      canWrite: false,
      canDelete: false,
      canList: true,
    };
  }
}
