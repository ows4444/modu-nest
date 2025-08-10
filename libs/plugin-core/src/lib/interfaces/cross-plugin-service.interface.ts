export interface ICrossPluginService {
  /**
   * Get service by token with proper error handling
   */
  getService<T = any>(token: string): Promise<T | null>;

  /**
   * Check if a service is available
   */
  isServiceAvailable(token: string): Promise<boolean>;

  /**
   * Call a method on a cross-plugin service with error handling
   */
  callServiceMethod<T = any>(
    serviceToken: string, 
    methodName: string, 
    ...args: any[]
  ): Promise<T | null>;

  /**
   * Get all available services from a specific plugin
   */
  getPluginServices(pluginName: string): Promise<string[]>;
}

export const CROSS_PLUGIN_SERVICE_TOKEN = 'CROSS_PLUGIN_SERVICE';