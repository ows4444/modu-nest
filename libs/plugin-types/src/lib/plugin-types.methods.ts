import { Get, All, Post, Patch, Put, Head, Options, Delete } from '@nestjs/common';
import 'reflect-metadata';

export function PluginGet(path?: string): MethodDecorator {
  return Get(path);
}
export function PluginPost(path?: string) {
  return Post(path);
}

export function PluginPut(path?: string) {
  return Put(path);
}

export function PluginPatch(path?: string) {
  return Patch(path);
}

export function PluginDelete(path?: string) {
  return Delete(path);
}

export function PluginOptions(path?: string) {
  return Options(path);
}

export function PluginHead(path?: string) {
  return Head(path);
}

export function PluginAll(path?: string) {
  return All(path);
}
