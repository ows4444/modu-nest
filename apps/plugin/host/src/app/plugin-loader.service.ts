import { Injectable, Logger } from '@nestjs/common';
import { PluginLoaderService as RefactoredPluginLoaderService } from './plugin-loader-primary.service';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 * Please use the refactored PluginLoaderService directly.
 *
 * This wrapper exists only for backward compatibility during the migration period.
 * The original monolithic implementation has been moved to plugin-loader-legacy.service.ts
 * and will be removed once the migration is complete.
 */
@Injectable()
export class PluginLoaderService extends RefactoredPluginLoaderService {
  private readonly deprecationLogger = new Logger('DeprecatedPluginLoaderService');

  constructor() {
    super();
    this.deprecationLogger.warn(
      'DEPRECATION WARNING: The old plugin-loader.service.ts import is deprecated. ' +
        'Please import from plugin-loader-refactored.service.ts instead. ' +
        'This wrapper will be removed in a future version.'
    );
  }
}
