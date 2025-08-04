import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
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
import type { PluginResponseDto, PluginListResponseDto, PluginDeleteResponseDto } from '@modu-nest/plugin-types';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

@Controller('plugins')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PluginController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Post()
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
  async getPlugin(@Param('name') name: string): Promise<PluginResponseDto> {
    return this.pluginRegistryService.getPlugin(name);
  }

  @Get(':name/download')
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
  async clearValidationCache() {
    this.pluginRegistryService.clearValidationCache();
    return {
      message: 'Validation cache cleared successfully',
    };
  }

  @Get('search')
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
  async restoreDatabaseBackup(@Param('filename') filename: string) {
    const dbService = this.pluginRegistryService.getDatabaseService();
    await dbService.restoreBackup(filename);
    return {
      message: `Database restored from backup: ${filename}`,
    };
  }
}
