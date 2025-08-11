import { PluginContext } from '@libs/plugin-context';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Product, CreateProductDto, UpdateProductDto } from '../interfaces/product.interface';
import { PluginInjectable } from '@libs/plugin-core';

@PluginInjectable()
export class ProductPluginService {
  private readonly logger = new Logger(ProductPluginService.name);
  private products: Map<string, Product> = new Map();
  private context: PluginContext | null = null;

  constructor() {
    // Initialize with sample data
    this.initializeSampleData();
    this.logger.log(`ProductPluginService initialized with ${this.products.size} sample products`);
  }

  // Method to inject the plugin context (called by plugin loader)
  setPluginContext(context: PluginContext): void {
    this.context = context;
    this.logger.log(`Plugin context injected for product-plugin`);

    // Demonstrate context usage
    this.demonstrateContextUsage();
  }

  getHello(): string {
    return 'Hello from ProductPlugin plugin!';
  }

  private async demonstrateContextUsage(): Promise<void> {
    if (!this.context) return;

    try {
      // Demonstrate file access
      this.logger.debug('Demonstrating file access capabilities...');

      // Save products to file
      await this.saveProductsToFile();

      // Demonstrate network access
      this.logger.debug('Demonstrating network access capabilities...');
      await this.fetchExternalProductData();

      // Demonstrate database access
      this.logger.debug('Demonstrating database access capabilities...');
      await this.syncProductsToDatabase();

      // Show metrics
      const metrics = await this.context.utils.getMetrics();
      this.logger.log('Plugin context metrics:', metrics);
    } catch (error) {
      this.logger.error('Error demonstrating context usage:', error);
    }
  }

  private async saveProductsToFile(): Promise<void> {
    if (!this.context) return;

    try {
      const productsData = JSON.stringify(Array.from(this.products.values()), null, 2);
      await this.context.fileAccess.writeFile('./temp/products/products.json', productsData);
      this.logger.debug('Products saved to file successfully');
    } catch (error) {
      this.logger.warn('Failed to save products to file:', error);
    }
  }

  private async fetchExternalProductData(): Promise<void> {
    if (!this.context) return;

    try {
      // Example API call to fetch product data
      const response = await this.context.networkAccess.get('https://api.github.com/repos/microsoft/TypeScript', {
        'User-Agent': 'ProductPlugin/1.0',
      });

      this.logger.debug(`External API response status: ${response.statusCode}, size: ${response.size} bytes`);
    } catch (error) {
      this.logger.warn('Failed to fetch external product data:', error);
    }
  }

  private async syncProductsToDatabase(): Promise<void> {
    if (!this.context) return;

    try {
      // Example database operations
      const products = Array.from(this.products.values());

      for (const product of products.slice(0, 3)) {
        // Sync first 3 products
        await this.context.databaseAccess.insert('products', {
          id: product.id,
          name: product.name,
          price: product.price,
          category: product.category,
          updated_at: new Date().toISOString(),
        });
      }

      // Query to verify
      const result = await this.context.databaseAccess.select('products', 'id = ?', ['1']);
      this.logger.debug(`Database sync completed. Query result: ${result.rowCount} rows`);
    } catch (error) {
      this.logger.warn('Failed to sync products to database:', error);
    }
  }

  // Enhanced methods that use context for persistence
  async saveProduct(productData: CreateProductDto): Promise<Product> {
    const product = this.createProduct(productData);

    // Save to file if context is available
    if (this.context) {
      try {
        await this.context.fileAccess.writeFile(
          `./temp/products/product-${product.id}.json`,
          JSON.stringify(product, null, 2)
        );

        // Also save to database
        await this.context.databaseAccess.insert('products', {
          id: product.id,
          name: product.name,
          price: product.price,
          category: product.category,
          created_at: product.createdAt.toISOString(),
          updated_at: product.updatedAt.toISOString(),
        });

        this.logger.debug(`Product ${product.id} persisted to file and database`);
      } catch (error) {
        this.logger.warn(`Failed to persist product ${product.id}:`, error);
      }
    }

    return product;
  }

  async getProductMetrics(): Promise<any> {
    if (!this.context) {
      return { error: 'Plugin context not available' };
    }

    const metrics = await this.context.utils.getMetrics();
    return {
      pluginMetrics: metrics,
      productCount: this.products.size,
      availableProducts: this.getAllProducts().length,
    };
  }

  private initializeSampleData() {
    const sampleProducts: Product[] = [
      {
        id: 'product-1',
        name: 'Laptop',
        description: 'High-performance laptop for developers',
        price: 1299.99,
        category: 'Electronics',
        ownerId: 'user-123',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'product-2',
        name: 'Smartphone',
        description: 'Latest smartphone with advanced features',
        price: 799.99,
        category: 'Electronics',
        ownerId: 'user-456',
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: 'product-3',
        name: 'Coffee Maker',
        description: 'Automatic coffee maker with timer',
        price: 149.99,
        category: 'Appliances',
        ownerId: 'user-123',
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03'),
      },
    ];

    sampleProducts.forEach((product) => this.products.set(product.id, product));
  }

  getAllProducts(): Product[] {
    return Array.from(this.products.values());
  }

  getProductById(id: string): Product {
    const product = this.products.get(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  getProductsByCategory(category: string): Product[] {
    return Array.from(this.products.values()).filter(
      (product) => product.category.toLowerCase() === category.toLowerCase()
    );
  }

  getProductsByOwner(ownerId: string): Product[] {
    return Array.from(this.products.values()).filter((product) => product.ownerId === ownerId);
  }

  createProduct(createProductDto: CreateProductDto, requestUserId?: string): Product {
    // Validate product name uniqueness
    const existingProduct = Array.from(this.products.values()).find(
      (product) => product.name === createProductDto.name
    );

    if (existingProduct) {
      throw new BadRequestException('Product name already exists');
    }

    const newProduct: Product = {
      id: `product-${Date.now()}`,
      name: createProductDto.name,
      description: createProductDto.description,
      price: createProductDto.price,
      category: createProductDto.category,
      ownerId: createProductDto.ownerId || requestUserId || 'unknown',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.products.set(newProduct.id, newProduct);
    return newProduct;
  }

  updateProduct(id: string, updateProductDto: UpdateProductDto): Product {
    const product = this.getProductById(id);

    if (updateProductDto.name && updateProductDto.name !== product.name) {
      // Check if new name already exists
      const existingProduct = Array.from(this.products.values()).find(
        (p) => p.name === updateProductDto.name && p.id !== id
      );

      if (existingProduct) {
        throw new BadRequestException('Product name already exists');
      }
    }

    const updatedProduct: Product = {
      ...product,
      ...updateProductDto,
      updatedAt: new Date(),
    };

    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  deleteProduct(id: string): void {
    this.getProductById(id); // Validates product exists
    this.products.delete(id);
  }

  // Cross-plugin helper methods
  validateProductExists(productId: string): boolean {
    return this.products.has(productId);
  }

  getProductOwner(productId: string): string | null {
    const product = this.products.get(productId);
    return product ? product.ownerId : null;
  }

  isProductOwnedBy(productId: string, userId: string): boolean {
    const product = this.products.get(productId);
    return product ? product.ownerId === userId : false;
  }

  searchProducts(query: string): Product[] {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.products.values()).filter(
      (product) =>
        product.name.toLowerCase().includes(lowercaseQuery) ||
        product.description.toLowerCase().includes(lowercaseQuery) ||
        product.category.toLowerCase().includes(lowercaseQuery)
    );
  }
}
