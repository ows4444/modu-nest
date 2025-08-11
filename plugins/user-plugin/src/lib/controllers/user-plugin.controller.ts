import {
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginUseGuards,
  PluginPermissions,
  PluginRoutePrefix,
  PluginLifecycleHookDecorator,
} from '@libs/plugin-decorators';
import { type ICrossPluginService, CROSS_PLUGIN_SERVICE_TOKEN } from '@libs/plugin-core';
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
import { UserPluginService } from '../services/user-plugin.service';
import type { CreateUserDto, UpdateUserDto } from '../interfaces/user.interface';
import { ApiResponse, ErrorHandler } from '@libs/shared-utils';

@PluginRoutePrefix('users')
export class UserPluginController {
  private readonly logger = new Logger(UserPluginController.name);

  constructor(
    private readonly userPluginService: UserPluginService,
    @Optional() @Inject(CROSS_PLUGIN_SERVICE_TOKEN) private readonly crossPluginService?: ICrossPluginService
  ) {}

  @PluginGet()
  getHello(): string {
    return this.userPluginService.getHello();
  }

  // === PLUGIN LIFECYCLE HOOKS ===

  @PluginLifecycleHookDecorator('beforeLoad')
  onPluginBeforeLoad() {
    this.logger.log(`User plugin is initializing before load at ${new Date().toISOString()}`);

    // Initialize user authentication system
    return {
      message: 'User plugin is initializing authentication system',
      timestamp: new Date(),
      status: 'initializing',
    };
  }

  @PluginLifecycleHookDecorator('afterLoad')
  onPluginAfterLoad() {
    this.logger.log(`User plugin has loaded successfully at ${new Date().toISOString()}`);

    // Confirm authentication system is ready
    return {
      message: 'User plugin authentication system ready',
      timestamp: new Date(),
      status: 'ready',
    };
  }

  @PluginLifecycleHookDecorator('beforeUnload')
  onPluginBeforeUnload() {
    this.logger.log(`User plugin is preparing to unload at ${new Date().toISOString()}`);

    // Cleanup authentication sessions
    try {
      // Here you would cleanup active sessions, cache, etc.
      this.logger.debug('Cleaning up user authentication sessions');
    } catch (error) {
      this.logger.error('Error during authentication cleanup', error);
    }

    return {
      message: 'User plugin is cleaning up authentication resources',
      timestamp: new Date(),
      status: 'cleaning-up',
    };
  }

  @PluginLifecycleHookDecorator('afterUnload')
  onPluginAfterUnload() {
    this.logger.log(`User plugin has unloaded successfully at ${new Date().toISOString()}`);
    return {
      message: 'User plugin has unloaded successfully',
      timestamp: new Date(),
      status: 'unloaded',
    };
  }

  @PluginLifecycleHookDecorator('onError')
  onPluginError(error: Error) {
    this.logger.error(`User plugin encountered an error: ${error.message} at ${new Date().toISOString()}`, error.stack);

    // Handle plugin-specific errors
    if (error.message.includes('authentication')) {
      this.logger.error('Authentication system error detected');
    }

    return {
      message: 'User plugin encountered an error',
      error: {
        message: error.message,
        type: error.constructor.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      timestamp: new Date(),
      status: 'error',
    };
  }

  // === BASIC USER CRUD OPERATIONS ===

  @PluginGet('all')
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:read', 'admin:access'])
  getAllUsers() {
    return this.userPluginService.getAllUsers();
  }

  @PluginGet('by-role')
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:read', 'admin:access'])
  getUsersByRole(@Query('role') role: string) {
    return this.userPluginService.getUsersByRole(role);
  }

  @PluginGet(':id')
  @PluginUseGuards('user-auth', 'user-ownership')
  @PluginPermissions(['users:read:own'])
  async getUserById(@Param('id') id: string): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('User ID is required');
      }

      const user = await this.userPluginService.getUserById(id);
      if (!user) {
        ErrorHandler.throwNotFound('User', id);
      }

      return ErrorHandler.createSuccessResponse(user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get user by ID: ${id}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'getUserById'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginPost()
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:write', 'admin:access'])
  @UsePipes(new ValidationPipe())
  async createUser(@Body() createUserDto: CreateUserDto): Promise<ApiResponse> {
    try {
      const user = await this.userPluginService.createUser(createUserDto);
      return ErrorHandler.createSuccessResponse(user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to create user', { error, dto: createUserDto });
      throw new HttpException(ErrorHandler.handleError(error, 'createUser'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginPut(':id')
  @PluginUseGuards('user-auth', 'user-ownership')
  @PluginPermissions(['users:write:own'])
  @UsePipes(new ValidationPipe())
  async updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('User ID is required');
      }

      const updatedUser = await this.userPluginService.updateUser(id, updateUserDto);
      if (!updatedUser) {
        ErrorHandler.throwNotFound('User', id);
      }

      return ErrorHandler.createSuccessResponse(updatedUser);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update user: ${id}`, { error, dto: updateUserDto });
      throw new HttpException(ErrorHandler.handleError(error, 'updateUser'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginDelete(':id')
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:delete', 'admin:access'])
  async deleteUser(@Param('id') id: string): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('User ID is required');
      }

      await this.userPluginService.deleteUser(id);

      return ErrorHandler.createSuccessResponse({
        message: 'User deleted successfully',
        id,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete user: ${id}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'deleteUser'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // === GUARD TESTING ENDPOINTS ===

  @PluginGet('test/no-auth')
  testNoAuth() {
    return { message: 'This endpoint requires no authentication', timestamp: new Date() };
  }

  @PluginGet('test/auth-only')
  @PluginUseGuards('user-auth')
  testAuthOnly() {
    return { message: 'This endpoint requires only user authentication', timestamp: new Date() };
  }

  @PluginGet('test/admin-only')
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['admin:*'])
  testAdminOnly() {
    return { message: 'This endpoint requires admin role', timestamp: new Date() };
  }

  @PluginGet('test/ownership/:id')
  @PluginUseGuards('user-auth', 'user-ownership')
  testOwnership(@Param('id') id: string) {
    return { message: `This endpoint requires ownership of user ${id}`, timestamp: new Date() };
  }

  // === CROSS-PLUGIN INTEGRATION ===

  @PluginGet('validate/:id')
  @PluginUseGuards('user-auth')
  validateUser(@Param('id') id: string) {
    return {
      exists: this.userPluginService.validateUserExists(id),
      roles: this.userPluginService.getUserRoles(id),
      isAdmin: this.userPluginService.isUserAdmin(id),
    };
  }

  @PluginGet('products/:userId')
  @PluginUseGuards('user-auth', 'user-ownership')
  async getUserProducts(@Param('userId') userId: string): Promise<ApiResponse> {
    try {
      if (!userId || userId.trim() === '') {
        ErrorHandler.throwBadRequest('User ID is required');
      }

      const user = await this.userPluginService.getUserById(userId);
      if (!user) {
        ErrorHandler.throwNotFound('User', userId);
      }

      // Get user's products via cross-plugin service
      let products: any[] = [];
      if (this.crossPluginService) {
        try {
          const productService = await this.crossPluginService.getService('PRODUCT_PLUGIN_SERVICE');
          if (productService) {
            products =
              (await this.crossPluginService.callServiceMethod(
                'PRODUCT_PLUGIN_SERVICE',
                'getProductsByOwner',
                userId
              )) || [];
          } else {
            this.logger.warn('Product service not available via cross-plugin communication');
          }
        } catch (error) {
          this.logger.error(`Failed to get products for user ${userId}`, error);
        }
      } else {
        this.logger.warn('Cross-plugin service not available');
      }

      return ErrorHandler.createSuccessResponse({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          roles: user.roles,
        },
        products,
        productsCount: products.length,
        message: 'User products retrieved via cross-plugin integration',
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get products for user: ${userId}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'getUserProducts'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginPost('create-with-product')
  @PluginUseGuards('user-auth', 'admin-role')
  @UsePipes(new ValidationPipe())
  async createUserWithProduct(@Body() data: { user: CreateUserDto; productData?: any }): Promise<ApiResponse> {
    const { user: userData, productData } = data;

    try {
      // Create the user first
      const newUser = await this.userPluginService.createUser(userData);
      if (!newUser) {
        ErrorHandler.throwBadRequest('Failed to create user');
      }

      let product: any = null;

      // Try to create a default product for the user if product data provided
      if (productData && this.crossPluginService) {
        try {
          const productService = await this.crossPluginService.getService('PRODUCT_PLUGIN_SERVICE');
          if (productService) {
            product = await this.crossPluginService.callServiceMethod(
              'PRODUCT_PLUGIN_SERVICE',
              'createProduct',
              {
                ...productData,
                ownerId: newUser.id,
              },
              newUser.id
            );
          } else {
            this.logger.warn('Product service not available for creating default product');
          }
        } catch (error) {
          this.logger.error(`Failed to create product for new user ${newUser.id}`, error);
          // Don't fail the entire operation if product creation fails
        }
      } else if (!this.crossPluginService) {
        this.logger.warn('Cross-plugin service not available for product creation');
      }

      return ErrorHandler.createSuccessResponse({
        user: newUser,
        product,
        message: product
          ? 'User and product created successfully via cross-plugin integration'
          : 'User created successfully (product creation skipped)',
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to create user with product', { error, userData });
      throw new HttpException(
        ErrorHandler.handleError(error, 'createUserWithProduct'),
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
