import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@libs/plugin-decorators';

@RegisterPluginGuard({
  name: 'user-ownership',
  source: 'user-plugin',
  description: 'Guard to ensure users can only access their own resources',
  dependencies: ['user-auth'],
  scope: 'local',
})
export class UserOwnershipGuard extends BasePluginGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = request.params.userId || request.params.id;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    // Allow admin to access any user's resources
    if (user.roles && user.roles.includes('admin')) {
      return true;
    }

    // Check if user is accessing their own resource
    if (userId && user.id !== userId) {
      throw new ForbiddenException('Access denied: can only access your own resources');
    }

    return true;
  }
}
