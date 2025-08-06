# Testing Infrastructure

## Hierarchical Jest Configuration

The testing system supports multiple testing strategies:

### Unit Testing Configuration:

```typescript
// For applications (SWC for speed)
{
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts']
}

// For plugins (ts-jest for compatibility)
{
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  testEnvironment: 'node'
}
```

### E2E Testing Infrastructure:

```typescript
// Global setup with port management
export default async function globalSetup() {
  await waitForPortToBeOpen({ port: parseInt(port, 10), host: 'localhost' });
}

// Axios configuration for HTTP testing
axios.defaults.baseURL = `http://localhost:${port}`;
```

## Testing Patterns for Plugin Development

### Plugin Service Testing:

```typescript
describe('PluginService', () => {
  let service: PluginService;
  let module: TestingModule;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PluginService,
        { provide: 'USER_PLUGIN_SERVICE', useValue: mockUserService },
        { provide: 'PLUGIN_REGISTRY', useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<PluginService>(PluginService);
  });

  it('should load plugin with dependencies', async () => {
    const result = await service.loadPlugin('test-plugin');
    expect(result.status).toBe('loaded');
  });
});
```

### Guard Testing:

```typescript
describe('PluginGuard', () => {
  let guard: PluginGuard;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    guard = new PluginGuard(mockReflector, mockUserService);
    mockContext = createMockExecutionContext();
  });

  it('should allow access when permissions match', async () => {
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
```

## Comprehensive Test Suite Structure

### 1. Unit Tests

**Plugin Service Tests:**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyPluginService } from './my-plugin.service';

describe('MyPluginService', () => {
  let service: MyPluginService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyPluginService],
    }).compile();

    service = module.get<MyPluginService>(MyPluginService);
  });

  describe('create', () => {
    it('should create a new item', async () => {
      const key = 'test-key';
      const value = { data: 'test' };

      await service.create(key, value);
      const result = await service.read(key);

      expect(result).toEqual(value);
    });

    it('should throw error for duplicate key', async () => {
      const key = 'duplicate-key';
      const value = { data: 'test' };

      await service.create(key, value);

      await expect(service.create(key, value)).rejects.toThrow();
    });
  });

  describe('read', () => {
    it('should return undefined for non-existent key', async () => {
      const result = await service.read('non-existent');
      expect(result).toBeUndefined();
    });
  });
});
```

**Plugin Controller Tests:**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyPluginController } from './my-plugin.controller';
import { MyPluginService } from '../services/my-plugin.service';

describe('MyPluginController', () => {
  let controller: MyPluginController;
  let service: MyPluginService;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      read: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyPluginController],
      providers: [
        {
          provide: MyPluginService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<MyPluginController>(MyPluginController);
    service = module.get<MyPluginService>(MyPluginService);
  });

  describe('create', () => {
    it('should create item and return success', async () => {
      const key = 'test-key';
      const data = { value: 'test' };

      const result = await controller.create(key, data);

      expect(service.create).toHaveBeenCalledWith(key, data);
      expect(result).toEqual({ success: true });
    });
  });

  describe('read', () => {
    it('should return data for existing key', async () => {
      const key = 'test-key';
      const mockData = { value: 'test' };
      (service.read as jest.Mock).mockResolvedValue(mockData);

      const result = await controller.read(key);

      expect(service.read).toHaveBeenCalledWith(key);
      expect(result).toEqual({ data: mockData });
    });
  });
});
```

**Plugin Guard Tests:**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { MyPluginGuard } from './my-plugin.guard';

describe('MyPluginGuard', () => {
  let guard: MyPluginGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MyPluginGuard,
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<MyPluginGuard>(MyPluginGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow access when no permissions required', () => {
    const mockContext = createMockExecutionContext();
    (reflector.get as jest.Mock).mockReturnValue(undefined);

    const result = guard.canActivate(mockContext);

    expect(result).toBe(true);
  });

  it('should allow access when user has required permissions', () => {
    const mockContext = createMockExecutionContext({
      user: { permissions: ['read', 'write'] },
    });
    (reflector.get as jest.Mock).mockReturnValue(['read']);

    const result = guard.canActivate(mockContext);

    expect(result).toBe(true);
  });

  it('should deny access when user lacks required permissions', () => {
    const mockContext = createMockExecutionContext({
      user: { permissions: ['read'] },
    });
    (reflector.get as jest.Mock).mockReturnValue(['write']);

    const result = guard.canActivate(mockContext);

    expect(result).toBe(false);
  });
});

function createMockExecutionContext(request = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}
```

### 2. Integration Tests

**Plugin Module Integration Tests:**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MyPluginModule } from './my-plugin.module';

describe('MyPluginModule (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MyPluginModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/my-plugin (POST)', () => {
    it('should create new item', () => {
      return request(app.getHttpServer())
        .post('/my-plugin/test-key')
        .send({ value: 'test data' })
        .expect(201)
        .expect({ success: true });
    });
  });

  describe('/my-plugin/:key (GET)', () => {
    beforeEach(async () => {
      // Setup test data
      await request(app.getHttpServer()).post('/my-plugin/test-key').send({ value: 'test data' });
    });

    it('should return existing item', () => {
      return request(app.getHttpServer())
        .get('/my-plugin/test-key')
        .expect(200)
        .expect({ data: { value: 'test data' } });
    });

    it('should return 404 for non-existent item', () => {
      return request(app.getHttpServer()).get('/my-plugin/non-existent').expect(404);
    });
  });
});
```

### 3. End-to-End Tests

**Plugin Host E2E Tests:**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('PluginHost (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Checks', () => {
    it('/ (GET) should return health status', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('/health (GET) should return detailed health', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'healthy');
          expect(res.body).toHaveProperty('metrics');
        });
    });
  });

  describe('Plugin Management', () => {
    it('/plugins (GET) should list loaded plugins', () => {
      return request(app.getHttpServer())
        .get('/plugins')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/plugins/stats (GET) should return plugin statistics', () => {
      return request(app.getHttpServer())
        .get('/plugins/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalLoaded');
          expect(res.body).toHaveProperty('guards');
        });
    });
  });

  describe('Plugin-specific Routes', () => {
    it('should handle plugin routes', async () => {
      // Assuming user-plugin is loaded
      return request(app.getHttpServer()).get('/api/user-plugin/users').expect(200);
    });
  });
});
```

**Plugin Registry E2E Tests:**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';
import * as path from 'path';

describe('PluginRegistry (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Plugin Upload', () => {
    it('/plugins (POST) should upload plugin', () => {
      const pluginPath = path.join(__dirname, 'fixtures', 'test-plugin.zip');

      return request(app.getHttpServer())
        .post('/plugins')
        .attach('plugin', pluginPath)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('plugin');
        });
    });

    it('/plugins (POST) should reject invalid plugin', () => {
      const invalidPath = path.join(__dirname, 'fixtures', 'invalid-plugin.zip');

      return request(app.getHttpServer()).post('/plugins').attach('plugin', invalidPath).expect(400);
    });
  });

  describe('Plugin Retrieval', () => {
    it('/plugins (GET) should list plugins', () => {
      return request(app.getHttpServer())
        .get('/plugins')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/plugins/:name (GET) should return plugin details', () => {
      return request(app.getHttpServer())
        .get('/plugins/test-plugin')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('name', 'test-plugin');
          expect(res.body).toHaveProperty('version');
        });
    });

    it('/plugins/:name/download (GET) should download plugin', () => {
      return request(app.getHttpServer())
        .get('/plugins/test-plugin/download')
        .expect(200)
        .expect('Content-Type', /application\/zip/);
    });
  });
});
```

## Test Utilities and Helpers

### Mock Factory

```typescript
export class MockFactory {
  static createMockExecutionContext(request: any = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as ExecutionContext;
  }

  static createMockPluginService() {
    return {
      create: jest.fn(),
      read: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    };
  }

  static createMockPluginLoader() {
    return {
      loadPlugin: jest.fn(),
      unloadPlugin: jest.fn(),
      getPluginState: jest.fn(),
      getPluginStats: jest.fn(),
      calculateLoadOrder: jest.fn(),
    };
  }
}
```

### Test Data Factory

```typescript
export class TestDataFactory {
  static createPluginManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
    return {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test plugin',
      author: 'Test Author',
      license: 'MIT',
      dependencies: [],
      loadOrder: 100,
      critical: false,
      module: {
        controllers: ['TestController'],
        providers: ['TestService'],
        exports: ['TestService'],
        guards: [],
      },
      ...overrides,
    };
  }

  static createPluginDiscovery(overrides: Partial<PluginDiscovery> = {}): PluginDiscovery {
    return {
      name: 'test-plugin',
      path: '/path/to/plugin',
      manifest: this.createPluginManifest(),
      ...overrides,
    };
  }
}
```

## Test Configuration

### Jest Configuration for Applications

```typescript
// apps/plugin-host/jest.config.ts
import { Config } from 'jest';

const config: Config = {
  displayName: 'plugin-host',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', decorators: true } } }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/plugin-host',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.interface.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
```

### Jest Configuration for Plugins

```typescript
// plugins/my-plugin/jest.config.ts
import { Config } from 'jest';

const config: Config = {
  displayName: 'my-plugin',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/plugins/my-plugin',
};

export default config;
```

This comprehensive testing infrastructure ensures reliable development and deployment of plugins within the modu-nest architecture.
