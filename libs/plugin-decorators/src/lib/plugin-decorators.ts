import { Get, All, Post, Patch, Put, Head, Options, Delete, SetMetadata } from '@nestjs/common';
import 'reflect-metadata';
import { PluginLifecycleHook } from '@modu-nest/plugin-core';

// HTTP Method decorators for plugins
export function PluginGet(path?: string): MethodDecorator {
  return Get(path);
}

export function PluginPost(path?: string): MethodDecorator {
  return Post(path);
}

export function PluginPut(path?: string): MethodDecorator {
  return Put(path);
}

export function PluginPatch(path?: string): MethodDecorator {
  return Patch(path);
}

export function PluginDelete(path?: string): MethodDecorator {
  return Delete(path);
}

export function PluginOptions(path?: string): MethodDecorator {
  return Options(path);
}

export function PluginHead(path?: string): MethodDecorator {
  return Head(path);
}

export function PluginAll(path?: string): MethodDecorator {
  return All(path);
}

// Plugin-specific decorators
export const PLUGIN_METADATA_KEY = 'plugin:metadata';
export const PLUGIN_ROUTE_PREFIX_KEY = 'plugin:route-prefix';
export const PLUGIN_PERMISSIONS_KEY = 'plugin:permissions';

export function PluginMetadataDecorator(metadata: Record<string, unknown>): ClassDecorator {
  return SetMetadata(PLUGIN_METADATA_KEY, metadata);
}

export function PluginRoutePrefix(prefix: string): ClassDecorator {
  return SetMetadata(PLUGIN_ROUTE_PREFIX_KEY, prefix);
}

export function PluginPermissions(permissions: string[]): MethodDecorator {
  return SetMetadata(PLUGIN_PERMISSIONS_KEY, permissions);
}

export function PluginLifecycleHookDecorator(hook: PluginLifecycleHook): MethodDecorator {
  return SetMetadata(`plugin:hook:${hook}`, true);
}
