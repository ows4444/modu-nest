import { IsString, IsOptional, IsArray, IsNumber, IsObject, Matches, MinLength, MaxLength } from 'class-validator';
import { PluginManifest } from '@modu-nest/plugin-types';

export class CreatePluginDto implements Omit<PluginManifest, 'uploadedAt' | 'fileSize' | 'checksum'> {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-_]+$/, {
    message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores',
  })
  name!: string;

  @IsString()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Version must follow semantic versioning (e.g., 1.0.0)',
  })
  version!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  author!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  license!: string;

  @IsString()
  @Matches(/^[A-Z][a-zA-Z0-9]*$/, {
    message: 'Entry point should be a valid class name (PascalCase)',
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
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/, {
    message: 'Compatibility version must follow semantic versioning (e.g., 1.0.0)',
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

export class PluginResponseDto {
  name!: string;
  version!: string;
  description!: string;
  author!: string;
  license!: string;
  entryPoint!: string;
  dependencies?: string[];
  loadOrder?: number;
  compatibilityVersion!: string;
  routes?: string[];
  configuration?: {
    schema: Record<string, unknown>;
  };
  uploadedAt!: string;
  fileSize!: number;
  checksum!: string;
}

export class PluginListResponseDto {
  plugins!: PluginResponseDto[];
  total!: number;
  page?: number;
  limit?: number;
}

export class PluginDeleteResponseDto {
  message!: string;
  deletedPlugin!: string;
}
