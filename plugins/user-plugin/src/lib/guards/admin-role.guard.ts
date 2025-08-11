import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BasePluginGuard, RegisterPluginGuard } from '@plugin/decorators';

@RegisterPluginGuard({
  name: 'admin-role',
  source: 'user-plugin',
  description: 'Admin role guard for privileged operations',
  dependencies: ['user-auth'],
  exported: true,
  scope: 'local',
})
export class AdminRoleGuard extends BasePluginGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    if (!user.roles || !user.roles.includes('admin')) {
      throw new ForbiddenException('Admin role required for this operation');
    }

    return true;
  }
}
