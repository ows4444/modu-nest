export interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthenticationResult {
  isAuthenticated: boolean;
  user?: AuthenticatedUser;
  reason?: string;
}

export interface IAuthenticationService {
  /**
   * Validates if a user is authenticated based on request context
   */
  validateAuthentication(context: any): Promise<AuthenticationResult>;

  /**
   * Checks if a user has specific permissions
   */
  hasPermission(userId: string, permission: string): Promise<boolean>;

  /**
   * Checks if a user owns a specific resource
   */
  isResourceOwner(userId: string, resourceType: string, resourceId: string): Promise<boolean>;

  /**
   * Gets user details by ID
   */
  getUser(userId: string): Promise<AuthenticatedUser | null>;
}

export const AUTHENTICATION_SERVICE_TOKEN = 'AUTH_SERVICE';