import { PluginInjectable } from '@modu-nest/plugin-types';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { User, CreateUserDto, UpdateUserDto } from '../interfaces/user.interface';

@PluginInjectable()
export class UserPluginService {
  private users: Map<string, User> = new Map();

  constructor() {
    // Initialize with sample data
    this.initializeSampleData();
  }

  getHello(): string {
    return 'Hello from UserPlugin plugin!';
  }

  private initializeSampleData() {
    const sampleUsers: User[] = [
      {
        id: 'user-123',
        username: 'admin',
        email: 'admin@example.com',
        roles: ['admin', 'user'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-456',
        username: 'regular-user',
        email: 'user@example.com',
        roles: ['user'],
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: 'user-789',
        username: 'product-manager',
        email: 'pm@example.com',
        roles: ['user', 'product-manager'],
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03'),
      },
    ];

    sampleUsers.forEach((user) => this.users.set(user.id, user));
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  getUserById(id: string): User {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  createUser(createUserDto: CreateUserDto): User {
    // Check if username already exists
    const existingUser = Array.from(this.users.values()).find((user) => user.username === createUserDto.username);

    if (existingUser) {
      throw new BadRequestException('Username already exists');
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      username: createUserDto.username,
      email: createUserDto.email,
      roles: createUserDto.roles || ['user'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(newUser.id, newUser);
    return newUser;
  }

  updateUser(id: string, updateUserDto: UpdateUserDto): User {
    const user = this.getUserById(id);

    if (updateUserDto.username && updateUserDto.username !== user.username) {
      // Check if new username already exists
      const existingUser = Array.from(this.users.values()).find(
        (u) => u.username === updateUserDto.username && u.id !== id
      );

      if (existingUser) {
        throw new BadRequestException('Username already exists');
      }
    }

    const updatedUser: User = {
      ...user,
      ...updateUserDto,
      updatedAt: new Date(),
    };

    this.users.set(id, updatedUser);
    return updatedUser;
  }

  deleteUser(id: string): void {
    this.getUserById(id); // Validates user exists
    this.users.delete(id);
  }

  getUsersByRole(role: string): User[] {
    return Array.from(this.users.values()).filter((user) => user.roles.includes(role));
  }

  // Cross-plugin helper methods
  validateUserExists(userId: string): boolean {
    return this.users.has(userId);
  }

  getUserRoles(userId: string): string[] {
    const user = this.users.get(userId);
    return user ? user.roles : [];
  }

  isUserAdmin(userId: string): boolean {
    const roles = this.getUserRoles(userId);
    return roles.includes('admin');
  }
}
