import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Res,
  Header,
  Query,
  ParseIntPipe,
  ValidationPipe,
  UsePipes,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import type { Express } from 'express';
import 'multer';
import { PluginRegistryService } from '../services/plugin-registry.service';
import { PluginRateLimitingService } from '../services/plugin-rate-limiting.service';
import { PluginBundleOptimizationService } from '../services/plugin-bundle-optimization.service';
import type { PluginResponseDto, PluginListResponseDto, PluginDeleteResponseDto } from '@modu-nest/plugin-types';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { 
  RateLimitingGuard, 
  UploadRateLimit, 
  DownloadRateLimit, 
  ApiRateLimit, 
  SearchRateLimit, 
  AdminRateLimit 
} from '../guards/rate-limiting.guard';

@Controller('plugins')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PluginController {
  constructor(
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly rateLimitingService: PluginRateLimitingService,
    private readonly bundleOptimizationService: PluginBundleOptimizationService,
  ) {}

  @Post()
  @UseGuards(RateLimitingGuard)
  @UploadRateLimit()
  @UseInterceptors(FileInterceptor('plugin'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        plugin: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadPlugin(@UploadedFile() file: Express.Multer.File): Promise<PluginResponseDto> {
    if (!file) {
      throw new BadRequestException('No plugin file provided');
    }

    const result = await this.pluginRegistryService.uploadPlugin(file.buffer);
    return result as PluginResponseDto;
  }

  @Get()
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async listPlugins(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<PluginListResponseDto> {
    // Set default pagination
    const defaultLimit = 50;
    const maxLimit = 100;

    if (limit && limit > maxLimit) {
      throw new BadRequestException(`Limit cannot exceed ${maxLimit}`);
    }

    return this.pluginRegistryService.listPlugins(page, limit || defaultLimit);
  }

  @Get(':name')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getPlugin(@Param('name') name: string): Promise<PluginResponseDto> {
    return this.pluginRegistryService.getPlugin(name);
  }

  @Get(':name/download')
  @UseGuards(RateLimitingGuard)
  @DownloadRateLimit()
  @Header('Content-Type', 'application/zip')
  async downloadPlugin(@Param('name') name: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress;

    const { buffer, metadata } = await this.pluginRegistryService.downloadPlugin(name, userAgent, ipAddress);

    res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}-${metadata.version}.zip"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Plugin-Name', metadata.name);
    res.setHeader('X-Plugin-Version', metadata.version);
    res.send(buffer);
  }

  @Delete(':name')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async deletePlugin(@Param('name') name: string): Promise<PluginDeleteResponseDto> {
    await this.pluginRegistryService.deletePlugin(name);
    return {
      message: `Plugin ${name} deleted successfully`,
      deletedPlugin: name,
    };
  }

  @Get('cache/stats')
  async getValidationCacheStats() {
    return {
      cache: this.pluginRegistryService.getValidationCacheStats(),
      message: 'Validation cache statistics retrieved successfully',
    };
  }

  @Delete('cache/clear')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async clearValidationCache() {
    this.pluginRegistryService.clearValidationCache();
    return {
      message: 'Validation cache cleared successfully',
    };
  }

  @Get('search')
  @UseGuards(RateLimitingGuard)
  @SearchRateLimit()
  async searchPlugins(@Query('q') query: string): Promise<PluginResponseDto[]> {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }
    return this.pluginRegistryService.searchPlugins(query.trim());
  }

  @Get('stats/detailed')
  async getDetailedStats() {
    return this.pluginRegistryService.getDetailedRegistryStats();
  }

  @Get('database/stats')
  async getDatabaseStats() {
    const dbService = this.pluginRegistryService.getDatabaseService();
    return dbService.getDatabaseStats();
  }

  @Post('database/backup')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async createDatabaseBackup(@Query('type') type: 'full' | 'incremental' = 'full') {
    const dbService = this.pluginRegistryService.getDatabaseService();
    const backup = await dbService.createBackup(type);
    return {
      message: 'Database backup created successfully',
      backup,
    };
  }

  @Get('database/backups')
  async listDatabaseBackups() {
    const dbService = this.pluginRegistryService.getDatabaseService();
    return dbService.listBackups();
  }

  @Post('database/restore/:filename')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async restoreDatabaseBackup(@Param('filename') filename: string) {
    const dbService = this.pluginRegistryService.getDatabaseService();
    await dbService.restoreBackup(filename);
    return {
      message: `Database restored from backup: ${filename}`,
    };
  }

  @Get('rate-limit/stats')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getRateLimitStats() {
    const stats = this.rateLimitingService.getRateLimitStats();
    return {
      message: 'Rate limiting statistics retrieved successfully',
      stats,
    };
  }

  @Get('rate-limit/status/:rule')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getRateLimitStatus(
    @Param('rule') ruleName: string, 
    @Req() req: Request
  ) {
    const identifier = req.ip || req.connection?.remoteAddress || 'unknown';
    const status = this.rateLimitingService.getRateLimitStatus(ruleName, identifier);
    
    if (!status) {
      throw new BadRequestException(`Rate limiting rule '${ruleName}' not found`);
    }

    return {
      message: `Rate limit status for rule '${ruleName}'`,
      status,
    };
  }

  @Delete('rate-limit/reset/:rule')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async resetRateLimit(
    @Param('rule') ruleName: string,
    @Query('identifier') identifier?: string,
    @Req() req: Request
  ) {
    const targetIdentifier = identifier || req.ip || req.connection?.remoteAddress || 'unknown';
    const reset = this.rateLimitingService.resetRateLimit(ruleName, targetIdentifier);
    
    if (!reset) {
      throw new BadRequestException(`Could not reset rate limit for rule '${ruleName}' and identifier '${targetIdentifier}'`);
    }

    return {
      message: `Rate limit reset successfully for rule '${ruleName}'`,
      rule: ruleName,
      identifier: this.sanitizeIdentifier(targetIdentifier),
    };
  }

  @Delete('rate-limit/clear')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async clearAllRateLimits() {
    this.rateLimitingService.clearAllRateLimits();
    return {
      message: 'All rate limiting data cleared successfully',
    };
  }

  @Get('rate-limit/rules')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getRateLimitRules() {
    const ruleNames = this.rateLimitingService.getRuleNames();
    const rules = ruleNames.map(name => ({
      name,
      config: this.rateLimitingService.getRule(name),
    }));

    return {
      message: 'Rate limiting rules retrieved successfully',
      rules,
    };
  }

  @Get('optimization/stats')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getBundleOptimizationStats() {
    const stats = this.bundleOptimizationService.getOptimizationStats();
    return {
      message: 'Bundle optimization statistics retrieved successfully',
      stats,
    };
  }

  @Post('optimization/preview')
  @UseGuards(RateLimitingGuard)
  @UploadRateLimit()
  @UseInterceptors(FileInterceptor('plugin'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        plugin: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async previewBundleOptimization(
    @UploadedFile() file: Express.Multer.File,
    @Query('enableTreeShaking') enableTreeShaking?: string,
    @Query('enableMinification') enableMinification?: string,
    @Query('compressionAlgorithm') compressionAlgorithm?: string,
    @Query('compressionLevel') compressionLevel?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No plugin file provided');
    }

    const options = {
      enableTreeShaking: enableTreeShaking === 'true',
      enableMinification: enableMinification !== 'false', // default true
      compressionAlgorithm: (compressionAlgorithm as any) || 'gzip',
      compressionLevel: compressionLevel ? parseInt(compressionLevel, 10) : 6,
      removeSourceMaps: true,
      removeComments: true,
      optimizeImages: false,
      bundleAnalysis: true,
    };

    try {
      const result = await this.bundleOptimizationService.optimizeBundle(
        file.buffer,
        file.originalname || 'preview',
        options
      );

      // Don't return the actual optimized buffer in preview, just stats
      return {
        message: 'Bundle optimization preview completed',
        preview: {
          originalSize: result.originalSize,
          optimizedSize: result.optimizedSize,
          compressionRatio: result.compressionRatio,
          sizeSavings: result.originalSize - result.optimizedSize,
          optimizations: result.optimizations,
          metadata: result.metadata,
        },
        options,
      };
    } catch (error) {
      throw new BadRequestException(`Bundle optimization preview failed: ${error.message}`);
    }
  }

  /**
   * Sanitize identifier for response (remove sensitive information)
   */
  private sanitizeIdentifier(identifier: string): string {
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(identifier)) {
      return identifier.replace(/\.\d{1,3}$/, '.xxx');
    }
    
    if (identifier.length > 8) {
      return identifier.substring(0, 4) + '****' + identifier.substring(identifier.length - 2);
    }
    
    return '****';
  }
}
