import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@libs/plugin-decorators';
import { AUTHENTICATION_SERVICE_TOKEN, type IAuthenticationService } from '@libs/plugin-core';

@RegisterPluginGuard({
  name: 'product-ownership',
  source: 'product-plugin',
  description: 'Ensures users can only modify products they own',
  dependencies: ['product-access'],
  scope: 'local',
})
@Injectable()
export class ProductOwnershipGuard extends BasePluginGuard {
  constructor(@Inject(AUTHENTICATION_SERVICE_TOKEN) private authService?: IAuthenticationService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const productId = request.params.productId || request.params.id;

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

    // Check if user is resource owner
    if (productId) {
      const isOwner = await this.authService.isResourceOwner(user.id, 'product', productId);
      if (!isOwner) {
        throw new ForbiddenException('Access denied: can only modify products you own');
      }
    }

    return true;
  }
}
