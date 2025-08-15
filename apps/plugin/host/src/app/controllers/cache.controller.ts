import { Controller, Get, Delete, Param, Query } from '@nestjs/common';
import { PluginLoaderService } from '../plugin-loader-primary.service';

@Controller('plugins/cache')
export class CacheController {
  constructor(private readonly pluginLoader: PluginLoaderService) {}

  @Get('stats')
  getCacheStatistics() {
    return this.pluginLoader.getCacheStatistics();
  }

  @Delete()
  clearPluginCache() {
    const clearedCount = this.pluginLoader.clearPluginCache();
    return {
      success: true,
      message: `Cleared ${clearedCount} cache entries`,
      clearedCount,
    };
  }

  @Delete(':pluginName')
  invalidatePluginCache(@Param('pluginName') pluginName: string) {
    const invalidatedCount = this.pluginLoader.invalidatePluginCache(pluginName);
    return {
      success: true,
      message: `Invalidated ${invalidatedCount} cache entries for plugin ${pluginName}`,
      invalidatedCount,
      pluginName,
    };
  }

  @Delete('type/:cacheType')
  invalidateCacheByType(@Param('cacheType') cacheType: string) {
    const invalidatedCount = this.pluginLoader.invalidateCacheByType(cacheType);
    return {
      success: true,
      message: `Invalidated ${invalidatedCount} cache entries of type ${cacheType}`,
      invalidatedCount,
      cacheType,
    };
  }

  @Get('keys')
  getCacheKeys(@Query('pattern') pattern?: string) {
    const keys = this.pluginLoader.getCacheKeys();
    return {
      keys,
      count: keys.length,
      pattern: pattern || 'all',
    };
  }

  @Get('entry/:key')
  getCacheEntryDetails(@Param('key') key: string) {
    const details = this.pluginLoader.getCacheEntryDetails(key);
    if (!details) {
      return {
        exists: false,
        message: `Cache entry not found for key: ${key}`,
      };
    }
    return {
      exists: true,
      key,
      details,
    };
  }
}
