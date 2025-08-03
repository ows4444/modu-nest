import { PluginInjectable } from '@modu-nest/plugin-types';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Product, CreateProductDto, UpdateProductDto } from '../interfaces/product.interface';

@PluginInjectable()
export class ProductPluginService {
  private products: Map<string, Product> = new Map();

  constructor() {
    // Initialize with sample data
    this.initializeSampleData();
  }

  getHello(): string {
    return 'Hello from ProductPlugin plugin!';
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
