import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard, IAuthenticationService, AUTHENTICATION_SERVICE_TOKEN } from '@modu-nest/plugin-types';

@RegisterPluginGuard({
  name: 'product-access',
  source: 'product-plugin',
  description: 'Guard for product access control',
  exported: true,
  scope: 'local',
})
@Injectable()
export class ProductAccessGuard extends BasePluginGuard {
  constructor(
    @Inject(AUTHENTICATION_SERVICE_TOKEN) private authService?: IAuthenticationService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // If no auth service is configured, allow access (fallback behavior)
    if (!this.authService) {
      return true;
    }

    // Validate authentication
    const authResult = await this.authService.validateAuthentication(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      throw new ForbiddenException('User authentication required');
    }

    const user = authResult.user;
    request.user = user; // Set user on request for downstream usage

    // Check if user has permission to access products
    const method = request.method;

    // Read access for all authenticated users
    if (method === 'GET') {
      return true;
    }

    // Write access - check specific permissions
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const hasWritePermission = await this.authService.hasPermission(user.id, 'products:write');
      if (!hasWritePermission) {
        throw new ForbiddenException('Insufficient permissions for product modification');
      }
    }

    return true;
  }
}
