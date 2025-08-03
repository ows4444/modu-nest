import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@modu-nest/plugin-types';

@RegisterPluginGuard({
  name: 'product-ownership',
  source: 'product-plugin',
  description: 'Ensures users can only modify products they own',
  dependencies: ['user-auth', 'product-access'],
  scope: 'local',
})
export class ProductOwnershipGuard extends BasePluginGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const productId = request.params.productId || request.params.id;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    // Allow admin to access any product
    if (user.roles && user.roles.includes('admin')) {
      return true;
    }

    // For now, simulate product ownership check
    // In a real app, you'd query the database to check product ownership
    const mockProductOwners: Record<string, string> = {
      'product-1': 'user-123',
      'product-2': 'user-456',
      'product-3': 'user-123',
    };

    const productOwner = mockProductOwners[productId];

    if (productId && productOwner && user.id !== productOwner) {
      throw new ForbiddenException('Access denied: can only modify products you own');
    }

    return true;
  }
}
