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
import { SecurityEventLoggerService } from '../services/security-event-logger.service';
import type { PluginResponseDto, PluginListResponseDto, PluginDeleteResponseDto } from '@modu-nest/plugin-types';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import {
  RateLimitingGuard,
  UploadRateLimit,
  DownloadRateLimit,
  ApiRateLimit,
  SearchRateLimit,
  AdminRateLimit,
} from '../guards/rate-limiting.guard';
import { createSuccessResponse } from '../utils/response.utils';
import { 
  PluginNotFoundException, 
  PluginUploadException, 
  PluginValidationException 
} from '../exceptions/plugin-registry.exceptions';
import { StandardSuccessResponse } from '../types/error-response.types';
import { 
  SecurityEventSeverity, 
  SecurityEventCategory, 
  SecurityEventAction,
  BaseSecurityEvent 
} from '../services/security-event-logger.service';

@Controller('plugins')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PluginController {
  constructor(
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly rateLimitingService: PluginRateLimitingService,
    private readonly bundleOptimizationService: PluginBundleOptimizationService,
    private readonly securityLogger: SecurityEventLoggerService
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
  async uploadPlugin(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request
  ): Promise<StandardSuccessResponse<PluginResponseDto>> {
    if (!file) {
      this.securityLogger.logSuspiciousActivity(
        'Plugin upload attempted without file',
        SecurityEventSeverity.MEDIUM,
        { endpoint: '/plugins', method: 'POST' },
        request
      );
      throw new PluginUploadException('No plugin file provided');
    }

    try {
      // Log upload attempt
      this.securityLogger.logSecurityEvent({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        category: SecurityEventCategory.UPLOAD_SECURITY,
        severity: SecurityEventSeverity.INFO,
        action: SecurityEventAction.AUDIT,
        description: `Plugin upload initiated: ${file.originalname} (${file.size} bytes)`,
        source: 'plugin-registry',
        actor: this.extractActorInfo(request),
        resource: {
          type: 'file',
          identifier: file.originalname || 'unknown',
        },
        context: {
          fileSize: file.size,
          mimeType: file.mimetype,
        },
        correlationId: this.extractCorrelationId(request),
      });

      const result = await this.pluginRegistryService.uploadPlugin(file.buffer);
      
      // Log successful upload
      this.securityLogger.logAdminOperationEvent(
        'plugin-upload',
        true,
        (result as PluginResponseDto).name,
        { fileSize: file.size, fileName: file.originalname },
        request
      );

      return createSuccessResponse(result as PluginResponseDto, 'Plugin uploaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed upload
      this.securityLogger.logAdminOperationEvent(
        'plugin-upload',
        false,
        file.originalname,
        { error: message, fileSize: file.size },
        request
      );

      throw new PluginUploadException(message, { originalError: message });
    }
  }

  @Get()
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async listPlugins(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ): Promise<StandardSuccessResponse<PluginListResponseDto>> {
    // Set default pagination
    const defaultLimit = 50;
    const maxLimit = 100;

    if (limit && limit > maxLimit) {
      throw new PluginValidationException('pagination', { 
        limit: [`Limit cannot exceed ${maxLimit}. Received: ${limit}`] 
      });
    }

    const result = await this.pluginRegistryService.listPlugins(page || 1, limit || defaultLimit);
    return createSuccessResponse(result, 'Plugins retrieved successfully');
  }

  @Get(':name')
  @UseGuards(RateLimitingGuard)
  @ApiRateLimit()
  async getPlugin(@Param('name') name: string): Promise<StandardSuccessResponse<PluginResponseDto>> {
    try {
      const result = await this.pluginRegistryService.getPlugin(name);
      return createSuccessResponse(result, 'Plugin retrieved successfully');
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new PluginNotFoundException(name);
      }
      throw error;
    }
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
  async deletePlugin(
    @Param('name') name: string,
    @Req() request: Request
  ): Promise<StandardSuccessResponse<PluginDeleteResponseDto>> {
    try {
      // Log deletion attempt
      this.securityLogger.logAdminOperationEvent(
        'plugin-delete',
        false, // Will update to true on success
        name,
        { operation: 'delete', pluginName: name },
        request
      );

      await this.pluginRegistryService.deletePlugin(name);
      
      // Log successful deletion
      this.securityLogger.logAdminOperationEvent(
        'plugin-delete',
        true,
        name,
        { operation: 'delete', pluginName: name },
        request
      );

      const result: PluginDeleteResponseDto = {
        message: `Plugin ${name} deleted successfully`,
        deletedPlugin: name,
      };
      return createSuccessResponse(result, 'Plugin deleted successfully');
    } catch (error) {
      // Log failed deletion
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.securityLogger.logAdminOperationEvent(
        'plugin-delete',
        false,
        name,
        { operation: 'delete', pluginName: name, error: errorMessage },
        request
      );

      if (error instanceof Error && error.message.includes('not found')) {
        throw new PluginNotFoundException(name);
      }
      throw error;
    }
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
  async searchPlugins(@Query('q') query: string): Promise<StandardSuccessResponse<PluginResponseDto[]>> {
    if (!query || query.trim().length === 0) {
      throw new PluginValidationException('search', { 
        query: ['Search query is required and cannot be empty'] 
      });
    }
    const result = await this.pluginRegistryService.searchPlugins(query.trim());
    return createSuccessResponse(result, 'Plugin search completed successfully');
  }

  @Get('stats/detailed')
  async getDetailedStats() {
    return this.pluginRegistryService.getDetailedRegistryStats();
  }

  @Get('database/stats')
  async getDatabaseStats() {
    // TODO: Implement database stats - getDatabaseService currently not implemented
    throw new BadRequestException('Database stats functionality not yet implemented');
  }

  @Post('database/backup')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async createDatabaseBackup(@Query('type') _type: 'full' | 'incremental' = 'full') {
    // TODO: Implement database backup - getDatabaseService currently not implemented
    throw new BadRequestException('Database backup functionality not yet implemented');
  }

  @Get('database/backups')
  async listDatabaseBackups() {
    // TODO: Implement database backup listing - getDatabaseService currently not implemented
    throw new BadRequestException('Database backup listing functionality not yet implemented');
  }

  @Post('database/restore/:filename')
  @UseGuards(RateLimitingGuard)
  @AdminRateLimit()
  async restoreDatabaseBackup(@Param('filename') _filename: string) {
    // TODO: Implement database restore - getDatabaseService currently not implemented
    throw new BadRequestException('Database restore functionality not yet implemented');
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
  async getRateLimitStatus(@Param('rule') ruleName: string, @Req() req: Request) {
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
  async resetRateLimit(@Param('rule') ruleName: string, @Req() req: Request, @Query('identifier') identifier?: string) {
    const targetIdentifier = identifier || req.ip || req.connection?.remoteAddress || 'unknown';
    const reset = this.rateLimitingService.resetRateLimit(ruleName, targetIdentifier);

    if (!reset) {
      throw new BadRequestException(
        `Could not reset rate limit for rule '${ruleName}' and identifier '${targetIdentifier}'`
      );
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
    const rules = ruleNames.map((name) => ({
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
    @Query('compressionLevel') compressionLevel?: string
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Bundle optimization preview failed: ${errorMessage}`);
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

  /**
   * Security logging helper methods
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private extractActorInfo(request: Request): BaseSecurityEvent['actor'] {
    return {
      type: 'anonymous',
      ipAddress: request.ip || request.socket?.remoteAddress,
      userAgent: request.get('User-Agent'),
    };
  }

  private extractCorrelationId(request: Request): string | undefined {
    return request.headers['x-correlation-id'] as string || 
           request.headers['x-request-id'] as string;
  }
}
