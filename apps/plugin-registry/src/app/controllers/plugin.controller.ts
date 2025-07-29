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
  Body,
  UsePipes
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PluginRegistryService } from '../services/plugin-registry.service';
import { CreatePluginValidationDto } from '../dto/plugin.dto';
import type { PluginResponseDto, PluginListResponseDto, PluginDeleteResponseDto } from '@modu-nest/plugin-types';

@Controller('plugins')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PluginController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Post()
  @UseInterceptors(FileInterceptor('plugin'))
  async uploadPlugin(
    @UploadedFile() file: any,
    @Body() manifest?: CreatePluginValidationDto
  ): Promise<PluginResponseDto> {
    if (!file) {
      throw new BadRequestException('No plugin file provided');
    }

    const result = await this.pluginRegistryService.uploadPlugin(file.buffer, manifest);
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
  async downloadPlugin(
    @Param('name') name: string,
    @Res() res: Response
  ): Promise<void> {
    const { buffer, metadata } = await this.pluginRegistryService.downloadPlugin(name);
    
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
      deletedPlugin: name
    };
  }
}