/**
 * Plugin Trust Manager Service
 *
 * Provides comprehensive trust level management and enforcement for plugins including:
 * - Trust level assignment and validation
 * - Security policy enforcement based on trust levels
 * - Trust level upgrade/downgrade workflows
 * - Capability restrictions based on trust levels
 * - Trust level auditing and monitoring
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginEntity } from '../entities/plugin.entity';
import { PluginVersionEntity } from '../entities/plugin-version.entity';
import { PluginTrustLevelEntity } from '../entities/plugin-trust-level.entity';
import { PluginEventEmitter } from '@plugin/services';
import { PluginManifest } from '@plugin/core';

export enum TrustLevel {
  INTERNAL = 'internal', // Fully trusted, developed internally
  VERIFIED = 'verified', // Third-party but verified and audited
  COMMUNITY = 'community', // Community plugins with basic validation
  UNTRUSTED = 'untrusted', // New or flagged plugins with restrictions
  QUARANTINED = 'quarantined', // Suspicious plugins with severe restrictions
}

export interface TrustPolicy {
  trustLevel: TrustLevel;
  allowedCapabilities: PluginCapability[];
  resourceLimits: ResourceLimits;
  securityRequirements: SecurityRequirements;
  auditRequirements: AuditRequirements;
  isolationLevel: IsolationLevel;
}

export interface PluginCapability {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  category: 'network' | 'filesystem' | 'process' | 'database' | 'api' | 'security';
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCPUPercent: number;
  maxFileSize: number;
  maxNetworkBandwidth: number;
  maxExecutionTime: number;
  maxDiskUsage: number;
}

export interface SecurityRequirements {
  signatureRequired: boolean;
  checksumRequired: boolean;
  sourceCodeReview: boolean;
  securityScan: boolean;
  vulnerabilityAssessment: boolean;
  minimumTrustScore: number;
}

export interface AuditRequirements {
  logAllActions: boolean;
  monitorResourceUsage: boolean;
  trackApiCalls: boolean;
  alertOnSuspiciousActivity: boolean;
  requireApprovalForActions: string[]; // List of actions requiring approval
}

export enum IsolationLevel {
  NONE = 'none', // No isolation
  PROCESS = 'process', // Process-level isolation
  VM = 'vm', // Virtual machine isolation
  CONTAINER = 'container', // Container isolation
  SANDBOX = 'sandbox', // Full sandbox isolation
}

export interface TrustLevelAssignment {
  pluginName: string;
  version?: string;
  trustLevel: TrustLevel;
  assignedBy: string;
  assignedAt: Date;
  reason: string;
  evidence?: TrustEvidence[];
  validUntil?: Date;
  reviewRequired?: boolean;
}

export interface TrustEvidence {
  type: 'signature' | 'audit' | 'review' | 'usage' | 'reputation' | 'source';
  description: string;
  score: number; // 0-100
  verifiedBy: string;
  verifiedAt: Date;
  details?: Record<string, any>;
}

export interface TrustLevelChangeRequest {
  pluginName: string;
  version?: string;
  currentTrustLevel: TrustLevel;
  requestedTrustLevel: TrustLevel;
  requestedBy: string;
  reason: string;
  evidence: TrustEvidence[];
  businessJustification?: string;
}

export interface TrustViolation {
  pluginName: string;
  version: string;
  violationType: 'capability' | 'resource' | 'security' | 'behavioral';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  details: Record<string, any>;
  action: 'warn' | 'restrict' | 'quarantine' | 'remove';
}

@Injectable()
export class PluginTrustManager {
  private readonly logger = new Logger(PluginTrustManager.name);
  private readonly trustPolicies = new Map<TrustLevel, TrustPolicy>();
  private readonly capabilities = new Map<string, PluginCapability>();

  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PluginVersionEntity)
    private readonly versionRepository: Repository<PluginVersionEntity>,
    @InjectRepository(PluginTrustLevelEntity)
    private readonly trustRepository: Repository<PluginTrustLevelEntity>,
    private readonly eventEmitter: PluginEventEmitter
  ) {
    this.initializeTrustPolicies();
    this.initializeCapabilities();
  }

  /**
   * Initialize default trust policies for each trust level
   */
  private initializeTrustPolicies(): void {
    // INTERNAL - Full trust, no restrictions
    this.trustPolicies.set(TrustLevel.INTERNAL, {
      trustLevel: TrustLevel.INTERNAL,
      allowedCapabilities: Array.from(this.capabilities.values()),
      resourceLimits: {
        maxMemoryMB: 2048,
        maxCPUPercent: 80,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxNetworkBandwidth: 10 * 1024 * 1024, // 10MB/s
        maxExecutionTime: 300000, // 5 minutes
        maxDiskUsage: 500 * 1024 * 1024, // 500MB
      },
      securityRequirements: {
        signatureRequired: false, // Internal plugins can be unsigned
        checksumRequired: true,
        sourceCodeReview: false,
        securityScan: true,
        vulnerabilityAssessment: false,
        minimumTrustScore: 70,
      },
      auditRequirements: {
        logAllActions: false,
        monitorResourceUsage: true,
        trackApiCalls: false,
        alertOnSuspiciousActivity: true,
        requireApprovalForActions: [],
      },
      isolationLevel: IsolationLevel.PROCESS,
    });

    // VERIFIED - High trust with moderate restrictions
    this.trustPolicies.set(TrustLevel.VERIFIED, {
      trustLevel: TrustLevel.VERIFIED,
      allowedCapabilities: this.getCapabilitiesByRisk(['low', 'medium', 'high']),
      resourceLimits: {
        maxMemoryMB: 1024,
        maxCPUPercent: 60,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxNetworkBandwidth: 5 * 1024 * 1024, // 5MB/s
        maxExecutionTime: 180000, // 3 minutes
        maxDiskUsage: 200 * 1024 * 1024, // 200MB
      },
      securityRequirements: {
        signatureRequired: true,
        checksumRequired: true,
        sourceCodeReview: true,
        securityScan: true,
        vulnerabilityAssessment: true,
        minimumTrustScore: 85,
      },
      auditRequirements: {
        logAllActions: true,
        monitorResourceUsage: true,
        trackApiCalls: true,
        alertOnSuspiciousActivity: true,
        requireApprovalForActions: ['security-modify', 'system-access'],
      },
      isolationLevel: IsolationLevel.CONTAINER,
    });

    // COMMUNITY - Medium trust with significant restrictions
    this.trustPolicies.set(TrustLevel.COMMUNITY, {
      trustLevel: TrustLevel.COMMUNITY,
      allowedCapabilities: this.getCapabilitiesByRisk(['low', 'medium']),
      resourceLimits: {
        maxMemoryMB: 512,
        maxCPUPercent: 40,
        maxFileSize: 25 * 1024 * 1024, // 25MB
        maxNetworkBandwidth: 2 * 1024 * 1024, // 2MB/s
        maxExecutionTime: 120000, // 2 minutes
        maxDiskUsage: 100 * 1024 * 1024, // 100MB
      },
      securityRequirements: {
        signatureRequired: true,
        checksumRequired: true,
        sourceCodeReview: false,
        securityScan: true,
        vulnerabilityAssessment: true,
        minimumTrustScore: 75,
      },
      auditRequirements: {
        logAllActions: true,
        monitorResourceUsage: true,
        trackApiCalls: true,
        alertOnSuspiciousActivity: true,
        requireApprovalForActions: ['network-access', 'filesystem-write', 'security-modify'],
      },
      isolationLevel: IsolationLevel.SANDBOX,
    });

    // UNTRUSTED - Low trust with heavy restrictions
    this.trustPolicies.set(TrustLevel.UNTRUSTED, {
      trustLevel: TrustLevel.UNTRUSTED,
      allowedCapabilities: this.getCapabilitiesByRisk(['low']),
      resourceLimits: {
        maxMemoryMB: 256,
        maxCPUPercent: 20,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxNetworkBandwidth: 1 * 1024 * 1024, // 1MB/s
        maxExecutionTime: 60000, // 1 minute
        maxDiskUsage: 50 * 1024 * 1024, // 50MB
      },
      securityRequirements: {
        signatureRequired: true,
        checksumRequired: true,
        sourceCodeReview: true,
        securityScan: true,
        vulnerabilityAssessment: true,
        minimumTrustScore: 90,
      },
      auditRequirements: {
        logAllActions: true,
        monitorResourceUsage: true,
        trackApiCalls: true,
        alertOnSuspiciousActivity: true,
        requireApprovalForActions: ['*'], // All actions require approval
      },
      isolationLevel: IsolationLevel.SANDBOX,
    });

    // QUARANTINED - No trust, severe restrictions
    this.trustPolicies.set(TrustLevel.QUARANTINED, {
      trustLevel: TrustLevel.QUARANTINED,
      allowedCapabilities: [], // No capabilities allowed
      resourceLimits: {
        maxMemoryMB: 128,
        maxCPUPercent: 10,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxNetworkBandwidth: 0, // No network access
        maxExecutionTime: 30000, // 30 seconds
        maxDiskUsage: 25 * 1024 * 1024, // 25MB
      },
      securityRequirements: {
        signatureRequired: true,
        checksumRequired: true,
        sourceCodeReview: true,
        securityScan: true,
        vulnerabilityAssessment: true,
        minimumTrustScore: 95,
      },
      auditRequirements: {
        logAllActions: true,
        monitorResourceUsage: true,
        trackApiCalls: true,
        alertOnSuspiciousActivity: true,
        requireApprovalForActions: ['*'], // All actions require approval
      },
      isolationLevel: IsolationLevel.SANDBOX,
    });
  }

  /**
   * Initialize plugin capabilities catalog
   */
  private initializeCapabilities(): void {
    const capabilities: PluginCapability[] = [
      // Network capabilities
      {
        name: 'network-http-client',
        description: 'Make HTTP requests',
        riskLevel: 'medium',
        category: 'network',
      },
      {
        name: 'network-websocket',
        description: 'Create WebSocket connections',
        riskLevel: 'medium',
        category: 'network',
      },
      {
        name: 'network-server',
        description: 'Start network servers',
        riskLevel: 'high',
        category: 'network',
      },
      {
        name: 'network-raw-socket',
        description: 'Access raw network sockets',
        riskLevel: 'critical',
        category: 'network',
      },

      // Filesystem capabilities
      {
        name: 'filesystem-read',
        description: 'Read files from filesystem',
        riskLevel: 'low',
        category: 'filesystem',
      },
      {
        name: 'filesystem-write',
        description: 'Write files to filesystem',
        riskLevel: 'medium',
        category: 'filesystem',
      },
      {
        name: 'filesystem-delete',
        description: 'Delete files from filesystem',
        riskLevel: 'high',
        category: 'filesystem',
      },
      {
        name: 'filesystem-execute',
        description: 'Execute files from filesystem',
        riskLevel: 'critical',
        category: 'filesystem',
      },

      // Process capabilities
      {
        name: 'process-spawn',
        description: 'Spawn child processes',
        riskLevel: 'high',
        category: 'process',
      },
      {
        name: 'process-env',
        description: 'Access environment variables',
        riskLevel: 'medium',
        category: 'process',
      },
      {
        name: 'process-exit',
        description: 'Exit the host process',
        riskLevel: 'critical',
        category: 'process',
      },

      // Database capabilities
      {
        name: 'database-read',
        description: 'Read from databases',
        riskLevel: 'low',
        category: 'database',
      },
      {
        name: 'database-write',
        description: 'Write to databases',
        riskLevel: 'medium',
        category: 'database',
      },
      {
        name: 'database-admin',
        description: 'Administrative database operations',
        riskLevel: 'high',
        category: 'database',
      },

      // API capabilities
      {
        name: 'api-plugin-management',
        description: 'Manage other plugins',
        riskLevel: 'high',
        category: 'api',
      },
      {
        name: 'api-system-info',
        description: 'Access system information',
        riskLevel: 'low',
        category: 'api',
      },
      {
        name: 'api-user-data',
        description: 'Access user data',
        riskLevel: 'medium',
        category: 'api',
      },

      // Security capabilities
      {
        name: 'security-crypto',
        description: 'Use cryptographic functions',
        riskLevel: 'medium',
        category: 'security',
      },
      {
        name: 'security-modify',
        description: 'Modify security settings',
        riskLevel: 'critical',
        category: 'security',
      },
      {
        name: 'security-audit',
        description: 'Access audit logs',
        riskLevel: 'high',
        category: 'security',
      },
    ];

    capabilities.forEach((cap) => this.capabilities.set(cap.name, cap));
  }

  /**
   * Get capabilities filtered by risk level
   */
  private getCapabilitiesByRisk(allowedRiskLevels: string[]): PluginCapability[] {
    return Array.from(this.capabilities.values()).filter((cap) => allowedRiskLevels.includes(cap.riskLevel));
  }

  /**
   * Assign trust level to a plugin
   */
  async assignTrustLevel(assignment: TrustLevelAssignment): Promise<void> {
    this.logger.log(`Assigning trust level ${assignment.trustLevel} to plugin: ${assignment.pluginName}`);

    // Validate trust level
    if (!Object.values(TrustLevel).includes(assignment.trustLevel)) {
      throw new Error(`Invalid trust level: ${assignment.trustLevel}`);
    }

    // Check if plugin exists
    const plugin = assignment.version
      ? await this.versionRepository.findOne({
          where: {
            pluginName: assignment.pluginName,
            version: assignment.version,
          },
        })
      : await this.pluginRepository.findOne({
          where: { name: assignment.pluginName },
        });

    if (!plugin) {
      throw new Error(
        `Plugin not found: ${assignment.pluginName}${assignment.version ? `:${assignment.version}` : ''}`
      );
    }

    // Create or update trust level assignment
    let trustEntity = await this.trustRepository.findOne({
      where: {
        pluginName: assignment.pluginName,
        version: assignment.version ?? undefined,
      },
    });

    if (!trustEntity) {
      trustEntity = new PluginTrustLevelEntity();
      trustEntity.pluginName = assignment.pluginName;
      trustEntity.version = assignment.version ?? null;
    }

    const previousTrustLevel = trustEntity.trustLevel;
    trustEntity.trustLevel = assignment.trustLevel;
    trustEntity.assignedBy = assignment.assignedBy;
    trustEntity.assignedAt = assignment.assignedAt;
    trustEntity.reason = assignment.reason;
    trustEntity.evidence = JSON.stringify(assignment.evidence || []);
    trustEntity.validUntil = assignment.validUntil ?? null;
    trustEntity.reviewRequired = assignment.reviewRequired || false;

    await this.trustRepository.save(trustEntity);

    // Emit trust level change event
    this.eventEmitter.emit('plugin-trust-level-changed', {
      pluginName: assignment.pluginName,
      version: assignment.version,
      previousTrustLevel,
      newTrustLevel: assignment.trustLevel,
      assignedBy: assignment.assignedBy,
      reason: assignment.reason,
      timestamp: new Date(),
    });

    this.logger.log(`Trust level assigned successfully: ${assignment.pluginName} -> ${assignment.trustLevel}`);
  }

  /**
   * Get trust level for a plugin
   */
  async getTrustLevel(pluginName: string, version?: string): Promise<TrustLevel> {
    const trustEntity = await this.trustRepository.findOne({
      where: {
        pluginName,
        version: version ?? undefined,
      },
    });

    if (trustEntity) {
      // Check if trust level is still valid
      if (trustEntity.validUntil && trustEntity.validUntil < new Date()) {
        this.logger.warn(`Trust level expired for plugin: ${pluginName}, defaulting to UNTRUSTED`);
        return TrustLevel.UNTRUSTED;
      }
      return trustEntity.trustLevel as TrustLevel;
    }

    // Default trust level for new plugins
    return TrustLevel.COMMUNITY;
  }

  /**
   * Get trust policy for a specific trust level
   */
  getTrustPolicy(trustLevel: TrustLevel): TrustPolicy | undefined {
    return this.trustPolicies.get(trustLevel);
  }

  /**
   * Validate if a plugin can perform a specific capability
   */
  async canPerformCapability(pluginName: string, capabilityName: string, version?: string): Promise<boolean> {
    const trustLevel = await this.getTrustLevel(pluginName, version);
    const policy = this.getTrustPolicy(trustLevel);

    if (!policy) {
      this.logger.warn(`No policy found for trust level: ${trustLevel}`);
      return false;
    }

    const hasCapability = policy.allowedCapabilities.some((cap) => cap.name === capabilityName);

    if (!hasCapability) {
      this.logger.debug(`Plugin ${pluginName} (${trustLevel}) denied capability: ${capabilityName}`);
    }

    return hasCapability;
  }

  /**
   * Validate plugin against trust policy requirements
   */
  async validatePluginAgainstTrustPolicy(
    pluginName: string,
    manifest: PluginManifest,
    version?: string
  ): Promise<{
    isValid: boolean;
    violations: string[];
    requiredActions: string[];
  }> {
    const trustLevel = await this.getTrustLevel(pluginName, version);
    const policy = this.getTrustPolicy(trustLevel);

    if (!policy) {
      return {
        isValid: false,
        violations: [`No policy found for trust level: ${trustLevel}`],
        requiredActions: ['Review trust level assignment'],
      };
    }

    const violations: string[] = [];
    const requiredActions: string[] = [];

    // Check security requirements
    const security = manifest.security;
    if (policy.securityRequirements.signatureRequired && !security?.signature) {
      violations.push('Digital signature required but not provided');
      requiredActions.push('Add digital signature to plugin');
    }

    if (policy.securityRequirements.checksumRequired && !security?.checksum) {
      violations.push('Checksum required but not provided');
      requiredActions.push('Add checksum verification to plugin');
    }

    // Check isolation requirements
    if (security?.sandbox?.isolationLevel) {
      const requiredIsolation = policy.isolationLevel;
      const pluginIsolation = security.sandbox.isolationLevel;

      const isolationHierarchy = {
        [IsolationLevel.NONE]: 0,
        [IsolationLevel.PROCESS]: 1,
        [IsolationLevel.VM]: 2,
        [IsolationLevel.CONTAINER]: 3,
        [IsolationLevel.SANDBOX]: 4,
      };

      if (isolationHierarchy[pluginIsolation as IsolationLevel] < isolationHierarchy[requiredIsolation]) {
        violations.push(`Insufficient isolation level: ${pluginIsolation}, required: ${requiredIsolation}`);
        requiredActions.push(`Upgrade isolation level to ${requiredIsolation}`);
      }
    }

    // Check resource limits
    if (security?.sandbox?.resourceLimits) {
      const pluginLimits = security.sandbox.resourceLimits;
      const policyLimits = policy.resourceLimits;

      if (pluginLimits.maxMemory && pluginLimits.maxMemory > policyLimits.maxMemoryMB * 1024 * 1024) {
        violations.push(`Memory limit exceeds policy: ${pluginLimits.maxMemory} > ${policyLimits.maxMemoryMB}MB`);
        requiredActions.push(`Reduce memory limit to ${policyLimits.maxMemoryMB}MB or lower`);
      }

      if (pluginLimits.maxCPU && pluginLimits.maxCPU > policyLimits.maxCPUPercent) {
        violations.push(`CPU limit exceeds policy: ${pluginLimits.maxCPU}% > ${policyLimits.maxCPUPercent}%`);
        requiredActions.push(`Reduce CPU limit to ${policyLimits.maxCPUPercent}% or lower`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      requiredActions,
    };
  }

  /**
   * Record a trust violation
   */
  async recordTrustViolation(violation: TrustViolation): Promise<void> {
    this.logger.warn(`Trust violation recorded: ${violation.pluginName} - ${violation.description}`);

    // Emit trust violation event
    this.eventEmitter.emit('plugin-trust-violation', {
      ...violation,
      timestamp: new Date(),
    });

    // Take action based on violation severity
    switch (violation.action) {
      case 'warn':
        this.logger.warn(`Trust violation warning: ${violation.pluginName}`);
        break;

      case 'restrict':
        // Downgrade trust level
        await this.assignTrustLevel({
          pluginName: violation.pluginName,
          version: violation.version,
          trustLevel: TrustLevel.UNTRUSTED,
          assignedBy: 'system',
          assignedAt: new Date(),
          reason: `Trust violation: ${violation.description}`,
          evidence: [
            {
              type: 'audit',
              description: violation.description,
              score: 0,
              verifiedBy: 'system',
              verifiedAt: new Date(),
              details: violation.details,
            },
          ],
        });
        break;

      case 'quarantine':
        await this.assignTrustLevel({
          pluginName: violation.pluginName,
          version: violation.version,
          trustLevel: TrustLevel.QUARANTINED,
          assignedBy: 'system',
          assignedAt: new Date(),
          reason: `Trust violation - quarantined: ${violation.description}`,
          evidence: [
            {
              type: 'audit',
              description: violation.description,
              score: 0,
              verifiedBy: 'system',
              verifiedAt: new Date(),
              details: violation.details,
            },
          ],
        });
        break;

      case 'remove':
        // This would trigger plugin removal - emit event for other services to handle
        this.eventEmitter.emit('plugin-trust-violation-remove', {
          pluginName: violation.pluginName,
          version: violation.version,
          reason: violation.description,
          timestamp: new Date(),
        });
        break;
    }
  }

  /**
   * Get trust statistics for monitoring
   */
  async getTrustStatistics(): Promise<{
    trustLevelDistribution: Record<TrustLevel, number>;
    totalPlugins: number;
    pendingReviews: number;
    recentViolations: number;
    expiredTrustLevels: number;
  }> {
    const allTrustAssignments = await this.trustRepository.find();

    const distribution: Record<TrustLevel, number> = {
      [TrustLevel.INTERNAL]: 0,
      [TrustLevel.VERIFIED]: 0,
      [TrustLevel.COMMUNITY]: 0,
      [TrustLevel.UNTRUSTED]: 0,
      [TrustLevel.QUARANTINED]: 0,
    };

    let pendingReviews = 0;
    let expiredTrustLevels = 0;
    const now = new Date();

    allTrustAssignments.forEach((assignment) => {
      const trustLevel = assignment.trustLevel as TrustLevel;
      distribution[trustLevel]++;

      if (assignment.reviewRequired) {
        pendingReviews++;
      }

      if (assignment.validUntil && assignment.validUntil < now) {
        expiredTrustLevels++;
      }
    });

    return {
      trustLevelDistribution: distribution,
      totalPlugins: allTrustAssignments.length,
      pendingReviews,
      recentViolations: 0, // Would need violation tracking table for accurate count
      expiredTrustLevels,
    };
  }

  /**
   * Get all plugin capabilities
   */
  getAllCapabilities(): PluginCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Request trust level change
   */
  async requestTrustLevelChange(request: TrustLevelChangeRequest): Promise<void> {
    this.logger.log(
      `Trust level change requested: ${request.pluginName} from ${request.currentTrustLevel} to ${request.requestedTrustLevel}`
    );

    // Emit trust level change request event
    this.eventEmitter.emit('plugin-trust-level-change-requested', {
      ...request,
      timestamp: new Date(),
    });

    // For now, this would trigger a manual review workflow
    // In a full implementation, this could integrate with approval systems
  }
}
