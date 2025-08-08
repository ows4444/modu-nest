/**
 * Date and time utilities
 */

/**
 * Gets the current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Formats a date as ISO string
 */
export function formatDateTime(date: Date): string {
  return date.toISOString();
}

/**
 * Formats a date as a readable string
 */
export function formatDateReadable(date: Date): string {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Adds milliseconds to a date
 */
export function addMilliseconds(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

/**
 * Adds seconds to a date
 */
export function addSeconds(date: Date, seconds: number): Date {
  return addMilliseconds(date, seconds * 1000);
}

/**
 * Adds minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return addMilliseconds(date, minutes * 60 * 1000);
}

/**
 * Adds hours to a date
 */
export function addHours(date: Date, hours: number): Date {
  return addMilliseconds(date, hours * 60 * 60 * 1000);
}

/**
 * Adds days to a date
 */
export function addDays(date: Date, days: number): Date {
  return addMilliseconds(date, days * 24 * 60 * 60 * 1000);
}

/**
 * Checks if a timestamp is expired based on TTL
 */
export function isExpired(timestamp: number, ttlMs: number): boolean {
  return Date.now() >= (timestamp + ttlMs);
}

/**
 * Calculates the difference between two dates in milliseconds
 */
export function dateDiffMs(date1: Date, date2: Date): number {
  return Math.abs(date1.getTime() - date2.getTime());
}

/**
 * Calculates the difference between two dates in seconds
 */
export function dateDiffSeconds(date1: Date, date2: Date): number {
  return Math.floor(dateDiffMs(date1, date2) / 1000);
}

/**
 * Calculates the difference between two dates in minutes
 */
export function dateDiffMinutes(date1: Date, date2: Date): number {
  return Math.floor(dateDiffMs(date1, date2) / (1000 * 60));
}

/**
 * Calculates the difference between two dates in hours
 */
export function dateDiffHours(date1: Date, date2: Date): number {
  return Math.floor(dateDiffMs(date1, date2) / (1000 * 60 * 60));
}

/**
 * Calculates the difference between two dates in days
 */
export function dateDiffDays(date1: Date, date2: Date): number {
  return Math.floor(dateDiffMs(date1, date2) / (1000 * 60 * 60 * 24));
}

/**
 * Gets the start of the day for a given date
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Gets the end of the day for a given date
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Checks if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Checks if a date is in the past
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Checks if a date is in the future
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Formats duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Gets a relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs < 0;
  
  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) {
    return isPast ? 'just now' : 'in a moment';
  } else if (minutes < 60) {
    const unit = minutes === 1 ? 'minute' : 'minutes';
    return isPast ? `${minutes} ${unit} ago` : `in ${minutes} ${unit}`;
  } else if (hours < 24) {
    const unit = hours === 1 ? 'hour' : 'hours';
    return isPast ? `${hours} ${unit} ago` : `in ${hours} ${unit}`;
  } else {
    const unit = days === 1 ? 'day' : 'days';
    return isPast ? `${days} ${unit} ago` : `in ${days} ${unit}`;
  }
}

/**
 * Parses various date string formats
 */
export function parseDate(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  return date;
}

/**
 * Creates a date from timestamp (supports both seconds and milliseconds)
 */
export function fromTimestamp(timestamp: number): Date {
  // If timestamp is in seconds (less than year 2100 in milliseconds)
  if (timestamp < 4102444800000) {
    return new Date(timestamp * 1000);
  }
  return new Date(timestamp);
}