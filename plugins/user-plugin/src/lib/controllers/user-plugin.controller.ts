import {
  PluginRoute,
  PluginGet,
  PluginPost,
  PluginPut,
  PluginDelete,
  PluginUseGuards,
  PluginPermissions,
} from '@modu-nest/plugin-types';
import { Body, Param, Query, ValidationPipe, UsePipes } from '@nestjs/common';
import { UserPluginService } from '../services/user-plugin.service';
import type { CreateUserDto, UpdateUserDto } from '../interfaces/user.interface';

@PluginRoute('users')
export class UserPluginController {
  constructor(private readonly userPluginService: UserPluginService) {}

  @PluginGet()
  getHello(): string {
    return this.userPluginService.getHello();
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
  getUserById(@Param('id') id: string) {
    return this.userPluginService.getUserById(id);
  }

  @PluginPost()
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:write', 'admin:access'])
  @UsePipes(new ValidationPipe())
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.userPluginService.createUser(createUserDto);
  }

  @PluginPut(':id')
  @PluginUseGuards('user-auth', 'user-ownership')
  @PluginPermissions(['users:write:own'])
  @UsePipes(new ValidationPipe())
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userPluginService.updateUser(id, updateUserDto);
  }

  @PluginDelete(':id')
  @PluginUseGuards('user-auth', 'admin-role')
  @PluginPermissions(['users:delete', 'admin:access'])
  deleteUser(@Param('id') id: string) {
    this.userPluginService.deleteUser(id);
    return { message: 'User deleted successfully' };
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
  async getUserProducts(@Param('userId') userId: string) {
    const userExists = this.userPluginService.validateUserExists(userId);
    if (!userExists) {
      return { error: 'User not found' };
    }

    const user = this.userPluginService.getUserById(userId);

    return {
      user: { id: user.id, username: user.username, roles: user.roles },
      message: 'User products retrieved via cross-plugin integration',
    };
  }

  @PluginPost('create-with-product')
  @PluginUseGuards('user-auth', 'admin-role')
  @UsePipes(new ValidationPipe())
  async createUserWithProduct(@Body() data: { user: CreateUserDto }) {
    const { user: userData } = data;

    try {
      const newUser = this.userPluginService.createUser(userData);

      return {
        user: newUser,
        message: 'User and product created via cross-plugin integration',
      };
    } catch (error: unknown) {
      return {
        error: 'Failed to create user and product',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
