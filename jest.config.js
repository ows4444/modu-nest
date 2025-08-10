const { getJestProjects } = require('@nx/jest');

module.exports = {
  projects: getJestProjects(),
  collectCoverageFrom: [
    'libs/**/*.ts',
    'apps/**/*.ts',
    'plugins/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/out-tsc/**',
    '!**/*.config.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'lcov', 'text-summary', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/*.(test|spec).(ts|js)',
  ],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/tools/test-setup.ts'],
  // Global test timeout
  testTimeout: 30000,
  // Verbose output for debugging
  verbose: process.env.CI === 'true',
};