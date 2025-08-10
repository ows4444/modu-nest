// Re-export everything from the refactored libraries for backward compatibility
export * from '@modu-nest/plugin-core';
export * from '@modu-nest/plugin-services'; 
export * from '@modu-nest/plugin-decorators';
export * from '@modu-nest/plugin-validation';

// This library now serves as a convenience re-export of all plugin functionality
// Individual libraries can be imported directly for better tree-shaking