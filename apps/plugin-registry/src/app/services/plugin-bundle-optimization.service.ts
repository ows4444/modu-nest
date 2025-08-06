import { Injectable, Logger } from '@nestjs/common';
import { createGzip, createBrotliCompress, constants } from 'zlib';
import JSZip from 'jszip';
import { PluginValidationError, handlePluginError, PluginErrorMetrics } from '@modu-nest/plugin-types';

export interface BundleOptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  optimizedBuffer: Buffer;
  optimizations: {
    treeShaking: {
      enabled: boolean;
      removedFiles: string[];
      sizeSaved: number;
    };
    compression: {
      algorithm: string;
      originalSize: number;
      compressedSize: number;
      ratio: number;
    };
    minification: {
      enabled: boolean;
      filesMinified: number;
      sizeSaved: number;
    };
  };
  metadata: {
    filesCount: number;
    largestFile: string;
    largestFileSize: number;
    totalJsSize: number;
    totalAssetSize: number;
  };
}

export interface OptimizationOptions {
  enableTreeShaking: boolean;
  enableMinification: boolean;
  compressionAlgorithm: 'gzip' | 'brotli' | 'deflate' | 'lz4';
  compressionLevel: number;
  removeSourceMaps: boolean;
  removeComments: boolean;
  optimizeImages: boolean;
  bundleAnalysis: boolean;
}

export interface TreeShakingResult {
  removedFiles: string[];
  sizeSaved: number;
  unusedExports: string[];
  deadCode: string[];
}

export interface MinificationResult {
  filesMinified: number;
  originalSize: number;
  minifiedSize: number;
  sizeSaved: number;
}

export interface BundleAnalysis {
  totalSize: number;
  filesCount: number;
  filesByType: Record<string, { count: number; size: number }>;
  largestFiles: Array<{ name: string; size: number; type: string }>;
  dependencies: string[];
  circularDependencies: string[];
  unusedFiles: string[];
}

@Injectable()
export class PluginBundleOptimizationService {
  private readonly logger = new Logger(PluginBundleOptimizationService.name);
  private errorMetrics = PluginErrorMetrics.getInstance();

  // Configuration from environment variables
  private readonly DEFAULT_OPTIONS: OptimizationOptions = {
    enableTreeShaking: process.env.BUNDLE_OPT_TREE_SHAKING === 'true',
    enableMinification: process.env.BUNDLE_OPT_MINIFICATION !== 'false', // enabled by default
    compressionAlgorithm: (process.env.BUNDLE_OPT_COMPRESSION as any) || 'gzip',
    compressionLevel: parseInt(process.env.BUNDLE_OPT_COMPRESSION_LEVEL || '6', 10),
    removeSourceMaps: process.env.BUNDLE_OPT_REMOVE_SOURCE_MAPS !== 'false', // enabled by default
    removeComments: process.env.BUNDLE_OPT_REMOVE_COMMENTS !== 'false', // enabled by default
    optimizeImages: process.env.BUNDLE_OPT_OPTIMIZE_IMAGES === 'true',
    bundleAnalysis: process.env.BUNDLE_OPT_ANALYSIS !== 'false', // enabled by default
  };

  constructor() {
    this.logger.log('Bundle optimization service initialized with configuration:', {
      treeShaking: this.DEFAULT_OPTIONS.enableTreeShaking,
      minification: this.DEFAULT_OPTIONS.enableMinification,
      compression: this.DEFAULT_OPTIONS.compressionAlgorithm,
      level: this.DEFAULT_OPTIONS.compressionLevel,
    });
  }

  /**
   * Optimize a plugin bundle with various optimization techniques
   */
  async optimizeBundle(
    pluginBuffer: Buffer,
    pluginName: string,
    options: Partial<OptimizationOptions> = {}
  ): Promise<BundleOptimizationResult> {
    const finalOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      this.logger.log(`Starting bundle optimization for plugin: ${pluginName}`);

      // Extract the plugin ZIP
      const zip = new JSZip();
      const contents = await zip.loadAsync(pluginBuffer.buffer as ArrayBuffer);

      // Perform bundle analysis
      const analysis = finalOptions.bundleAnalysis ? await this.analyzeBundleContents(contents) : null;

      // Apply optimizations
      let optimizedZip = contents;
      let treeShakingResult: TreeShakingResult = {
        removedFiles: [],
        sizeSaved: 0,
        unusedExports: [],
        deadCode: [],
      };
      let minificationResult: MinificationResult = {
        filesMinified: 0,
        originalSize: 0,
        minifiedSize: 0,
        sizeSaved: 0,
      };

      // Tree shaking (remove unused files and exports)
      if (finalOptions.enableTreeShaking) {
        const treeShakingData = await this.performTreeShaking(optimizedZip);
        treeShakingResult = treeShakingData.result;
        optimizedZip = treeShakingData.optimizedZip;
        this.logger.debug(
          `Tree shaking removed ${treeShakingResult.removedFiles.length} files, saved ${treeShakingResult.sizeSaved} bytes`
        );
      }

      // Minification
      if (finalOptions.enableMinification) {
        minificationResult = await this.minifyJavaScriptFiles(optimizedZip, finalOptions);
        this.logger.debug(
          `Minified ${minificationResult.filesMinified} files, saved ${minificationResult.sizeSaved} bytes`
        );
      }

      // Remove source maps and other unnecessary files
      if (finalOptions.removeSourceMaps) {
        await this.removeUnnecessaryFiles(optimizedZip, finalOptions);
      }

      // Generate optimized buffer
      const optimizedBuffer = await optimizedZip.generateAsync({
        type: 'nodebuffer',
        compression: this.mapCompressionAlgorithm(finalOptions.compressionAlgorithm),
        compressionOptions: {
          level: finalOptions.compressionLevel,
        },
      });

      // Apply additional external compression if specified
      const finalOptimizedBuffer = await this.applyExternalCompression(
        optimizedBuffer,
        finalOptions.compressionAlgorithm,
        finalOptions.compressionLevel
      );

      const optimizationTime = Date.now() - startTime;
      const compressionRatio = (pluginBuffer.length - finalOptimizedBuffer.length) / pluginBuffer.length;

      this.logger.log(
        `Bundle optimization completed for ${pluginName} in ${optimizationTime}ms: ` +
          `${pluginBuffer.length} → ${finalOptimizedBuffer.length} bytes (${(compressionRatio * 100).toFixed(
            1
          )}% reduction)`
      );

      return {
        originalSize: pluginBuffer.length,
        optimizedSize: finalOptimizedBuffer.length,
        compressionRatio,
        optimizedBuffer: finalOptimizedBuffer,
        optimizations: {
          treeShaking: {
            enabled: finalOptions.enableTreeShaking,
            removedFiles: treeShakingResult.removedFiles,
            sizeSaved: treeShakingResult.sizeSaved,
          },
          compression: {
            algorithm: finalOptions.compressionAlgorithm,
            originalSize: optimizedBuffer.length,
            compressedSize: finalOptimizedBuffer.length,
            ratio: (optimizedBuffer.length - finalOptimizedBuffer.length) / optimizedBuffer.length,
          },
          minification: {
            enabled: finalOptions.enableMinification,
            filesMinified: minificationResult.filesMinified,
            sizeSaved: minificationResult.sizeSaved,
          },
        },
        metadata: {
          filesCount: Object.keys(optimizedZip.files).length,
          largestFile: analysis?.largestFiles[0]?.name || 'unknown',
          largestFileSize: analysis?.largestFiles[0]?.size || 0,
          totalJsSize: this.calculateJavaScriptSize(optimizedZip),
          totalAssetSize: this.calculateAssetSize(optimizedZip),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const validationError = new PluginValidationError(pluginName, [`Bundle optimization failed: ${errorMessage}`]);
      this.errorMetrics.recordError(validationError, {
        pluginName,
        operation: 'bundle-optimization',
      });
      handlePluginError(validationError, { pluginName, operation: 'optimizeBundle' });
    }
  }

  /**
   * Analyze bundle contents to understand structure and dependencies
   */
  private async analyzeBundleContents(zip: JSZip): Promise<BundleAnalysis> {
    const files = Object.entries(zip.files).filter(([, file]) => !file.dir);
    const analysis: BundleAnalysis = {
      totalSize: 0,
      filesCount: files.length,
      filesByType: {},
      largestFiles: [],
      dependencies: [],
      circularDependencies: [],
      unusedFiles: [],
    };

    const fileSizes: Array<{ name: string; size: number; type: string }> = [];

    for (const [fileName, file] of files) {
      const content = await file.async('nodebuffer');
      const size = content.length;
      const extension = fileName.split('.').pop() || 'unknown';

      analysis.totalSize += size;

      if (!analysis.filesByType[extension]) {
        analysis.filesByType[extension] = { count: 0, size: 0 };
      }
      analysis.filesByType[extension].count++;
      analysis.filesByType[extension].size += size;

      fileSizes.push({ name: fileName, size, type: extension });

      // Extract dependencies from JavaScript files
      if (extension === 'js' && size > 0) {
        const contentStr = content.toString('utf8');
        const deps = this.extractDependencies(contentStr);
        analysis.dependencies.push(...deps);
      }
    }

    // Sort and get largest files
    analysis.largestFiles = fileSizes.sort((a, b) => b.size - a.size).slice(0, 10);

    // Remove duplicate dependencies
    analysis.dependencies = [...new Set(analysis.dependencies)];

    return analysis;
  }

  /**
   * Perform tree shaking to remove unused code and files
   */
  private async performTreeShaking(zip: JSZip): Promise<{
    result: TreeShakingResult;
    optimizedZip: JSZip;
  }> {
    const result: TreeShakingResult = {
      removedFiles: [],
      sizeSaved: 0,
      unusedExports: [],
      deadCode: [],
    };

    const optimizedZip = new JSZip();
    const usedFiles = new Set<string>();

    // Always keep essential files
    const essentialFiles = ['plugin.manifest.json', 'package.json', 'index.js', 'main.js'];

    // Find entry points and trace dependencies
    const entryPoints = await this.findEntryPoints(zip);
    for (const entryPoint of entryPoints) {
      await this.traceFileDependencies(zip, entryPoint, usedFiles);
    }

    // Add essential files to used files
    essentialFiles.forEach((file) => usedFiles.add(file));

    // Copy only used files to optimized ZIP
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) {
        // Always keep directories
        optimizedZip.folder(fileName);
      } else if (usedFiles.has(fileName) || essentialFiles.some((essential) => fileName.includes(essential))) {
        // Keep used files and essential files
        const content = await file.async('nodebuffer');
        optimizedZip.file(fileName, content);
      } else {
        // Mark as removed
        const content = await file.async('nodebuffer');
        result.removedFiles.push(fileName);
        result.sizeSaved += content.length;
      }
    }

    return { result, optimizedZip };
  }

  /**
   * Find entry points in the plugin (main files that are loaded first)
   */
  private async findEntryPoints(zip: JSZip): Promise<string[]> {
    const entryPoints: string[] = [];

    // Check for standard entry points
    const standardEntries = ['index.js', 'main.js', 'app.js'];
    for (const entry of standardEntries) {
      if (zip.files[entry]) {
        entryPoints.push(entry);
      }
    }

    // Check package.json for main field
    const packageJsonFile = zip.files['package.json'];
    if (packageJsonFile) {
      try {
        const packageJson = JSON.parse(await packageJsonFile.async('text'));
        if (packageJson.main && zip.files[packageJson.main]) {
          entryPoints.push(packageJson.main);
        }
      } catch (error) {
        this.logger.warn('Failed to parse package.json for entry points');
      }
    }

    // If no entry points found, include all JS files as potential entry points
    if (entryPoints.length === 0) {
      Object.keys(zip.files).forEach((fileName) => {
        if (fileName.endsWith('.js') && !zip.files[fileName].dir) {
          entryPoints.push(fileName);
        }
      });
    }

    return entryPoints;
  }

  /**
   * Trace file dependencies recursively
   */
  private async traceFileDependencies(zip: JSZip, fileName: string, usedFiles: Set<string>): Promise<void> {
    if (usedFiles.has(fileName) || !zip.files[fileName]) {
      return;
    }

    usedFiles.add(fileName);

    if (fileName.endsWith('.js')) {
      try {
        const content = await zip.files[fileName].async('text');
        const dependencies = this.extractLocalDependencies(content);

        for (const dep of dependencies) {
          await this.traceFileDependencies(zip, dep, usedFiles);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to trace dependencies for ${fileName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Extract local file dependencies from JavaScript code
   */
  private extractLocalDependencies(code: string): string[] {
    const dependencies: string[] = [];

    // Match require() calls for local files
    const requireRegex = /require\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g;
    let match;
    while ((match = requireRegex.exec(code)) !== null) {
      let dep = match[1];
      // Normalize path and add .js extension if missing
      if (!dep.endsWith('.js') && !dep.includes('.')) {
        dep += '.js';
      }
      dependencies.push(dep.replace(/^\.\//, ''));
    }

    // Match ES6 import statements for local files
    const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:\w+)|(?:\{[^}]+\}))\s+from\s+['"`](\.[^'"`]+)['"`]/g;
    while ((match = importRegex.exec(code)) !== null) {
      let dep = match[1];
      if (!dep.endsWith('.js') && !dep.includes('.')) {
        dep += '.js';
      }
      dependencies.push(dep.replace(/^\.\//, ''));
    }

    return dependencies;
  }

  /**
   * Extract all dependencies (including external ones) from JavaScript code
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];

    // Match all require() and import statements
    const patterns = [
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /import\s+(?:(?:\*\s+as\s+\w+)|(?:\w+)|(?:\{[^}]+\}))\s+from\s+['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const dep = match[1];
        if (!dep.startsWith('.')) {
          // Only external dependencies
          dependencies.push(dep);
        }
      }
    }

    return dependencies;
  }

  /**
   * Minify JavaScript files in the ZIP
   */
  private async minifyJavaScriptFiles(zip: JSZip, options: OptimizationOptions): Promise<MinificationResult> {
    const result: MinificationResult = {
      filesMinified: 0,
      originalSize: 0,
      minifiedSize: 0,
      sizeSaved: 0,
    };

    for (const [fileName, file] of Object.entries(zip.files)) {
      if (!file.dir && fileName.endsWith('.js')) {
        try {
          const originalContent = await file.async('text');
          result.originalSize += originalContent.length;

          const minifiedContent = this.minifyJavaScript(originalContent, options);

          if (minifiedContent.length < originalContent.length) {
            zip.file(fileName, minifiedContent);
            result.filesMinified++;
            result.minifiedSize += minifiedContent.length;
            result.sizeSaved += originalContent.length - minifiedContent.length;
          } else {
            result.minifiedSize += originalContent.length;
          }
        } catch (error) {
          this.logger.warn(`Failed to minify ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
          const originalContent = await file.async('text');
          result.originalSize += originalContent.length;
          result.minifiedSize += originalContent.length;
        }
      }
    }

    return result;
  }

  /**
   * Advanced JavaScript minification
   */
  private minifyJavaScript(code: string, options: OptimizationOptions): string {
    let minified = code;

    // Remove comments if enabled
    if (options.removeComments) {
      // Remove single line comments (but preserve URLs and important comments)
      minified = minified.replace(/(?<!:)\/\/(?!.*https?:\/\/)(?!\s*@|\s*!).*$/gm, '');
      // Remove multi-line comments (but preserve JSDoc and licenses)
      minified = minified.replace(/\/\*(?![\s\S]*@|\*!|![\s\S]*?\*\/)[\s\S]*?\*\//g, '');
    }

    // Normalize whitespace
    minified = minified
      // Remove extra whitespace but preserve string literals
      .replace(/(?<!['"`])\s+(?!['"`])/g, ' ')
      // Remove whitespace around operators (carefully)
      .replace(/\s*([{}();,=<>!&|+\-*/])\s*/g, '$1')
      // Remove leading/trailing whitespace from lines
      .replace(/^\s+|\s+$/gm, '')
      // Remove consecutive empty lines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // More aggressive optimizations for production
    if (options.compressionLevel >= 8) {
      // Remove unnecessary semicolons (be careful with ASI)
      minified = minified.replace(/;\s*}/g, '}');
      minified = minified.replace(/;\s*\n/g, '\n');
    }

    return minified;
  }

  /**
   * Remove unnecessary files like source maps, test files, etc.
   */
  private async removeUnnecessaryFiles(zip: JSZip, options: OptimizationOptions): Promise<void> {
    const filesToRemove: string[] = [];

    for (const fileName of Object.keys(zip.files)) {
      if (zip.files[fileName].dir) continue;

      const shouldRemove =
        (options.removeSourceMaps && (fileName.endsWith('.map') || fileName.endsWith('.d.ts.map'))) ||
        fileName.includes('test') ||
        fileName.includes('spec') ||
        fileName.includes('.test.') ||
        fileName.includes('.spec.') ||
        fileName.startsWith('__tests__/') ||
        fileName.startsWith('tests/') ||
        fileName.endsWith('.md') ||
        fileName.endsWith('.txt') ||
        fileName === 'README' ||
        fileName === 'CHANGELOG' ||
        fileName === 'LICENSE';

      if (shouldRemove) {
        filesToRemove.push(fileName);
      }
    }

    // Remove the files
    filesToRemove.forEach((fileName) => {
      zip.remove(fileName);
    });

    if (filesToRemove.length > 0) {
      this.logger.debug(`Removed ${filesToRemove.length} unnecessary files: ${filesToRemove.join(', ')}`);
    }
  }

  /**
   * Apply external compression algorithms
   */
  private async applyExternalCompression(buffer: Buffer, algorithm: string, level: number): Promise<Buffer> {
    switch (algorithm) {
      case 'gzip':
        return this.compressWithGzip(buffer, level);
      case 'brotli':
        return this.compressWithBrotli(buffer, level);
      case 'deflate':
      case 'lz4':
      default:
        // For deflate and lz4, return the buffer as-is for now
        // These would require additional libraries
        return buffer;
    }
  }

  /**
   * Compress with gzip
   */
  private async compressWithGzip(buffer: Buffer, level: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip({ level, memLevel: 9 });

      gzip.on('data', (chunk) => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);

      gzip.write(buffer);
      gzip.end();
    });
  }

  /**
   * Compress with brotli
   */
  private async compressWithBrotli(buffer: Buffer, level: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const brotli = createBrotliCompress({
        params: {
          [constants.BROTLI_PARAM_QUALITY]: level,
          [constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
        },
      });

      brotli.on('data', (chunk) => chunks.push(chunk));
      brotli.on('end', () => resolve(Buffer.concat(chunks)));
      brotli.on('error', reject);

      brotli.write(buffer);
      brotli.end();
    });
  }

  /**
   * Map compression algorithm names to JSZip compression types
   */
  private mapCompressionAlgorithm(algorithm: string): 'STORE' | 'DEFLATE' {
    switch (algorithm) {
      case 'deflate':
      case 'gzip':
      case 'brotli':
        return 'DEFLATE';
      default:
        return 'DEFLATE';
    }
  }

  /**
   * Calculate total JavaScript file size in ZIP
   */
  private calculateJavaScriptSize(zip: JSZip): number {
    let totalSize = 0;
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (!file.dir && fileName.endsWith('.js')) {
        // Note: This is an estimate as we can't get actual size without reading the file
        totalSize += fileName.length * 50; // Rough estimate
      }
    }
    return totalSize;
  }

  /**
   * Calculate total asset file size in ZIP
   */
  private calculateAssetSize(zip: JSZip): number {
    let totalSize = 0;
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (!file.dir && !fileName.endsWith('.js') && !fileName.endsWith('.json')) {
        // Rough estimate for asset files
        totalSize += fileName.length * 100;
      }
    }
    return totalSize;
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    defaultOptions: OptimizationOptions;
    supportedAlgorithms: string[];
    features: string[];
  } {
    return {
      defaultOptions: { ...this.DEFAULT_OPTIONS },
      supportedAlgorithms: ['gzip', 'brotli', 'deflate', 'lz4'],
      features: [
        'tree-shaking',
        'minification',
        'compression',
        'source-map-removal',
        'bundle-analysis',
        'dead-code-elimination',
      ],
    };
  }
}
