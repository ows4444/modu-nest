#!/usr/bin/env node

/**
 * Architecture Validation Script
 * 
 * Validates that the codebase follows the new architecture patterns
 * and identifies any violations or legacy code that needs updating.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class ArchitectureValidator {
  constructor() {
    this.violations = [];
    this.warnings = [];
    this.info = [];
  }

  validate() {
    console.log('🔍 Validating architecture...\n');
    
    this.validateImports();
    this.validatePluginStructure();
    this.validateLibraryOrganization();
    this.validateConfigurationUsage();
    
    this.reportResults();
  }

  validateImports() {
    console.log('📦 Checking imports...');
    
    const tsFiles = glob.sync('**/*.ts', {
      ignore: ['node_modules/**', 'dist/**', 'out-tsc/**'],
      cwd: process.cwd()
    });

    tsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for deprecated plugin-types imports
      if (content.includes("from '@modu-nest/plugin-types'")) {
        this.violations.push({
          file,
          type: 'deprecated-import',
          message: 'Using deprecated @modu-nest/plugin-types import. Use specific libraries instead.',
          line: this.getLineNumber(content, "@modu-nest/plugin-types")
        });
      }
      
      // Check for deprecated const imports
      if (content.includes("from '@modu-nest/const'")) {
        this.violations.push({
          file,
          type: 'deprecated-import',
          message: 'Using deprecated @modu-nest/const import. Use @modu-nest/shared-core instead.',
          line: this.getLineNumber(content, "@modu-nest/const")
        });
      }
      
      // Check for proper separation of concerns
      const coreImports = (content.match(/@modu-nest\/plugin-core/g) || []).length;
      const serviceImports = (content.match(/@modu-nest\/plugin-services/g) || []).length;
      const decoratorImports = (content.match(/@modu-nest\/plugin-decorators/g) || []).length;
      
      if (coreImports > 0 && serviceImports > 0 && decoratorImports > 0) {
        this.warnings.push({
          file,
          type: 'mixed-concerns',
          message: 'File imports from multiple plugin libraries. Consider separating concerns.',
        });
      }
    });
  }

  validatePluginStructure() {
    console.log('🔌 Validating plugin structure...');
    
    const pluginDirs = glob.sync('plugins/*/src', { cwd: process.cwd() });
    
    pluginDirs.forEach(pluginDir => {
      const pluginName = path.basename(path.dirname(pluginDir));
      const expectedDirs = ['lib/controllers', 'lib/services', 'lib/guards', 'lib/interfaces'];
      
      expectedDirs.forEach(expectedDir => {
        const fullPath = path.join(pluginDir, expectedDir);
        if (!fs.existsSync(fullPath)) {
          this.warnings.push({
            file: pluginDir,
            type: 'plugin-structure',
            message: `Plugin ${pluginName} missing expected directory: ${expectedDir}`,
          });
        }
      });
      
      // Check for plugin manifest
      const manifestPath = path.join(path.dirname(pluginDir), 'plugin.manifest.json');
      if (!fs.existsSync(manifestPath)) {
        this.violations.push({
          file: manifestPath,
          type: 'missing-manifest',
          message: `Plugin ${pluginName} missing plugin.manifest.json`,
        });
      } else {
        this.validatePluginManifest(manifestPath, pluginName);
      }
    });
  }

  validatePluginManifest(manifestPath, pluginName) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      const requiredFields = ['name', 'version', 'description', 'author', 'license'];
      requiredFields.forEach(field => {
        if (!manifest[field]) {
          this.violations.push({
            file: manifestPath,
            type: 'manifest-validation',
            message: `Plugin ${pluginName} manifest missing required field: ${field}`,
          });
        }
      });
      
      // Check for modern manifest structure
      if (!manifest.module) {
        this.warnings.push({
          file: manifestPath,
          type: 'manifest-structure',
          message: `Plugin ${pluginName} manifest missing 'module' configuration`,
        });
      }
      
      if (!manifest.security) {
        this.warnings.push({
          file: manifestPath,
          type: 'manifest-security',
          message: `Plugin ${pluginName} manifest missing 'security' configuration`,
        });
      }
      
    } catch (error) {
      this.violations.push({
        file: manifestPath,
        type: 'manifest-parse-error',
        message: `Plugin ${pluginName} manifest is not valid JSON: ${error.message}`,
      });
    }
  }

  validateLibraryOrganization() {
    console.log('📚 Validating library organization...');
    
    // Check that deprecated libraries are properly marked
    const deprecatedLibs = [
      'libs/plugin-types/src/index.ts',
      'libs/shared/const/src/index.ts'
    ];
    
    deprecatedLibs.forEach(libPath => {
      if (fs.existsSync(libPath)) {
        const content = fs.readFileSync(libPath, 'utf8');
        if (!content.includes('@deprecated') && !content.includes('DEPRECATED')) {
          this.warnings.push({
            file: libPath,
            type: 'missing-deprecation',
            message: 'Library should be marked as deprecated with appropriate warnings',
          });
        }
      }
    });
    
    // Check for proper exports in new libraries
    const newLibraries = [
      'libs/plugin-core/src/index.ts',
      'libs/plugin-services/src/index.ts',
      'libs/plugin-decorators/src/index.ts',
      'libs/plugin-validation/src/index.ts',
      'libs/shared/core/src/index.ts'
    ];
    
    newLibraries.forEach(libPath => {
      if (!fs.existsSync(libPath)) {
        this.violations.push({
          file: libPath,
          type: 'missing-export',
          message: 'New library missing proper export file',
        });
      }
    });
  }

  validateConfigurationUsage() {
    console.log('⚙️ Validating configuration usage...');
    
    const configFiles = glob.sync('**/*.ts', {
      ignore: ['node_modules/**', 'dist/**', 'out-tsc/**'],
      cwd: process.cwd()
    });

    configFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for hardcoded configuration values
      const hardcodedPatterns = [
        /localhost:\d+/g,
        /port\s*=\s*\d+/gi,
        /timeout\s*=\s*\d+/gi
      ];
      
      hardcodedPatterns.forEach((pattern, index) => {
        const matches = content.match(pattern);
        if (matches && !file.includes('test') && !file.includes('spec')) {
          this.warnings.push({
            file,
            type: 'hardcoded-config',
            message: `Potential hardcoded configuration found: ${matches[0]}. Consider using UnifiedConfigService.`,
            line: this.getLineNumber(content, matches[0])
          });
        }
      });
    });
  }

  getLineNumber(content, searchString) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchString)) {
        return i + 1;
      }
    }
    return null;
  }

  reportResults() {
    console.log('\n📊 Architecture Validation Results\n');
    
    if (this.violations.length === 0 && this.warnings.length === 0) {
      console.log('✅ No architecture violations found! 🎉\n');
      return;
    }
    
    if (this.violations.length > 0) {
      console.log(`❌ Found ${this.violations.length} violations:\n`);
      this.violations.forEach((violation, index) => {
        console.log(`${index + 1}. ${violation.type.toUpperCase()}`);
        console.log(`   File: ${violation.file}`);
        if (violation.line) console.log(`   Line: ${violation.line}`);
        console.log(`   ${violation.message}\n`);
      });
    }
    
    if (this.warnings.length > 0) {
      console.log(`⚠️  Found ${this.warnings.length} warnings:\n`);
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.type.toUpperCase()}`);
        console.log(`   File: ${warning.file}`);
        if (warning.line) console.log(`   Line: ${warning.line}`);
        console.log(`   ${warning.message}\n`);
      });
    }
    
    console.log('💡 Tips:');
    console.log('  - Update deprecated imports to use new focused libraries');
    console.log('  - Use UnifiedConfigService for all configuration needs');
    console.log('  - Follow the patterns documented in docs/DEVELOPMENT_PATTERNS.md');
    console.log('  - Run `nx build --all` to ensure all libraries compile correctly\n');
    
    if (this.violations.length > 0) {
      process.exit(1);
    }
  }
}

// Run validation
const validator = new ArchitectureValidator();
validator.validate();