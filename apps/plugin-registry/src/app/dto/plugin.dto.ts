import { IsString, IsOptional, IsArray, IsNumber, IsObject, Matches, MinLength, MaxLength } from 'class-validator';
import { CREATE_PLUGIN_VALIDATION } from '@modu-nest/plugin-types';
import type { CreatePluginDto } from '@modu-nest/plugin-types';

export class CreatePluginValidationDto implements CreatePluginDto {
  @IsString()
  @MinLength(CREATE_PLUGIN_VALIDATION.name.find(r => r.minLength)?.minLength || 2)
  @MaxLength(CREATE_PLUGIN_VALIDATION.name.find(r => r.maxLength)?.maxLength || 50)
  @Matches(CREATE_PLUGIN_VALIDATION.name.find(r => r.pattern)?.pattern || /^[a-z0-9-_]+$/, {
    message: CREATE_PLUGIN_VALIDATION.name.find(r => r.message)?.message || 'Invalid name format',
  })
  name!: string;

  @IsString()
  @Matches(CREATE_PLUGIN_VALIDATION.version.find(r => r.pattern)?.pattern || /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: CREATE_PLUGIN_VALIDATION.version.find(r => r.message)?.message || 'Invalid version format',
  })
  version!: string;

  @IsString()
  @MinLength(CREATE_PLUGIN_VALIDATION.description.find(r => r.minLength)?.minLength || 10)
  @MaxLength(CREATE_PLUGIN_VALIDATION.description.find(r => r.maxLength)?.maxLength || 500)
  description!: string;

  @IsString()
  @MinLength(CREATE_PLUGIN_VALIDATION.author.find(r => r.minLength)?.minLength || 2)
  @MaxLength(CREATE_PLUGIN_VALIDATION.author.find(r => r.maxLength)?.maxLength || 100)
  author!: string;

  @IsString()
  @MinLength(CREATE_PLUGIN_VALIDATION.license.find(r => r.minLength)?.minLength || 2)
  @MaxLength(CREATE_PLUGIN_VALIDATION.license.find(r => r.maxLength)?.maxLength || 50)
  license!: string;

  @IsString()
  @Matches(CREATE_PLUGIN_VALIDATION.entryPoint.find(r => r.pattern)?.pattern || /^[A-Z][a-zA-Z0-9]*$/, {
    message: CREATE_PLUGIN_VALIDATION.entryPoint.find(r => r.message)?.message || 'Invalid entry point format',
  })
  entryPoint!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsNumber()
  loadOrder?: number;

  @IsString()
  @Matches(CREATE_PLUGIN_VALIDATION.compatibilityVersion.find(r => r.pattern)?.pattern || /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: CREATE_PLUGIN_VALIDATION.compatibilityVersion.find(r => r.message)?.message || 'Invalid compatibility version format',
  })
  compatibilityVersion!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  routes?: string[];

  @IsOptional()
  @IsObject()
  configuration?: {
    schema: Record<string, unknown>;
  };
}