import * as path from 'path';
import { mkdir } from 'fs/promises';

/**
 * Path manipulation and file system utilities
 */

/**
 * Ensures a directory exists, creating it recursively if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Safely joins path segments and resolves to an absolute path
 */
export function safeJoin(...paths: string[]): string {
  return path.resolve(path.join(...paths));
}

/**
 * Gets the file extension from a file path
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Gets the filename without extension from a file path
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Gets the filename with extension from a file path
 */
export function getFileNameFromPath(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Removes the extension from a filename
 */
export function removeExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

/**
 * Sanitizes a file path by normalizing and removing dangerous patterns
 */
export function sanitizeFilePath(filePath: string): string {
  return path.normalize(filePath).replace(/\.\./g, '');
}

/**
 * Checks if a file path has a specific extension
 */
export function hasExtension(filePath: string, extension: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const checkExt = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return ext === checkExt;
}

/**
 * Checks if a file path has any of the specified extensions
 */
export function hasAnyExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some((ext) => hasExtension(filePath, ext));
}

/**
 * Gets the directory path from a file path
 */
export function getDirectoryPath(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Joins paths with forward slashes (useful for URLs)
 */
export function joinWithForwardSlash(...paths: string[]): string {
  return paths.join('/').replace(/\/+/g, '/');
}

/**
 * Converts backslashes to forward slashes in a path
 */
export function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Checks if a path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Makes a path relative to a base directory
 */
export function makeRelativePath(filePath: string, basePath: string): string {
  return path.relative(basePath, filePath);
}

/**
 * Resolves a path relative to a base directory
 */
export function resolveFromBase(basePath: string, relativePath: string): string {
  return path.resolve(basePath, relativePath);
}
