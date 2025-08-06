# Enterprise Build System and Tooling

## Nx Workspace Configuration

The build system uses **Nx 21.3.7** with enterprise-grade optimization strategies and bundle optimization:

### Enterprise Features:

- **Incremental Compilation**: TypeScript composite projects with build info caching
- **Dependency Tracking**: Project references prevent unnecessary rebuilds
- **Named Inputs**: Aggressive caching based on relevant file changes only
- **Parallel Execution**: Independent projects build simultaneously
- **Bundle Optimization**: Tree shaking, minification, and multi-algorithm compression
- **Security Integration**: Automated security scanning during build process
- **Performance Monitoring**: Build time tracking and optimization recommendations

### Build Targets and Optimizations:

```typescript
// Production build optimization
const buildOptions = {
  target: 'es2022',
  module: 'nodenext',
  composite: true,
  incremental: true,
  strict: true,
  removeComments: options.production,
  skipLibCheck: options.production,
};
```

## Custom Plugin Build Pipeline

The plugin build system implements multi-stage processing:

### Stage 1: Validation and Security Scanning

```bash
nx run my-plugin:plugin-validate
# - Manifest semantic versioning validation
# - TypeScript compilation verification
# - Unsafe import detection
# - Guard dependency validation
```

### Stage 2: Compilation and Optimization

```bash
nx run my-plugin:plugin-build --production
# - TypeScript compilation with optimizations
# - JavaScript minification (production)
# - Asset copying and manifest inclusion
# - Package.json generation (runtime deps only)
```

### Stage 3: Packaging and Distribution

```bash
nx run my-plugin:plugin-zip
# - ZIP creation with selective file inclusion
# - Size optimization (source map exclusion)
# - Content verification and listing
```

## TypeScript Configuration Hierarchy

```typescript
// Base configuration (tsconfig.base.json)
{
  "compilerOptions": {
    "composite": true,           // Enable project references
    "declarationMap": true,      // Source maps for declarations
    "module": "nodenext",        // Modern Node.js resolution
    "target": "es2022",          // Modern JavaScript target
    "experimentalDecorators": true, // NestJS support
    "strict": true               // Maximum type safety
  }
}

// Plugin-specific enhancements (plugins/*/tsconfig.json)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "strictNullChecks": true,
    "strictBindCallApply": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## Environment Configuration Schema

The system uses class-validator for environment validation with a focused set of essential configuration options:

```typescript
export class EnvironmentSchema {
  @IsEnum(EnvironmentType)
  NODE_ENV!: EnvironmentType;

  @IsPort()
  @Transform(({ value }) => parseInt(value, 10))
  PORT!: number;

  @IsString()
  @MinLength(1)
  APP_NAME!: string;

  @IsString()
  @IsOptional()
  HOST?: string;

  @IsString()
  @IsOptional()
  API_PREFIX?: string;

  @Transform(({ value }) => parseBoolean(value))
  @IsOptional()
  ENABLE_SWAGGER?: boolean;

  @IsString()
  @IsOptional()
  AWS_REGION?: string;

  @IsArray()
  @IsOptional()
  CORS_ORIGINS?: string[];
}
```

## Advanced Build Commands

### Workspace Commands

```bash
# Build all affected projects
nx affected:build

# Test all affected projects
nx affected:test

# Lint all affected projects
nx affected:lint

# Dependency graph visualization
nx graph

# Workspace analysis
nx report

# Clean build artifacts
nx reset
```

### Plugin-Specific Commands

```bash
# Generate new plugin
nx g @modu-nest/plugin:plugin my-new-plugin

# Build plugin with validation
nx run my-plugin:plugin-build --production

# Validate plugin structure
nx run my-plugin:plugin-validate

# Create plugin distribution package
nx run my-plugin:plugin-zip

# Publish to local registry
nx run my-plugin:plugin-publish

# Publish to remote registry
nx run my-plugin:plugin-registry-publish
```

## Build Performance Optimizations

### Nx Caching Strategy

```json
{
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s",
      "!{projectRoot}/.eslintrc.json",
      "!{projectRoot}/eslint.config.js"
    ],
    "sharedGlobals": []
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production", "{workspaceRoot}/jest.preset.js"],
      "cache": true
    },
    "lint": {
      "inputs": [
        "default",
        "{workspaceRoot}/.eslintrc.json",
        "{workspaceRoot}/.eslintignore",
        "{workspaceRoot}/eslint.config.js"
      ],
      "cache": true
    }
  }
}
```

### TypeScript Project References

The workspace uses TypeScript project references for optimal compilation performance:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./apps/plugin-host"
    },
    {
      "path": "./apps/plugin-registry"
    },
    {
      "path": "./libs/plugin-types"
    },
    {
      "path": "./libs/shared/config"
    },
    {
      "path": "./libs/shared/const"
    },
    {
      "path": "./libs/shared/utils"
    }
  ]
}
```

## Build Performance Metrics

- **Incremental Compilation**: ~80% faster rebuilds after initial build
- **Named Input Caching**: High cache hit rate through proper input tracking
- **Parallel Processing**: Independent project builds run simultaneously
- **Tree Shaking**: Unused exports eliminated from final bundles

## Custom Executors

### Plugin Build Executor

The custom plugin build executor provides specialized functionality:

```typescript
export interface PluginBuildExecutorSchema {
  outputPath: string;
  tsConfig: string;
  production?: boolean;
  optimization?: boolean;
  sourceMap?: boolean;
  assets?: string[];
}

export default async function runExecutor(
  options: PluginBuildExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  // Custom build logic for plugins
  const { success } = await buildPlugin(options, context);
  return { success };
}
```

### Plugin Validation Executor

```typescript
export interface PluginValidateExecutorSchema {
  manifestPath: string;
  securityCheck?: boolean;
  dependencyCheck?: boolean;
}

export default async function runExecutor(
  options: PluginValidateExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean; issues?: ValidationIssue[] }> {
  // Validation logic
  const result = await validatePlugin(options, context);
  return result;
}
```

## Webpack Configuration

For applications that require webpack (like the plugin host), custom configuration is provided:

```javascript
const { composePlugins, withNx } = require('@nx/webpack');

module.exports = composePlugins(withNx(), (config) => {
  // Custom webpack configuration for plugin host
  config.externals = {
    // Externalize certain modules to reduce bundle size
    'class-validator': 'commonjs class-validator',
    'class-transformer': 'commonjs class-transformer',
  };

  // Plugin-specific webpack optimizations
  config.optimization = {
    ...config.optimization,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        plugins: {
          test: /[\\/]plugins[\\/]/,
          name: 'plugins',
          chunks: 'all',
        },
      },
    },
  };

  return config;
});
```

## ESLint Configuration

Comprehensive ESLint setup for code quality:

```javascript
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  ...compat.extends('plugin:@nx/typescript').map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...config.rules,
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  })),
];
```

## Plugin Generator

Custom Nx generator for creating new plugins:

```typescript
export interface PluginGeneratorSchema {
  name: string;
  directory?: string;
  tags?: string;
  skipFormat?: boolean;
  unitTestRunner?: 'jest' | 'none';
}

export default async function (tree: Tree, options: PluginGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  // Generate plugin structure
  addProjectConfiguration(tree, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'library',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    targets: {
      'plugin-build': {
        executor: '@modu-nest/plugin:plugin-build',
        options: {
          outputPath: `dist/${normalizedOptions.projectRoot}`,
          tsConfig: `${normalizedOptions.projectRoot}/tsconfig.lib.json`,
        },
      },
      'plugin-validate': {
        executor: '@modu-nest/plugin:plugin-validate',
        options: {
          manifestPath: `${normalizedOptions.projectRoot}/plugin.manifest.json`,
        },
      },
    },
  });

  // Generate files from templates
  generateFiles(tree, path.join(__dirname, 'files'), normalizedOptions.projectRoot, normalizedOptions);

  await formatFiles(tree);
}
```

This build system provides a robust foundation for developing, validating, and distributing plugins within the modu-nest architecture.
