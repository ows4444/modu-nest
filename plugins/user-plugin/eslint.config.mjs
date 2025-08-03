import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts', '**/jest.config.ts'], // Apply only to plugin source files, exclude tests
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // Block common external dependencies
            // '@nestjs/common',
            // '@nestjs/core',
            // '@nestjs/platform-express',
            // 'express',
            // 'lodash',
            // 'axios',
            // 'rxjs',
          ].map((pkg) => ({
            name: pkg,
            message: `Import of '${pkg}' is not allowed in plugins. Only @modu-nest/plugin-types and relative imports are allowed.`,
          })),
          patterns: [
            // {
            //   group: ['@nestjs/*'],
            //   message: 'Direct NestJS imports are not allowed in plugins. Use @modu-nest/plugin-types instead.',
            // },
          ],
        },
      ],
    },
  },
];
