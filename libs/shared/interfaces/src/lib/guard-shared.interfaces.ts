/**
 * Shared guard interfaces to prevent circular dependencies
 */

/**
 * Basic guard metadata
 */
export interface IGuardMetadata {
  name: string;
  source: string;
  description?: string;
  scope: 'local' | 'external';
  exported?: boolean;
  dependencies?: string[];
}

/**
 * Guard execution context
 */
export interface IGuardContext {
  pluginName: string;
  guardName: string;
  request: unknown;
  user?: unknown;
  metadata: Record<string, unknown>;
}

/**
 * Guard result interface
 */
export interface IGuardResult {
  canActivate: boolean;
  reason?: string;
  context?: Record<string, unknown>;
}

/**
 * Basic guard interface for type safety
 */
export interface IPluginGuard {
  canActivate(context: IGuardContext): boolean | Promise<boolean>;
}

/**
 * Guard registry interface
 */
export interface IGuardRegistry {
  register(pluginName: string, guardMetadata: IGuardMetadata): void;
  unregister(pluginName: string, guardName: string): void;
  find(guardName: string): IGuardMetadata | undefined;
  canPluginUseGuard(pluginName: string, guardName: string): boolean;
}
