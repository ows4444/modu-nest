/**
 * File size and format utilities
 *
 * This module provides utilities for working with file sizes, including
 * formatting bytes to human-readable strings, parsing size strings back
 * to bytes, and performing size-related validations and calculations.
 *
 * @fileoverview File size utilities with comprehensive formatting and validation
 * @version 1.0.0
 * @author Plugin System
 * @since 1.0.0
 */

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * Converts a numeric byte value into a human-readable string using
 * appropriate units (B, KB, MB, GB, TB, PB). Uses base 1024 for
 * binary calculations as commonly expected in computing contexts.
 *
 * @param {number} bytes - The file size in bytes (must be non-negative)
 *
 * @returns {string} A formatted string with size and appropriate unit
 *
 * @example
 * // Format various file sizes
 * console.log(formatFileSize(0)); // '0 B'
 * console.log(formatFileSize(512)); // '512 B'
 * console.log(formatFileSize(1024)); // '1.0 KB'
 * console.log(formatFileSize(1536)); // '1.5 KB'
 * console.log(formatFileSize(1048576)); // '1.0 MB'
 * console.log(formatFileSize(1073741824)); // '1.0 GB'
 *
 * @example
 * * // Large file sizes
 * * const largeFile = 5.5 * 1024 * 1024 * 1024; // 5.5 GB
 * * console.log(formatFileSize(largeFile)); // '5.5 GB'
 * *
 * * @example
 * * // Very small sizes remain as bytes
 * * console.log(formatFileSize(1)); // '1 B'
 * * console.log(formatFileSize(1023)); // '1023 B'
 * *
 * * @since 1.0.0
 * */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formattedSize = unitIndex === 0 ? size : size.toFixed(1);
  return `${formattedSize} ${units[unitIndex]}`;
}

/**
 * Converts a file size string back to bytes
 */
export function parseFileSize(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
    PB: 1024 * 1024 * 1024 * 1024 * 1024,
  };

  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Z]{1,2})$/i);
  if (!match) {
    throw new Error(`Invalid file size format: ${sizeStr}`);
  }

  const [, sizeValue, unit] = match;
  const multiplier = units[unit.toUpperCase()];

  if (!multiplier) {
    throw new Error(`Unknown file size unit: ${unit}`);
  }

  return Math.round(parseFloat(sizeValue) * multiplier);
}

/**
 * Checks if a file size is within acceptable limits
 */
export function isFileSizeValid(bytes: number, maxBytes: number): boolean {
  return bytes > 0 && bytes <= maxBytes;
}

/**
 * Gets a human-readable description of file size limits
 */
export function getFileSizeDescription(maxBytes: number): string {
  return `Maximum file size: ${formatFileSize(maxBytes)}`;
}

/**
 * Calculates the percentage of used space
 */
export function calculateUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

/**
 * Gets file size category for display purposes
 */
export function getFileSizeCategory(bytes: number): 'small' | 'medium' | 'large' | 'huge' {
  if (bytes < 1024 * 1024) return 'small'; // < 1MB
  if (bytes < 10 * 1024 * 1024) return 'medium'; // < 10MB
  if (bytes < 100 * 1024 * 1024) return 'large'; // < 100MB
  return 'huge'; // >= 100MB
}

/**
 * Estimates download time for a given file size and connection speed
 */
export function estimateDownloadTime(
  bytes: number,
  speedBytesPerSecond: number
): {
  seconds: number;
  humanReadable: string;
} {
  if (speedBytesPerSecond <= 0) {
    return { seconds: Infinity, humanReadable: 'Unknown' };
  }

  const seconds = bytes / speedBytesPerSecond;

  if (seconds < 60) {
    return { seconds, humanReadable: `${Math.ceil(seconds)} seconds` };
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return { seconds, humanReadable: `${minutes} minute${minutes > 1 ? 's' : ''}` };
  } else {
    const hours = Math.ceil(seconds / 3600);
    return { seconds, humanReadable: `${hours} hour${hours > 1 ? 's' : ''}` };
  }
}
