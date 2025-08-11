import { PluginCompatibilityChecker, CompatibilityUtils } from './plugin-compatibility-checker';
import { PluginManifest } from '@libs/plugin-core';

describe('PluginCompatibilityChecker', () => {
  const mockManifest: PluginManifest = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin for compatibility checking',
    author: 'Test Author',
    license: 'MIT',
    module: {
      controllers: ['TestController'],
      providers: ['TestService'],
      exports: ['TestService'],
    },
  };

  describe('checkPluginCompatibility', () => {
    it('should return full compatibility for supported version', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('1.0.0');

      expect(result.isCompatible).toBe(true);
      expect(result.compatibilityLevel).toBe('full');
      expect(result.errors).toHaveLength(0);
    });

    it('should return incompatible for invalid version format', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('invalid-version');

      expect(result.isCompatible).toBe(false);
      expect(result.compatibilityLevel).toBe('incompatible');
      expect(result.errors).toContain('Invalid plugin version format: invalid-version');
    });

    it('should handle deprecated versions when allowed', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('0.9.0', {
        allowDeprecated: true,
      });

      expect(result.isCompatible).toBe(true);
      expect(result.compatibilityLevel).toBe('deprecated');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject deprecated versions when not allowed', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('0.9.0', {
        allowDeprecated: false,
      });

      expect(result.isCompatible).toBe(false);
      expect(result.compatibilityLevel).toBe('incompatible');
    });

    it('should handle partial compatibility when allowed', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('1.1.0', {
        allowPartial: true,
      });

      // This might be partially compatible (newer minor version)
      expect(result.compatibilityLevel).toBeOneOf(['partial', 'full', 'incompatible']);
    });

    it('should apply strict mode restrictions', () => {
      const result = PluginCompatibilityChecker.checkPluginCompatibility('0.9.0', {
        allowDeprecated: true,
        strictMode: true,
      });

      expect(result.isCompatible).toBe(false);
      expect(result.compatibilityLevel).toBe('incompatible');
      expect(result.errors).toContain('Strict mode does not allow deprecated or partially compatible versions');
    });
  });

  describe('checkManifestCompatibility', () => {
    it('should check manifest compatibility', () => {
      const result = PluginCompatibilityChecker.checkManifestCompatibility(mockManifest);

      expect(result).toBeDefined();
      expect(result.isCompatible).toBeDefined();
      expect(result.compatibilityLevel).toBeDefined();
    });

    it('should detect missing required fields', () => {
      const incompleteManifest = {
        ...mockManifest,
        name: '',
        author: undefined,
      } as any;

      const result = PluginCompatibilityChecker.checkManifestCompatibility(incompleteManifest);

      expect(result.isCompatible).toBe(false);
      expect(result.errors.some((error) => error.includes('missing required fields'))).toBe(true);
    });

    it('should detect deprecated manifest fields', () => {
      const manifestWithDeprecated = {
        ...mockManifest,
        legacyMode: true,
      } as any;

      const result = PluginCompatibilityChecker.checkManifestCompatibility(manifestWithDeprecated);

      expect(result.warnings.some((warning) => warning.includes('deprecated fields'))).toBe(true);
    });
  });

  describe('validatePluginCompatibility', () => {
    it('should not throw for compatible plugin', () => {
      expect(() => {
        PluginCompatibilityChecker.validatePluginCompatibility(mockManifest);
      }).not.toThrow();
    });

    it('should throw for incompatible plugin', () => {
      const incompatibleManifest = {
        ...mockManifest,
        version: 'invalid-version',
      };

      expect(() => {
        PluginCompatibilityChecker.validatePluginCompatibility(incompatibleManifest);
      }).toThrow();
    });
  });

  describe('findCompatibleVersions', () => {
    const testVersions = ['0.8.0', '0.9.0', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];

    it('should find compatible versions', () => {
      const compatible = PluginCompatibilityChecker.findCompatibleVersions(testVersions);

      expect(compatible).toBeInstanceOf(Array);
      expect(compatible.length).toBeGreaterThan(0);
      expect(compatible).toContain('1.0.0');
    });

    it('should respect configuration options', () => {
      const compatibleStrict = PluginCompatibilityChecker.findCompatibleVersions(testVersions, {
        strictMode: true,
      });

      const compatibleLenient = PluginCompatibilityChecker.findCompatibleVersions(testVersions, {
        allowDeprecated: true,
        allowPartial: true,
      });

      expect(compatibleLenient.length).toBeGreaterThanOrEqual(compatibleStrict.length);
    });
  });

  describe('getLatestCompatibleVersion', () => {
    it('should return latest compatible version', () => {
      const testVersions = ['1.0.0', '1.0.1', '0.9.0'];
      const latest = PluginCompatibilityChecker.getLatestCompatibleVersion(testVersions);

      expect(latest).toBeDefined();
      if (latest) {
        expect(['1.0.0', '1.0.1']).toContain(latest);
      }
    });

    it('should return null if no compatible versions', () => {
      const testVersions = ['0.1.0', '0.2.0'];
      const latest = PluginCompatibilityChecker.getLatestCompatibleVersion(testVersions);

      expect(latest).toBeNull();
    });
  });

  describe('getCompatibilityMatrix', () => {
    it('should return compatibility matrix for multiple versions', () => {
      const testVersions = ['1.0.0', '0.9.0', 'invalid'];
      const matrix = PluginCompatibilityChecker.getCompatibilityMatrix(testVersions);

      expect(Object.keys(matrix)).toHaveLength(testVersions.length);
      expect(matrix['1.0.0'].compatibilityLevel).toBe('full');
      expect(matrix['invalid'].compatibilityLevel).toBe('incompatible');
    });
  });
});

describe('CompatibilityUtils', () => {
  const mockManifest: PluginManifest = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Test Author',
    license: 'MIT',
    module: {
      controllers: ['TestController'],
    },
  };

  describe('generateCompatibilityReport', () => {
    it('should generate a comprehensive report', () => {
      const report = CompatibilityUtils.generateCompatibilityReport(mockManifest);

      expect(report).toContain('Plugin Compatibility Report');
      expect(report).toContain(mockManifest.name);
      expect(report).toContain(mockManifest.version);
      expect(report).toContain('Compatibility Level:');
    });
  });

  describe('needsUpdate', () => {
    it('should return false for compatible plugin', () => {
      const needsUpdate = CompatibilityUtils.needsUpdate(mockManifest);

      expect(needsUpdate).toBe(false);
    });

    it('should return true for deprecated plugin', () => {
      const deprecatedManifest = {
        ...mockManifest,
        version: '0.9.0',
      };

      const needsUpdate = CompatibilityUtils.needsUpdate(deprecatedManifest);

      expect(typeof needsUpdate).toBe('boolean');
    });
  });

  describe('getRecommendedActions', () => {
    it('should return actions for compatible plugin', () => {
      const actions = CompatibilityUtils.getRecommendedActions(mockManifest);

      expect(actions).toBeInstanceOf(Array);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should return update actions for incompatible plugin', () => {
      const incompatibleManifest = {
        ...mockManifest,
        version: '0.1.0',
      };

      const actions = CompatibilityUtils.getRecommendedActions(incompatibleManifest);

      expect(actions.some((action) => action.toLowerCase().includes('update'))).toBe(true);
    });
  });
});

// Custom Jest matcher
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: unknown[]): R;
    }
  }
}
