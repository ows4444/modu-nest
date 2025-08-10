import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard, IAuthenticationService, AUTHENTICATION_SERVICE_TOKEN } from '@modu-nest/plugin-types';

@RegisterPluginGuard({
  name: 'auth',
  source: 'product-plugin',
  description: 'Generic authentication guard using configurable auth service',
  exported: true,
  scope: 'local',
})
@Injectable()
export class AuthGuard extends BasePluginGuard {
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
      throw new ForbiddenException('Authentication required');
    }

    // Set user on request for downstream usage
    request.user = authResult.user;

    return true;
  }
}