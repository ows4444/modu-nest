// Plugin guards system
export * from './lib/guards/plugin-guard-registry.service';
export * from './lib/guards/plugin-guard-interceptor';
export * from './lib/guards/plugin-guard-manager';
export * from './lib/guards/plugin-guard-dependency-optimizer';

// Plugin permission system
export * from './lib/permissions/plugin-permission-interceptor';
export * from './lib/permissions/plugin-permission.service';

// Plugin metrics collection system
export * from './lib/metrics/plugin-metrics-collector';

// Plugin caching system
export * from './lib/cache/plugin-cache.service';

// Plugin event system
export * from './lib/events/plugin-event-emitter';
export * from './lib/events/plugin-event-monitor.service';

// Plugin circuit breaker for resilience
export * from './lib/circuit-breaker/plugin-circuit-breaker';

// Plugin compatibility checking system
export * from './lib/compatibility/plugin-compatibility-checker';

// Bridge services to prevent circular dependencies
export * from './lib/bridges/context-bridge.service';
export * from './lib/bridges/guard-bridge.service';
