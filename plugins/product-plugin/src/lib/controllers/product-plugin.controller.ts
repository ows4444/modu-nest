import { PluginRoute, PluginGet, PluginPost, PluginPut, PluginDelete, PluginUseGuards } from '@modu-nest/plugin-types';
import { Body, Param, Query, Request, ValidationPipe, UsePipes } from '@nestjs/common';
import { ProductPluginService } from '../services/product-plugin.service';

@PluginRoute('products')
export class ProductPluginController {
  constructor(private readonly productPluginService: ProductPluginService) {}

  @PluginGet()
  getHello(): string {
    return this.productPluginService.getHello();
  }

  // === BASIC PRODUCT CRUD OPERATIONS ===

  @PluginGet('all')
  @PluginUseGuards('user-auth')
  getAllProducts() {
    return this.productPluginService.getAllProducts();
  }

  @PluginGet('search')
  @PluginUseGuards('user-auth')
  searchProducts(@Query('q') query: string) {
    if (!query) {
      return this.productPluginService.getAllProducts();
    }
    return this.productPluginService.searchProducts(query);
  }

  @PluginGet('category/:category')
  @PluginUseGuards('user-auth')
  getProductsByCategory(@Param('category') category: string) {
    return this.productPluginService.getProductsByCategory(category);
  }

  @PluginGet('owner/:ownerId')
  @PluginUseGuards('user-auth', 'user-ownership')
  getProductsByOwner(@Param('ownerId') ownerId: string) {
    return this.productPluginService.getProductsByOwner(ownerId);
  }

  @PluginGet(':id')
  @PluginUseGuards('user-auth')
  getProductById(@Param('id') id: string) {
    return this.productPluginService.getProductById(id);
  }

  @PluginPost()
  @PluginUseGuards('user-auth', 'product-access')
  @UsePipes(new ValidationPipe())
  createProduct(@Body() createProductDto: any, @Request() req: any) {
    const userId = req.user?.id;
    return this.productPluginService.createProduct(createProductDto, userId);
  }

  @PluginPut(':id')
  @PluginUseGuards('user-auth', 'product-access', 'product-ownership')
  @UsePipes(new ValidationPipe())
  updateProduct(@Param('id') id: string, @Body() updateProductDto: any) {
    return this.productPluginService.updateProduct(id, updateProductDto);
  }

  @PluginDelete(':id')
  @PluginUseGuards('user-auth', 'product-access', 'product-ownership')
  deleteProduct(@Param('id') id: string) {
    this.productPluginService.deleteProduct(id);
    return { message: 'Product deleted successfully' };
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

  @PluginGet('test/product-access')
  @PluginUseGuards('user-auth', 'product-access')
  testProductAccess() {
    return { message: 'This endpoint requires product access permissions', timestamp: new Date() };
  }

  @PluginGet('test/ownership/:id')
  @PluginUseGuards('user-auth', 'product-ownership')
  testOwnership(@Param('id') id: string) {
    return { message: `This endpoint requires ownership of product ${id}`, timestamp: new Date() };
  }

  @PluginGet('test/full-access/:id')
  @PluginUseGuards('user-auth', 'product-access', 'product-ownership')
  testFullAccess(@Param('id') id: string) {
    return { message: `This endpoint requires full access to product ${id}`, timestamp: new Date() };
  }

  // === CROSS-PLUGIN INTEGRATION ===

  @PluginGet('validate/:id')
  @PluginUseGuards('user-auth')
  validateProduct(@Param('id') id: string) {
    return {
      exists: this.productPluginService.validateProductExists(id),
      owner: this.productPluginService.getProductOwner(id),
    };
  }

  @PluginGet('ownership/:id/:userId')
  @PluginUseGuards('user-auth')
  checkProductOwnership(@Param('id') id: string, @Param('userId') userId: string) {
    return {
      isOwner: this.productPluginService.isProductOwnedBy(id, userId),
    };
  }

  @PluginGet('with-users')
  @PluginUseGuards('user-auth', 'admin-role')
  async getProductsWithUsers() {
    return {
      message: 'Products enriched with user data via cross-plugin integration',
    };
  }

  @PluginPost('transfer/:productId')
  @PluginUseGuards('user-auth', 'product-ownership')
  @UsePipes(new ValidationPipe())
  async transferOwnership(@Param('productId') productId: string, @Body() data: { newOwnerId: string }) {
    const { newOwnerId } = data;

    try {
      const updatedProduct = this.productPluginService.updateProduct(productId, {
        ownerId: newOwnerId,
      });

      return {
        product: updatedProduct,
        message: 'Product ownership transferred via cross-plugin integration',
      };
    } catch (error: any) {
      return {
        error: 'Failed to transfer product ownership',
        details: error?.message || 'Unknown error',
      };
    }
  }
}
