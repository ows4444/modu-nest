/**
 * Global test setup file
 * Runs before all tests to configure the testing environment
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';

// Disable logging during tests unless explicitly enabled
if (process.env.ENABLE_TEST_LOGS !== 'true') {
  Logger.overrideLogger(false);
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.ENABLE_SWAGGER = 'false';
process.env.DATABASE_SYNCHRONIZE = 'true';
process.env.DATABASE_LOGGING = 'false';

// Mock external dependencies
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  mkdir: jest.fn(),
}));

// Extended timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to create mock configurations
  createMockConfig: (overrides = {}) => ({
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: 'localhost',
    DATABASE_TYPE: 'sqlite',
    DATABASE_HOST: ':memory:',
    PLUGIN_METRICS_ENABLED: false,
    ENABLE_HOT_RELOAD: false,
    ENABLE_SWAGGER: false,
    LOG_LEVEL: 'error',
    ...overrides,
  }),
  
  // Helper to create test module
  createTestingModule: async (metadata) => {
    const { Test } = require('@nestjs/testing');
    return Test.createTestingModule(metadata).compile();
  },
  
  // Helper to wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate test data
  generatePluginManifest: (overrides = {}) => ({
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Test Author',
    license: 'MIT',
    dependencies: [],
    loadOrder: 100,
    critical: false,
    security: {
      trustLevel: 'verified',
    },
    permissions: {
      services: ['database'],
      modules: [],
    },
    module: {
      controllers: ['TestController'],
      providers: ['TestService'],
      exports: ['TestService'],
    },
    ...overrides,
  }),
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in test:', reason);
  // Don't exit process in tests
});

export {};