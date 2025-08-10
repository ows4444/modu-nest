import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@modu-nest/plugin-decorators';

@RegisterPluginGuard({
  name: 'user-auth',
  source: 'user-plugin',
  description: 'Authentication guard for user operations',
  exported: true,
  scope: 'local',
})
export class UserAuthGuard extends BasePluginGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No valid authorization token provided');
    }

    const token = authHeader.substring(7);

    // Simple token validation (in real app, you'd verify JWT or session)
    if (!token || token.length < 10) {
      throw new UnauthorizedException('Invalid authorization token');
    }

    // Add user info to request for downstream use
    request.user = {
      id: 'user-123',
      username: 'authenticated-user',
      roles: ['user'],
    };

    return true;
  }
}
