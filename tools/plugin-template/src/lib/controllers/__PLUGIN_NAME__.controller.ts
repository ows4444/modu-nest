import {
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  Logger,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import {
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginUseGuards,
  PluginPermissions,
  PluginRoutePrefix,
} from '@modu-nest/plugin-decorators';
import { ICrossPluginService, CROSS_PLUGIN_SERVICE_TOKEN } from '@modu-nest/plugin-core';
import { ApiResponse, ErrorHandler } from '@modu-nest/utils';
import { __PLUGIN_NAME_PASCAL__Service } from '../services/__PLUGIN_NAME__.service';
import type { Create__PLUGIN_NAME_PASCAL__Dto, Update__PLUGIN_NAME_PASCAL__Dto } from '../interfaces/__PLUGIN_NAME__.interface';

@PluginRoutePrefix('__PLUGIN_NAME_PLURAL__')
export class __PLUGIN_NAME_PASCAL__Controller {
  private readonly logger = new Logger(__PLUGIN_NAME_PASCAL__Controller.name);

  constructor(
    private readonly __PLUGIN_NAME_CAMEL__Service: __PLUGIN_NAME_PASCAL__Service,
    @Optional() @Inject(CROSS_PLUGIN_SERVICE_TOKEN) private readonly crossPluginService?: ICrossPluginService
  ) {}

  @PluginGet()
  @PluginPermissions(['__PLUGIN_NAME__:read'])
  async getAll(): Promise<ApiResponse<any[]>> {
    try {
      const items = await this.__PLUGIN_NAME_CAMEL__Service.findAll();
      return ApiResponse.success(items);
    } catch (error) {
      this.logger.error('Failed to get __PLUGIN_NAME_PLURAL__', error);
      throw ErrorHandler.handle(error);
    }
  }

  @PluginGet(':id')
  @PluginPermissions(['__PLUGIN_NAME__:read'])
  async getById(@Param('id') id: string): Promise<ApiResponse<any>> {
    try {
      const item = await this.__PLUGIN_NAME_CAMEL__Service.findById(id);
      if (!item) {
        throw new HttpException('__PLUGIN_NAME_PASCAL__ not found', HttpStatus.NOT_FOUND);
      }
      return ApiResponse.success(item);
    } catch (error) {
      this.logger.error(`Failed to get __PLUGIN_NAME__ ${id}`, error);
      throw ErrorHandler.handle(error);
    }
  }

  @PluginPost()
  @PluginPermissions(['__PLUGIN_NAME__:create'])
  @PluginUseGuards('__PLUGIN_NAME__-access')
  @UsePipes(new ValidationPipe())
  async create(@Body() dto: Create__PLUGIN_NAME_PASCAL__Dto): Promise<ApiResponse<any>> {
    try {
      const item = await this.__PLUGIN_NAME_CAMEL__Service.create(dto);
      return ApiResponse.success(item, '__PLUGIN_NAME_PASCAL__ created successfully');
    } catch (error) {
      this.logger.error('Failed to create __PLUGIN_NAME__', error);
      throw ErrorHandler.handle(error);
    }
  }

  @PluginPut(':id')
  @PluginPermissions(['__PLUGIN_NAME__:update'])
  @PluginUseGuards('__PLUGIN_NAME__-access')
  @UsePipes(new ValidationPipe())
  async update(
    @Param('id') id: string,
    @Body() dto: Update__PLUGIN_NAME_PASCAL__Dto
  ): Promise<ApiResponse<any>> {
    try {
      const item = await this.__PLUGIN_NAME_CAMEL__Service.update(id, dto);
      return ApiResponse.success(item, '__PLUGIN_NAME_PASCAL__ updated successfully');
    } catch (error) {
      this.logger.error(`Failed to update __PLUGIN_NAME__ ${id}`, error);
      throw ErrorHandler.handle(error);
    }
  }

  @PluginDelete(':id')
  @PluginPermissions(['__PLUGIN_NAME__:delete'])
  @PluginUseGuards('__PLUGIN_NAME__-access')
  async delete(@Param('id') id: string): Promise<ApiResponse<void>> {
    try {
      await this.__PLUGIN_NAME_CAMEL__Service.delete(id);
      return ApiResponse.success(undefined, '__PLUGIN_NAME_PASCAL__ deleted successfully');
    } catch (error) {
      this.logger.error(`Failed to delete __PLUGIN_NAME__ ${id}`, error);
      throw ErrorHandler.handle(error);
    }
  }
}