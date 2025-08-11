import {
  PluginRoutePrefix,
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginUseGuards,
  PluginPermissions,
  PluginLifecycleHookDecorator,
} from '@libs/plugin-decorators';
import {
  Body,
  Param,
  Query,
  Request,
  ValidationPipe,
  UsePipes,
  Logger,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { ProductPluginService } from '../services/product-plugin.service';
import type { CreateProductDto, UpdateProductDto } from '../interfaces/product.interface';
import { ErrorHandler, ApiResponse } from '@libs/shared-utils';
import { CROSS_PLUGIN_SERVICE_TOKEN, type ICrossPluginService } from '@libs/plugin-core';

@PluginRoutePrefix('products')
export class ProductPluginController {
  private readonly logger = new Logger(ProductPluginController.name);

  constructor(
    private readonly productPluginService: ProductPluginService,
    @Optional() @Inject(CROSS_PLUGIN_SERVICE_TOKEN) private readonly crossPluginService?: ICrossPluginService
  ) {}

  @PluginGet()
  getHello(): string {
    return this.productPluginService.getHello();
  }

  @PluginLifecycleHookDecorator('beforeLoad')
  onPluginBeforeLoad() {
    this.logger.log(`Product plugin is initializing before load at ${new Date().toISOString()}`);

    // Initialize product management system
    return {
      message: 'Product plugin is initializing product management system',
      timestamp: new Date(),
      status: 'initializing',
    };
  }

  @PluginLifecycleHookDecorator('afterLoad')
  onPluginAfterLoad() {
    this.logger.log(`Product plugin has loaded successfully at ${new Date().toISOString()}`);

    // Confirm product management system is ready
    return {
      message: 'Product plugin management system ready',
      timestamp: new Date(),
      status: 'ready',
    };
  }

  @PluginLifecycleHookDecorator('beforeUnload')
  onPluginBeforeUnload() {
    this.logger.log(`Product plugin is preparing to unload at ${new Date().toISOString()}`);

    // Cleanup product management resources
    try {
      // Here you would cleanup caches, close connections, etc.
      this.logger.debug('Cleaning up product management resources');
    } catch (error) {
      this.logger.error('Error during product management cleanup', error);
    }

    return {
      message: 'Product plugin is cleaning up management resources',
      timestamp: new Date(),
      status: 'cleaning-up',
    };
  }

  @PluginLifecycleHookDecorator('afterUnload')
  onPluginAfterUnload() {
    this.logger.log(`Product plugin has unloaded successfully at ${new Date().toISOString()}`);
    return {
      message: 'Product plugin has unloaded successfully',
      timestamp: new Date(),
      status: 'unloaded',
    };
  }

  @PluginLifecycleHookDecorator('onError')
  onPluginError(error: Error) {
    this.logger.error(
      `Product plugin encountered an error: ${error.message} at ${new Date().toISOString()}`,
      error.stack
    );

    // Handle plugin-specific errors
    if (error.message.includes('product')) {
      this.logger.error('Product management error detected');
    }

    return {
      message: 'Product plugin encountered an error',
      error: {
        message: error.message,
        type: error.constructor.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      timestamp: new Date(),
      status: 'error',
    };
  }

  // === BASIC PRODUCT CRUD OPERATIONS ===

  @PluginGet('all')
  @PluginUseGuards('auth')
  @PluginPermissions(['products:read'])
  async getAllProducts(): Promise<ApiResponse> {
    try {
      const products = await this.productPluginService.getAllProducts();
      return ErrorHandler.createSuccessResponse(products);
    } catch (error) {
      this.logger.error('Failed to get all products', error);
      throw new HttpException(ErrorHandler.handleError(error, 'getAllProducts'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginGet('search')
  @PluginUseGuards('auth')
  async searchProducts(@Query('q') query: string): Promise<ApiResponse> {
    try {
      if (!query) {
        const products = await this.productPluginService.getAllProducts();
        return ErrorHandler.createSuccessResponse(products);
      }
      const products = await this.productPluginService.searchProducts(query);
      return ErrorHandler.createSuccessResponse(products);
    } catch (error) {
      this.logger.error(`Failed to search products with query: ${query}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'searchProducts'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginGet('category/:category')
  @PluginUseGuards('auth')
  getProductsByCategory(@Param('category') category: string) {
    return this.productPluginService.getProductsByCategory(category);
  }

  @PluginGet('owner/:ownerId')
  @PluginUseGuards('auth', 'user-ownership')
  getProductsByOwner(@Param('ownerId') ownerId: string) {
    return this.productPluginService.getProductsByOwner(ownerId);
  }

  @PluginGet(':id')
  @PluginUseGuards('auth')
  async getProductById(@Param('id') id: string): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('Product ID is required');
      }

      const product = await this.productPluginService.getProductById(id);
      if (!product) {
        ErrorHandler.throwNotFound('Product', id);
      }

      return ErrorHandler.createSuccessResponse(product);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get product by ID: ${id}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'getProductById'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginPost()
  @PluginUseGuards('auth', 'product-access')
  @PluginPermissions(['products:write:own'])
  @UsePipes(new ValidationPipe())
  async createProduct(
    @Body() createProductDto: CreateProductDto,
    @Request() req: { user?: { id: string } }
  ): Promise<ApiResponse> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ErrorHandler.throwUnauthorized('User ID not found in request');
      }

      const product = await this.productPluginService.createProduct(createProductDto, userId);
      return ErrorHandler.createSuccessResponse(product);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to create product', { error, dto: createProductDto });
      throw new HttpException(ErrorHandler.handleError(error, 'createProduct'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginPut(':id')
  @PluginUseGuards('auth', 'product-access', 'product-ownership')
  @PluginPermissions(['products:write:own'])
  @UsePipes(new ValidationPipe())
  async updateProduct(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('Product ID is required');
      }

      const updatedProduct = await this.productPluginService.updateProduct(id, updateProductDto);
      if (!updatedProduct) {
        ErrorHandler.throwNotFound('Product', id);
      }

      return ErrorHandler.createSuccessResponse(updatedProduct);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update product: ${id}`, { error, dto: updateProductDto });
      throw new HttpException(ErrorHandler.handleError(error, 'updateProduct'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @PluginDelete(':id')
  @PluginUseGuards('auth', 'product-access', 'product-ownership')
  @PluginPermissions(['products:delete:own'])
  async deleteProduct(@Param('id') id: string): Promise<ApiResponse> {
    try {
      if (!id || id.trim() === '') {
        ErrorHandler.throwBadRequest('Product ID is required');
      }

      await this.productPluginService.deleteProduct(id);

      return ErrorHandler.createSuccessResponse({
        message: 'Product deleted successfully',
        id,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete product: ${id}`, error);
      throw new HttpException(ErrorHandler.handleError(error, 'deleteProduct'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // === GUARD TESTING ENDPOINTS ===

  @PluginGet('test/no-auth')
  testNoAuth() {
    return { message: 'This endpoint requires no authentication', timestamp: new Date() };
  }

  @PluginGet('test/auth-only')
  @PluginUseGuards('auth')
  testAuthOnly() {
    return { message: 'This endpoint requires only user authentication', timestamp: new Date() };
  }

  @PluginGet('test/product-access')
  @PluginUseGuards('auth', 'product-access')
  testProductAccess() {
    return { message: 'This endpoint requires product access permissions', timestamp: new Date() };
  }

  @PluginGet('test/ownership/:id')
  @PluginUseGuards('auth', 'product-ownership')
  testOwnership(@Param('id') id: string) {
    return { message: `This endpoint requires ownership of product ${id}`, timestamp: new Date() };
  }

  @PluginGet('test/full-access/:id')
  @PluginUseGuards('auth', 'product-access', 'product-ownership')
  testFullAccess(@Param('id') id: string) {
    return { message: `This endpoint requires full access to product ${id}`, timestamp: new Date() };
  }

  // === CROSS-PLUGIN INTEGRATION ===

  @PluginGet('validate/:id')
  @PluginUseGuards('auth')
  validateProduct(@Param('id') id: string) {
    return {
      exists: this.productPluginService.validateProductExists(id),
      owner: this.productPluginService.getProductOwner(id),
    };
  }

  @PluginGet('ownership/:id/:userId')
  @PluginUseGuards('auth')
  checkProductOwnership(@Param('id') id: string, @Param('userId') userId: string) {
    return {
      isOwner: this.productPluginService.isProductOwnedBy(id, userId),
    };
  }

  @PluginGet('with-users')
  @PluginUseGuards('auth', 'admin-role')
  async getProductsWithUsers(): Promise<ApiResponse> {
    try {
      const products = await this.productPluginService.getAllProducts();

      if (!this.crossPluginService) {
        this.logger.warn('Cross-plugin service not available, returning products without user data');
        return ErrorHandler.createSuccessResponse({
          products,
          message: 'Products retrieved (user data unavailable - cross-plugin service not configured)',
        });
      }

      // Try to get user service for enriching product data
      const userService = await this.crossPluginService.getService('USER_PLUGIN_SERVICE');
      if (!userService) {
        this.logger.warn('User service not available via cross-plugin communication');
        return ErrorHandler.createSuccessResponse({
          products,
          message: 'Products retrieved (user service not available)',
        });
      }

      // Enrich products with user data
      const enrichedProducts = await Promise.all(
        products.map(async (product: any) => {
          try {
            const userInfo = await this.crossPluginService?.callServiceMethod(
              'USER_PLUGIN_SERVICE',
              'getUserById',
              product.ownerId
            );

            return {
              ...product,
              owner: userInfo
                ? {
                    id: userInfo.id,
                    username: userInfo.username,
                    email: userInfo.email,
                  }
                : null,
            };
          } catch (error) {
            this.logger.error(`Failed to get user data for product ${product.id}`, error);
            return {
              ...product,
              owner: null,
            };
          }
        })
      );

      return ErrorHandler.createSuccessResponse({
        products: enrichedProducts,
        message: 'Products enriched with user data via cross-plugin integration',
      });
    } catch (error) {
      this.logger.error('Failed to get products with users', error);
      throw new HttpException(
        ErrorHandler.handleError(error, 'getProductsWithUsers'),
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @PluginPost('transfer/:productId')
  @PluginUseGuards('auth', 'product-ownership')
  @UsePipes(new ValidationPipe())
  async transferOwnership(
    @Param('productId') productId: string,
    @Body() data: { newOwnerId: string }
  ): Promise<ApiResponse> {
    const { newOwnerId } = data;

    try {
      if (!newOwnerId || newOwnerId.trim() === '') {
        ErrorHandler.throwBadRequest('New owner ID is required');
      }

      // Verify the new owner exists using cross-plugin service
      if (this.crossPluginService) {
        const userExists = await this.crossPluginService.callServiceMethod(
          'USER_PLUGIN_SERVICE',
          'getUserById',
          newOwnerId
        );

        if (!userExists) {
          ErrorHandler.throwBadRequest(`User with ID '${newOwnerId}' does not exist`);
        }
      } else {
        this.logger.warn('Cross-plugin service not available, skipping user validation');
      }

      const updatedProduct = await this.productPluginService.updateProduct(productId, {
        ownerId: newOwnerId,
      });

      if (!updatedProduct) {
        ErrorHandler.throwNotFound('Product', productId);
      }

      return ErrorHandler.createSuccessResponse({
        product: updatedProduct,
        message: 'Product ownership transferred successfully',
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to transfer product ownership: ${productId}`, { error, newOwnerId });
      throw new HttpException(ErrorHandler.handleError(error, 'transferOwnership'), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
