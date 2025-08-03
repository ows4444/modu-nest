import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@modu-nest/plugin-types';

@RegisterPluginGuard({
  name: 'product-access',
  source: 'product-plugin',
  description: 'Guard for product access control',
  exported: true,
  scope: 'local',
})
export class ProductAccessGuard extends BasePluginGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    // Check if user has permission to access products
    const method = request.method;
    const userRoles = user.roles || [];

    // Read access for all authenticated users
    if (method === 'GET') {
      return true;
    }

    // Write access only for admin or product-manager roles
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!userRoles.includes('admin') && !userRoles.includes('product-manager')) {
        throw new ForbiddenException('Insufficient permissions for product modification');
      }
    }

    return true;
  }
}
