import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PluginRegistryService } from '../services/plugin-registry.service';
import { RateLimitingGuard, RateLimit } from '../guards/rate-limiting.guard';
import {
  PluginTrustEnforcementGuard,
  RequireInternalTrust,
  RequireVerifiedTrust,
  RequireCapability,
} from '../guards/plugin-trust-enforcement.guard';
import { TrustLevel } from '../services/plugin-trust-manager';

// DTOs for trust management
export class AssignTrustLevelDto {
  pluginName!: string;
  version?: string;
  trustLevel!: TrustLevel;
  reason!: string;
  assignedBy!: string;
  evidence?: any[];
  validUntil?: Date;
  reviewRequired?: boolean;
}

export class TrustLevelChangeRequestDto {
  pluginName!: string;
  version?: string;
  currentTrustLevel!: TrustLevel;
  requestedTrustLevel!: TrustLevel;
  requestedBy!: string;
  reason!: string;
  evidence!: any[];
  businessJustification?: string;
}

export class ValidateCapabilityDto {
  pluginName!: string;
  capability!: string;
  version?: string;
}

@ApiTags('plugin-trust')
@Controller('plugins/trust')
@UseGuards(RateLimitingGuard, PluginTrustEnforcementGuard)
@ApiBearerAuth()
export class PluginTrustController {
  constructor(private readonly pluginRegistryService: PluginRegistryService) {}

  @Get('levels')
  @RateLimit({ ruleName: 'general-api' })
  @ApiOperation({
    summary: 'Get all available trust levels',
    description: 'Retrieve all available trust levels and their descriptions',
  })
  @ApiResponse({
    status: 200,
    description: 'Trust levels retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        trustLevels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['internal', 'verified', 'community', 'untrusted', 'quarantined'] },
              description: { type: 'string' },
              riskLevel: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getTrustLevels() {
    return {
      trustLevels: [
        {
          level: TrustLevel.INTERNAL,
          description: 'Fully trusted internal plugins with no restrictions',
          riskLevel: 'minimal',
        },
        {
          level: TrustLevel.VERIFIED,
          description: 'Third-party plugins that have been verified and audited',
          riskLevel: 'low',
        },
        {
          level: TrustLevel.COMMUNITY,
          description: 'Community plugins with basic validation',
          riskLevel: 'medium',
        },
        {
          level: TrustLevel.UNTRUSTED,
          description: 'New or unverified plugins with heavy restrictions',
          riskLevel: 'high',
        },
        {
          level: TrustLevel.QUARANTINED,
          description: 'Suspicious plugins with severe restrictions',
          riskLevel: 'critical',
        },
      ],
    };
  }

  @Get('policies/:trustLevel')
  @RateLimit({ ruleName: 'general-api' })
  @RequireVerifiedTrust()
  @ApiOperation({
    summary: 'Get trust policy for a specific trust level',
    description: 'Retrieve the security policy and restrictions for a specific trust level',
  })
  @ApiParam({ name: 'trustLevel', description: 'Trust level', enum: TrustLevel })
  @ApiResponse({
    status: 200,
    description: 'Trust policy retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Trust level not found' })
  async getTrustPolicy(@Param('trustLevel') trustLevel: TrustLevel) {
    return await this.pluginRegistryService.getTrustPolicy(trustLevel);
  }

  @Get('capabilities')
  @RateLimit({ ruleName: 'general-api' })
  @ApiOperation({
    summary: 'Get all available plugin capabilities',
    description: 'Retrieve all available plugin capabilities with their risk levels and categories',
  })
  @ApiResponse({
    status: 200,
    description: 'Plugin capabilities retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          category: { type: 'string', enum: ['network', 'filesystem', 'process', 'database', 'api', 'security'] },
        },
      },
    },
  })
  async getCapabilities() {
    return await this.pluginRegistryService.getPluginCapabilities();
  }

  @Get('statistics')
  @RateLimit({ ruleName: 'general-api' })
  @RequireVerifiedTrust()
  @ApiOperation({
    summary: 'Get trust level statistics',
    description: 'Retrieve comprehensive statistics about plugin trust levels for monitoring',
  })
  @ApiResponse({
    status: 200,
    description: 'Trust statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        trustLevelDistribution: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
        totalPlugins: { type: 'number' },
        pendingReviews: { type: 'number' },
        recentViolations: { type: 'number' },
        expiredTrustLevels: { type: 'number' },
      },
    },
  })
  async getTrustStatistics() {
    return await this.pluginRegistryService.getTrustStatistics();
  }

  @Get(':name/trust-level')
  @RateLimit({ ruleName: 'general-api' })
  @ApiOperation({
    summary: 'Get trust level for a specific plugin',
    description: 'Retrieve the current trust level for a specific plugin',
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiQuery({
    name: 'version',
    required: false,
    type: String,
    description: 'Plugin version (optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Plugin trust level retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        pluginName: { type: 'string' },
        version: { type: 'string', nullable: true },
        trustLevel: { type: 'string', enum: ['internal', 'verified', 'community', 'untrusted', 'quarantined'] },
        assignedBy: { type: 'string' },
        assignedAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async getPluginTrustLevel(@Param('name') name: string, @Query('version') version?: string) {
    const trustLevel = await this.pluginRegistryService.getPluginTrustLevel(name, version);
    return {
      pluginName: name,
      version: version || null,
      trustLevel,
    };
  }

  @Put(':name/trust-level')
  @RateLimit({ ruleName: 'admin-operations' })
  @RequireInternalTrust()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign trust level to a plugin',
    description: 'Assign or update the trust level for a specific plugin (requires internal trust level)',
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({
    type: AssignTrustLevelDto,
    description: 'Trust level assignment details',
  })
  @ApiResponse({
    status: 200,
    description: 'Trust level assigned successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient trust level to perform this operation' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async assignTrustLevel(@Param('name') name: string, @Body() assignmentDto: AssignTrustLevelDto) {
    const assignment = {
      ...assignmentDto,
      pluginName: name,
      assignedAt: new Date(),
    };

    return await this.pluginRegistryService.assignPluginTrustLevel(assignment);
  }

  @Post(':name/capability-check')
  @RateLimit({ ruleName: 'general-api' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate plugin capability access',
    description: 'Check if a plugin can perform a specific capability based on its trust level',
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        capability: { type: 'string', description: 'Capability to check' },
        version: { type: 'string', description: 'Plugin version (optional)' },
      },
      required: ['capability'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Capability validation completed',
    schema: {
      type: 'object',
      properties: {
        allowed: { type: 'boolean' },
        pluginName: { type: 'string' },
        capability: { type: 'string' },
        trustLevel: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async validateCapability(@Param('name') name: string, @Body() body: { capability: string; version?: string }) {
    const result = await this.pluginRegistryService.validatePluginCapability(name, body.capability, body.version);

    const trustLevel = await this.pluginRegistryService.getPluginTrustLevel(name, body.version);

    return {
      ...result,
      pluginName: name,
      capability: body.capability,
      trustLevel,
      reason: result.allowed ? 'Capability allowed by trust level policy' : 'Capability denied by trust level policy',
    };
  }

  @Post(':name/trust-policy-validation')
  @RateLimit({ ruleName: 'general-api' })
  @RequireVerifiedTrust()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate plugin against trust policy',
    description: "Validate a plugin's manifest and configuration against its trust level policy",
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        manifest: {
          type: 'object',
          description: 'Plugin manifest to validate',
        },
        version: {
          type: 'string',
          description: 'Plugin version (optional)',
        },
      },
      required: ['manifest'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Trust policy validation completed',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        violations: { type: 'array', items: { type: 'string' } },
        requiredActions: { type: 'array', items: { type: 'string' } },
        trustLevel: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async validateTrustPolicy(@Param('name') name: string, @Body() body: { manifest: any; version?: string }) {
    const result = await this.pluginRegistryService.validatePluginTrustPolicy(name, body.manifest, body.version);

    const trustLevel = await this.pluginRegistryService.getPluginTrustLevel(name, body.version);

    return {
      ...result,
      trustLevel,
    };
  }

  @Post('trust-level-change-request')
  @RateLimit({ ruleName: 'general-api' })
  @RequireVerifiedTrust()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request trust level change',
    description: 'Submit a request to change the trust level of a plugin (requires approval workflow)',
  })
  @ApiBody({
    type: TrustLevelChangeRequestDto,
    description: 'Trust level change request details',
  })
  @ApiResponse({
    status: 200,
    description: 'Trust level change request submitted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async requestTrustLevelChange(@Body() request: TrustLevelChangeRequestDto) {
    const result = await this.pluginRegistryService.requestTrustLevelChange(request);

    return {
      ...result,
      requestId: `trust-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  @Get(':name/trust-history')
  @RateLimit({ ruleName: 'general-api' })
  @RequireVerifiedTrust()
  @ApiOperation({
    summary: 'Get trust level history for a plugin',
    description: 'Retrieve the complete trust level assignment history for a plugin',
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of history entries to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Trust level history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        pluginName: { type: 'string' },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              trustLevel: { type: 'string' },
              assignedBy: { type: 'string' },
              assignedAt: { type: 'string', format: 'date-time' },
              reason: { type: 'string' },
              evidence: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async getTrustHistory(@Param('name') name: string, @Query('limit', new DefaultValuePipe(10)) limit: number) {
    // This would need implementation in the trust manager to track history
    // For now, return current trust level as single history entry
    const currentTrustLevel = await this.pluginRegistryService.getPluginTrustLevel(name);

    return {
      pluginName: name,
      history: [
        {
          trustLevel: currentTrustLevel,
          assignedBy: 'system',
          assignedAt: new Date().toISOString(),
          reason: 'Current active trust level',
          evidence: [],
        },
      ],
    };
  }

  @Post(':name/trust-violation')
  @RateLimit({ ruleName: 'admin-operations' })
  @RequireCapability(['security-audit'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report trust violation',
    description: 'Report a trust violation for a plugin (requires security audit capability)',
  })
  @ApiParam({ name: 'name', description: 'Plugin name' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string' },
        violationType: { type: 'string', enum: ['capability', 'resource', 'security', 'behavioral'] },
        description: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        details: { type: 'object' },
        action: { type: 'string', enum: ['warn', 'restrict', 'quarantine', 'remove'] },
      },
      required: ['violationType', 'description', 'severity', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Trust violation reported successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        violationId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Insufficient capabilities to report violations' })
  async reportTrustViolation(@Param('name') name: string, @Body() violation: any) {
    // This would need implementation in the trust manager
    // For now, just return success

    const violationId = `viol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log the violation report
    console.log(`Trust violation reported for ${name}:`, violation);

    return {
      success: true,
      violationId,
    };
  }
}
