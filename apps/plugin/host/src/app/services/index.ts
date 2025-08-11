// Composition pattern services for plugin loading
export * from './plugin-discovery.service';
export * from './plugin-instantiation.service';
export * from './plugin-cleanup.service';
export * from './plugin-loader-coordinator.service';

// New focused services extracted from legacy plugin loader
export * from './plugin-state-manager.service';
export * from './plugin-memory-manager.service';
export * from './plugin-security-manager.service';
export * from './plugin-orchestrator.service';
