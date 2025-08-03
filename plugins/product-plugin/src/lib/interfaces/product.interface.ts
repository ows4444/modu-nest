export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductDto {
  name: string;
  description: string;
  price: number;
  category: string;
  ownerId?: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  ownerId?: string;
}