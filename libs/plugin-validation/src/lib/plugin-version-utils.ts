import { PluginVersion } from '@libs/plugin-core';

export interface VersionRange {
  operator: string;
  version: string;
}

export interface VersionConstraint {
  ranges: VersionRange[];
  raw: string;
}

export interface VersionComparison {
  result: number;
  isEqual: boolean;
  isGreater: boolean;
  isLess: boolean;
}

export interface CompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  recommendedVersion?: string;
}

/**
 * Comprehensive plugin version utilities for semantic versioning
 * Supports parsing, comparison, compatibility checking, and range satisfaction
 */
export class PluginVersionUtils {
  /**
   * Parse a semantic version string into components
   * @param version - Version string (e.g., "1.2.3-alpha.1+build.123")
   * @returns Parsed version object
   */
  static parseVersion(version: string): PluginVersion {
    if (!version || typeof version !== 'string') {
      throw new Error('Version must be a non-empty string');
    }

    // Semantic versioning regex with full support for prerelease and build metadata
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

    const match = version.match(semverRegex);
    if (!match) {
      throw new Error(
        `Invalid semantic version format: ${version}. Expected format: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`
      );
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] ?? null,
      build: match[5] ?? null,
      raw: version,
    };
  }

  /**
   * Compare two version objects
   * @param a - First version
   * @param b - Second version
   * @returns Comparison result (-1, 0, 1)
   */
  static compareVersions(a: PluginVersion, b: PluginVersion): VersionComparison {
    // Compare major version
    if (a.major !== b.major) {
      const result = a.major - b.major;
      return {
        result,
        isEqual: false,
        isGreater: result > 0,
        isLess: result < 0,
      };
    }

    // Compare minor version
    if (a.minor !== b.minor) {
      const result = a.minor - b.minor;
      return {
        result,
        isEqual: false,
        isGreater: result > 0,
        isLess: result < 0,
      };
    }

    // Compare patch version
    if (a.patch !== b.patch) {
      const result = a.patch - b.patch;
      return {
        result,
        isEqual: false,
        isGreater: result > 0,
        isLess: result < 0,
      };
    }

    // Compare prerelease versions
    // Versions without prerelease are greater than those with prerelease
    if (!a.prerelease && b.prerelease) {
      return { result: 1, isEqual: false, isGreater: true, isLess: false };
    }
    if (a.prerelease && !b.prerelease) {
      return { result: -1, isEqual: false, isGreater: false, isLess: true };
    }

    // Both have prerelease - compare lexicographically
    if (a.prerelease && b.prerelease) {
      const prereleaseResult = this.comparePrereleaseVersions(a.prerelease, b.prerelease);
      return {
        result: prereleaseResult,
        isEqual: prereleaseResult === 0,
        isGreater: prereleaseResult > 0,
        isLess: prereleaseResult < 0,
      };
    }

    // Versions are equal (build metadata is ignored in comparison)
    return { result: 0, isEqual: true, isGreater: false, isLess: false };
  }

  /**
   * Compare prerelease version strings
   * @param a - First prerelease string
   * @param b - Second prerelease string
   * @returns Comparison result (-1, 0, 1)
   */
  private static comparePrereleaseVersions(a: string, b: string): number {
    const partsA = a.split('.');
    const partsB = b.split('.');
    const maxLength = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLength; i++) {
      const partA = partsA[i];
      const partB = partsB[i];

      // If one side is missing, the other is greater
      if (partA === undefined) return -1;
      if (partB === undefined) return 1;

      // Compare numeric vs non-numeric parts
      const isNumericA = /^\d+$/.test(partA);
      const isNumericB = /^\d+$/.test(partB);

      if (isNumericA && isNumericB) {
        const diff = parseInt(partA, 10) - parseInt(partB, 10);
        if (diff !== 0) return diff;
      } else if (isNumericA && !isNumericB) {
        return -1; // Numeric identifiers always have lower precedence
      } else if (!isNumericA && isNumericB) {
        return 1;
      } else {
        // Both are non-numeric, compare lexically
        if (partA < partB) return -1;
        if (partA > partB) return 1;
      }
    }

    return 0;
  }

  /**
   * Compare two version strings
   * @param a - First version string
   * @param b - Second version string
   * @returns Comparison result
   */
  static compareVersionStrings(a: string, b: string): VersionComparison {
    const versionA = this.parseVersion(a);
    const versionB = this.parseVersion(b);
    return this.compareVersions(versionA, versionB);
  }

  /**
   * Check if two versions are compatible according to semantic versioning rules
   * @param required - Required version string
   * @param available - Available version string
   * @returns Compatibility result
   */
  static isCompatible(required: string, available: string): CompatibilityResult {
    try {
      const reqVersion = this.parseVersion(required);
      const availVersion = this.parseVersion(available);

      // Major version must match for compatibility
      if (reqVersion.major !== availVersion.major) {
        return {
          isCompatible: false,
          reason: `Major version mismatch: required ${reqVersion.major}.x.x, got ${availVersion.major}.x.x`,
          recommendedVersion: `${reqVersion.major}.${availVersion.minor}.${availVersion.patch}`,
        };
      }

      // Available version must be >= required version
      const comparison = this.compareVersions(reqVersion, availVersion);
      if (comparison.isGreater) {
        return {
          isCompatible: false,
          reason: `Version too old: required ${required}, got ${available}`,
          recommendedVersion: required,
        };
      }

      return { isCompatible: true };
    } catch {
      return {
        isCompatible: false,
        reason: 'Invalid version format',
      };
    }
  }

  /**
   * Check if a version satisfies a range constraint
   * @param version - Version to check
   * @param range - Range constraint (e.g., "^1.2.0", "~1.2.0", ">=1.0.0 <2.0.0")
   * @returns Whether version satisfies the range
   */
  static satisfiesRange(version: string, range: string): boolean {
    try {
      const parsedVersion = this.parseVersion(version);
      const constraint = this.parseVersionRange(range);

      return this.evaluateVersionConstraint(parsedVersion, constraint);
    } catch {
      return false;
    }
  }

  /**
   * Parse a version range string into constraint object
   * @param range - Range string
   * @returns Parsed constraint
   */
  private static parseVersionRange(range: string): VersionConstraint {
    const trimmedRange = range.trim();

    // Handle simple version (exact match)
    if (/^[0-9]/.test(trimmedRange)) {
      return {
        ranges: [{ operator: '=', version: trimmedRange }],
        raw: range,
      };
    }

    // Handle caret range (^1.2.3)
    const caretMatch = trimmedRange.match(/^\^(.+)$/);
    if (caretMatch) {
      return {
        ranges: [{ operator: '^', version: caretMatch[1] }],
        raw: range,
      };
    }

    // Handle tilde range (~1.2.3)
    const tildeMatch = trimmedRange.match(/^~(.+)$/);
    if (tildeMatch) {
      return {
        ranges: [{ operator: '~', version: tildeMatch[1] }],
        raw: range,
      };
    }

    // Handle comparison operators (>=1.0.0, <2.0.0, etc.)
    const operatorMatch = trimmedRange.match(/^(>=|<=|>|<|=)(.+)$/);
    if (operatorMatch) {
      return {
        ranges: [{ operator: operatorMatch[1], version: operatorMatch[2].trim() }],
        raw: range,
      };
    }

    // Handle compound ranges (>=1.0.0 <2.0.0)
    const compoundRanges = this.parseCompoundRange(trimmedRange);
    if (compoundRanges.length > 0) {
      return {
        ranges: compoundRanges,
        raw: range,
      };
    }

    throw new Error(`Invalid version range format: ${range}`);
  }

  /**
   * Parse compound version ranges
   * @param range - Compound range string
   * @returns Array of version ranges
   */
  private static parseCompoundRange(range: string): VersionRange[] {
    const ranges: VersionRange[] = [];

    // Split on spaces and parse each part
    const parts = range.split(/\s+/);
    let i = 0;

    while (i < parts.length) {
      const part = parts[i];

      // Check for operator
      const operatorMatch = part.match(/^(>=|<=|>|<|=)/);
      if (operatorMatch) {
        const operator = operatorMatch[1];
        const versionPart = part.substring(operator.length);

        if (versionPart) {
          ranges.push({ operator, version: versionPart });
        } else if (i + 1 < parts.length) {
          ranges.push({ operator, version: parts[i + 1] });
          i++; // Skip next part as it's the version
        }
      }

      i++;
    }

    return ranges;
  }

  /**
   * Evaluate if a version satisfies a constraint
   * @param version - Parsed version
   * @param constraint - Version constraint
   * @returns Whether constraint is satisfied
   */
  private static evaluateVersionConstraint(version: PluginVersion, constraint: VersionConstraint): boolean {
    // All ranges must be satisfied (AND logic)
    return constraint.ranges.every((range) => this.evaluateVersionRange(version, range));
  }

  /**
   * Evaluate a single version range
   * @param version - Parsed version
   * @param range - Version range
   * @returns Whether range is satisfied
   */
  private static evaluateVersionRange(version: PluginVersion, range: VersionRange): boolean {
    const rangeVersion = this.parseVersion(range.version);
    const comparison = this.compareVersions(version, rangeVersion);

    switch (range.operator) {
      case '=':
        return comparison.isEqual;
      case '>':
        return comparison.isGreater;
      case '<':
        return comparison.isLess;
      case '>=':
        return comparison.isGreater || comparison.isEqual;
      case '<=':
        return comparison.isLess || comparison.isEqual;
      case '^':
        return this.satisfiesCaretRange(version, rangeVersion);
      case '~':
        return this.satisfiesTildeRange(version, rangeVersion);
      default:
        return false;
    }
  }

  /**
   * Check if version satisfies caret range (^1.2.3)
   * Compatible within the same major version
   * @param version - Version to check
   * @param rangeVersion - Range version
   * @returns Whether caret range is satisfied
   */
  private static satisfiesCaretRange(version: PluginVersion, rangeVersion: PluginVersion): boolean {
    // Must be same major version
    if (version.major !== rangeVersion.major) {
      return false;
    }

    // Must be >= range version
    const comparison = this.compareVersions(version, rangeVersion);
    return comparison.isGreater || comparison.isEqual;
  }

  /**
   * Check if version satisfies tilde range (~1.2.3)
   * Compatible within the same major.minor version
   * @param version - Version to check
   * @param rangeVersion - Range version
   * @returns Whether tilde range is satisfied
   */
  private static satisfiesTildeRange(version: PluginVersion, rangeVersion: PluginVersion): boolean {
    // Must be same major and minor version
    if (version.major !== rangeVersion.major || version.minor !== rangeVersion.minor) {
      return false;
    }

    // Must be >= range version
    const comparison = this.compareVersions(version, rangeVersion);
    return comparison.isGreater || comparison.isEqual;
  }

  /**
   * Get the latest version from an array of version strings
   * @param versions - Array of version strings
   * @returns Latest version string
   */
  static getLatestVersion(versions: string[]): string {
    if (versions.length === 0) {
      throw new Error('No versions provided');
    }

    return versions.reduce((latest, current) => {
      const comparison = this.compareVersionStrings(current, latest);
      return comparison.isGreater ? current : latest;
    });
  }

  /**
   * Sort versions in ascending order
   * @param versions - Array of version strings
   * @returns Sorted version strings
   */
  static sortVersions(versions: string[]): string[] {
    return [...versions].sort((a, b) => {
      const comparison = this.compareVersionStrings(a, b);
      return comparison.result;
    });
  }

  /**
   * Sort versions in descending order (latest first)
   * @param versions - Array of version strings
   * @returns Sorted version strings (descending)
   */
  static sortVersionsDescending(versions: string[]): string[] {
    return [...versions].sort((a, b) => {
      const comparison = this.compareVersionStrings(a, b);
      return -comparison.result;
    });
  }

  /**
   * Check if a version is a prerelease
   * @param version - Version string
   * @returns Whether version is a prerelease
   */
  static isPrerelease(version: string): boolean {
    try {
      const parsed = this.parseVersion(version);
      return parsed.prerelease !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if a version is stable (not a prerelease)
   * @param version - Version string
   * @returns Whether version is stable
   */
  static isStable(version: string): boolean {
    return !this.isPrerelease(version);
  }

  /**
   * Increment a version
   * @param version - Current version string
   * @param type - Type of increment ('major', 'minor', 'patch', 'prerelease')
   * @param prereleaseIdentifier - Identifier for prerelease (default: 'alpha')
   * @returns New version string
   */
  static incrementVersion(
    version: string,
    type: 'major' | 'minor' | 'patch' | 'prerelease',
    prereleaseIdentifier = 'alpha'
  ): string {
    const parsed = this.parseVersion(version);

    switch (type) {
      case 'major':
        return `${parsed.major + 1}.0.0`;
      case 'minor':
        return `${parsed.major}.${parsed.minor + 1}.0`;
      case 'patch':
        return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
      case 'prerelease':
        if (parsed.prerelease) {
          // Increment existing prerelease
          const parts = parsed.prerelease.split('.');
          const lastPart = parts[parts.length - 1];

          if (/^\d+$/.test(lastPart)) {
            parts[parts.length - 1] = (parseInt(lastPart, 10) + 1).toString();
            return `${parsed.major}.${parsed.minor}.${parsed.patch}-${parts.join('.')}`;
          } else {
            return `${parsed.major}.${parsed.minor}.${parsed.patch}-${parsed.prerelease}.1`;
          }
        } else {
          // Create new prerelease
          return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${prereleaseIdentifier}.1`;
        }
      default:
        throw new Error(`Invalid increment type: ${type as string}`);
    }
  }

  /**
   * Check if version is valid semantic version
   * @param version - Version string to validate
   * @returns Whether version is valid
   */
  static isValidVersion(version: string): boolean {
    try {
      this.parseVersion(version);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get version info including classification and metadata
   * @param version - Version string
   * @returns Version information object
   */
  static getVersionInfo(version: string) {
    const parsed = this.parseVersion(version);

    return {
      version: parsed,
      isPrerelease: parsed.prerelease !== null,
      isStable: parsed.prerelease === null,
      hasBuildMetadata: parsed.build !== null,
      classification: this.classifyVersion(parsed),
      string: version,
    };
  }

  /**
   * Classify version type
   * @param version - Parsed version
   * @returns Version classification
   */
  private static classifyVersion(version: PluginVersion): string {
    if (version.major === 0) {
      if (version.minor === 0) {
        return 'initial-development';
      }
      return 'pre-release';
    }

    if (version.prerelease) {
      if (version.prerelease.includes('alpha')) {
        return 'alpha';
      } else if (version.prerelease.includes('beta')) {
        return 'beta';
      } else if (version.prerelease.includes('rc')) {
        return 'release-candidate';
      }
      return 'prerelease';
    }

    return 'stable';
  }

  /**
   * Find the best matching version from available versions for a range
   * @param range - Version range constraint
   * @param availableVersions - Array of available version strings
   * @returns Best matching version or null if none match
   */
  static findBestMatch(range: string, availableVersions: string[]): string | null {
    const satisfyingVersions = availableVersions.filter((version) => this.satisfiesRange(version, range));

    if (satisfyingVersions.length === 0) {
      return null;
    }

    return this.getLatestVersion(satisfyingVersions);
  }
}
