import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  ParseBoolPipe,
  DefaultValuePipe,
  ParseIntPipe
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PluginRegistryService } from '../services/plugin-registry.service';
import { PluginRateLimitingGuard, RateLimit } from '../guards/plugin-rate-limiting.guard';
import { UseGuards } from '@nestjs/common';

// DTOs for version management
export class PromoteVersionDto {
  version: string;
  reason?: string;
}

export class RollbackVersionDto {
  targetVersion: string;
  preserveCurrentVersion?: boolean;
  rollbackReason?: string;
  performBackup?: boolean;
  validateCompatibility?: boolean;
}

export class VersionCompatibilityDto {
  fromVersion: string;
  toVersion: string;
}

@ApiTags('plugin-versions')
@Controller('plugins')
@UseGuards(PluginRateLimitingGuard)
export class PluginVersionController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Get(':name/versions')
  @RateLimit('api')
  @ApiOperation({ 
    summary: 'Get all versions of a plugin',
    description: 'Retrieve all available versions of a specific plugin, sorted by semantic version (latest first)'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of plugin versions retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          status: { type: 'string', enum: ['active', 'deprecated', 'disabled', 'archived', 'rollback_target'] },
          isActive: { type: 'boolean' },
          uploadDate: { type: 'string', format: 'date-time' },
          fileSize: { type: 'number' },
          checksum: { type: 'string' },
          downloadCount: { type: 'number' },
          rollbackTarget: { type: 'boolean' }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async getPluginVersions(@Param('name') name: string) {
    return await this.pluginRegistryService.getPluginVersions(name);
  }

  @Get(':name/versions/active')
  @RateLimit('api')
  @ApiOperation({ 
    summary: 'Get the active version of a plugin',
    description: 'Retrieve the currently active version of a specific plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiResponse({ 
    status: 200, 
    description: 'Active plugin version retrieved successfully'
  })
  @ApiResponse({ status: 404, description: 'Plugin not found or no active version' })
  async getActivePluginVersion(@Param('name') name: string) {
    return await this.pluginRegistryService.getActivePluginVersion(name);
  }

  @Get(':name/versions/:version')
  @RateLimit('api')
  @ApiOperation({ 
    summary: 'Get a specific version of a plugin',
    description: 'Retrieve details for a specific version of a plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiParam({ name: 'version', description: 'Plugin version' })
  @ApiResponse({ 
    status: 200, 
    description: 'Plugin version retrieved successfully'
  })
  @ApiResponse({ status: 404, description: 'Plugin or version not found' })
  async getPluginVersion(@Param('name') name: string, @Param('version') version: string) {
    return await this.pluginRegistryService.getPluginVersion(name, version);
  }

  @Post(':name/versions/:version/promote')
  @RateLimit('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Promote a version to be the active version',
    description: 'Make a specific version of a plugin the active version'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiParam({ name: 'version', description: 'Version to promote' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for promotion' }
      }
    },
    required: false
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Version promoted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        previousActiveVersion: { type: 'string' },
        newActiveVersion: { type: 'string' },
        affectedDependents: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin or version not found' })
  @ApiResponse({ status: 400, description: 'Version promotion failed' })
  async promoteVersion(
    @Param('name') name: string, 
    @Param('version') version: string,
    @Body() body?: { reason?: string }
  ) {
    return await this.pluginRegistryService.promotePluginVersion(name, version);
  }

  @Post(':name/versions/rollback')
  @RateLimit('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Rollback to a previous version',
    description: 'Rollback a plugin to a previous version with configurable options'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({ 
    type: RollbackVersionDto,
    description: 'Rollback configuration'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Plugin rolled back successfully'
  })
  @ApiResponse({ status: 404, description: 'Plugin or target version not found' })
  @ApiResponse({ status: 400, description: 'Rollback failed' })
  async rollbackVersion(
    @Param('name') name: string,
    @Body() rollbackDto: RollbackVersionDto
  ) {
    const options = {
      preserveCurrentVersion: rollbackDto.preserveCurrentVersion,
      rollbackReason: rollbackDto.rollbackReason,
      performBackup: rollbackDto.performBackup,
      validateCompatibility: rollbackDto.validateCompatibility
    };

    return await this.pluginRegistryService.rollbackPluginVersion(
      name, 
      rollbackDto.targetVersion, 
      options
    );
  }

  @Post(':name/versions/archive')
  @RateLimit('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Archive old versions of a plugin',
    description: 'Archive old versions of a plugin, keeping only the latest N versions'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiQuery({ 
    name: 'keepLatest', 
    required: false, 
    type: Number, 
    description: 'Number of latest versions to keep (default: 5)' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Old versions archived successfully',
    schema: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of archived versions'
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async archiveOldVersions(
    @Param('name') name: string,
    @Query('keepLatest', new DefaultValuePipe(5), ParseIntPipe) keepLatest: number
  ) {
    return await this.pluginRegistryService.archiveOldPluginVersions(name, keepLatest);
  }

  @Delete(':name/versions/:version')
  @RateLimit('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete a specific version of a plugin',
    description: 'Permanently delete a specific version of a plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiParam({ name: 'version', description: 'Version to delete' })
  @ApiQuery({ 
    name: 'force', 
    required: false, 
    type: Boolean, 
    description: 'Force deletion even if it is the active version' 
  })
  @ApiResponse({ status: 204, description: 'Version deleted successfully' })
  @ApiResponse({ status: 404, description: 'Plugin or version not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete active version without force flag' })
  async deleteVersion(
    @Param('name') name: string,
    @Param('version') version: string,
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force: boolean
  ) {
    await this.pluginRegistryService.deletePluginVersion(name, version, force);
  }

  @Post(':name/versions/compatibility-check')
  @RateLimit('api')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Check compatibility between two versions',
    description: 'Check compatibility between two versions of a plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({ 
    type: VersionCompatibilityDto,
    description: 'Version comparison configuration'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Compatibility check completed',
    schema: {
      type: 'object',
      properties: {
        isCompatible: { type: 'boolean' },
        compatibilityIssues: { type: 'array', items: { type: 'string' } },
        migrationRequired: { type: 'boolean' },
        deprecatedFeatures: { type: 'array', items: { type: 'string' } },
        breakingChanges: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin or versions not found' })
  async checkVersionCompatibility(
    @Param('name') name: string,
    @Body() compatibilityDto: VersionCompatibilityDto
  ) {
    return await this.pluginRegistryService.checkVersionCompatibility(
      name,
      compatibilityDto.fromVersion,
      compatibilityDto.toVersion
    );
  }

  @Get(':name/versions/statistics')
  @RateLimit('api')
  @ApiOperation({ 
    summary: 'Get version statistics for a plugin',
    description: 'Retrieve comprehensive statistics about all versions of a plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiResponse({ 
    status: 200, 
    description: 'Plugin version statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalVersions: { type: 'number' },
        activeVersion: { type: 'string', nullable: true },
        newestVersion: { type: 'string' },
        oldestVersion: { type: 'string' },
        totalDownloads: { type: 'number' },
        averageFileSize: { type: 'number' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async getVersionStatistics(@Param('name') name: string) {
    return await this.pluginRegistryService.getPluginVersionStatistics(name);
  }

  @Post(':name/versions/upload')
  @RateLimit('upload')
  @UseInterceptors(FileInterceptor('plugin'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Upload a new version of an existing plugin',
    description: 'Upload a new version of an existing plugin with optional auto-activation'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiQuery({ 
    name: 'makeActive', 
    required: false, 
    type: Boolean, 
    description: 'Whether to make this version active immediately (default: true)' 
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        plugin: {
          type: 'string',
          format: 'binary',
          description: 'Plugin zip file'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Plugin version uploaded successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid plugin file or version already exists' })
  @ApiResponse({ status: 413, description: 'Plugin file too large' })
  async uploadPluginVersion(
    @Param('name') name: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('makeActive', new DefaultValuePipe(true), ParseBoolPipe) makeActive: boolean
  ) {
    if (!file) {
      throw new Error('No plugin file provided');
    }

    return await this.pluginRegistryService.uploadPluginVersion(file.buffer, makeActive);
  }

  @Get(':name/versions/:version/download')
  @RateLimit('download')
  @ApiOperation({ 
    summary: 'Download a specific version of a plugin',
    description: 'Download a specific version of a plugin'
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiParam({ name: 'version', description: 'Plugin version' })
  @ApiResponse({ 
    status: 200, 
    description: 'Plugin version downloaded successfully',
    headers: {
      'Content-Type': { description: 'application/zip' },
      'Content-Disposition': { description: 'attachment; filename=plugin.zip' }
    }
  })
  @ApiResponse({ status: 404, description: 'Plugin or version not found' })
  async downloadPluginVersion(
    @Param('name') name: string,
    @Param('version') version: string
  ) {
    // This would need implementation in the service to download a specific version
    const versionEntity = await this.pluginRegistryService.getPluginVersion(name, version);
    if (!versionEntity) {
      throw new Error(`Version ${version} not found for plugin ${name}`);
    }

    // For now, delegate to the existing download method
    // In a full implementation, this would be modified to download the specific version
    return await this.pluginRegistryService.downloadPlugin(name);
  }
}