import { Injectable, Logger, ForbiddenException, BadRequestException, RequestTimeoutException } from '@nestjs/common';
import { PluginDatabaseAccessConfig } from './plugin-context.config';

export interface DatabaseQuery {
  sql: string;
  parameters?: any[];
  options?: {
    timeout?: number;
    maxResults?: number;
    useTransaction?: boolean;
  };
}

export interface DatabaseResult {
  rows: any[];
  rowCount: number;
  fields: string[];
  affectedRows?: number;
  insertId?: number;
  executionTime: number;
  queryComplexity: number;
}

export interface DatabaseTransaction {
  id: string;
  queries: DatabaseQuery[];
  startTime: number;
  status: 'active' | 'committed' | 'rolled_back';
}

export interface DatabaseMetrics {
  queryCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  errorCount: number;
  transactionCount: number;
  dataTransferred: number;
  lastResetTime: number;
}

export interface DatabaseConnection {
  id: string;
  database: string;
  createdAt: number;
  lastUsed: number;
  queryCount: number;
  isActive: boolean;
}

@Injectable()
export class DatabaseAccessService {
  private readonly logger = new Logger(DatabaseAccessService.name);
  private readonly connectionPools = new Map<string, DatabaseConnection[]>();
  private readonly activeTransactions = new Map<string, DatabaseTransaction[]>();
  private readonly metrics = new Map<string, DatabaseMetrics>();
  private readonly queryCache = new Map<string, { result: DatabaseResult; timestamp: number }>();
  private transactionIdCounter = 0;

  async executeQuery(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    query: DatabaseQuery
  ): Promise<DatabaseResult> {
    const startTime = Date.now();

    try {
      // Validate query
      this.validateQuery(pluginName, config, query);

      // Check complexity
      const complexity = this.calculateQueryComplexity(query.sql);
      if (complexity > config.maxQueryComplexity) {
        throw new BadRequestException(
          `Query complexity ${complexity} exceeds limit ${config.maxQueryComplexity} for plugin ${pluginName}`
        );
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(pluginName, query);
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        // 5 minute cache
        this.logger.debug(`Plugin ${pluginName} query served from cache`);
        return { ...cached.result, executionTime: Date.now() - startTime };
      }

      // Execute query
      const result = await this.performQuery(pluginName, config, query, complexity);

      // Update metrics
      this.updateMetrics(pluginName, result, Date.now() - startTime, false);

      // Cache result if it's a SELECT query
      if (query.sql.trim().toLowerCase().startsWith('select')) {
        this.queryCache.set(cacheKey, { result, timestamp: Date.now() });
      }

      this.logger.debug(`Plugin ${pluginName} executed database query successfully`);
      return result;
    } catch (error) {
      this.updateMetrics(pluginName, null, Date.now() - startTime, true);
      this.logger.error(
        `Plugin ${pluginName} database query failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  async startTransaction(pluginName: string, config: PluginDatabaseAccessConfig): Promise<string> {
    if (!config.allowTransactions) {
      throw new ForbiddenException(`Transactions not allowed for plugin ${pluginName}`);
    }

    const transactionId = `${pluginName}_tx_${++this.transactionIdCounter}_${Date.now()}`;
    const transaction: DatabaseTransaction = {
      id: transactionId,
      queries: [],
      startTime: Date.now(),
      status: 'active',
    };

    let transactions = this.activeTransactions.get(pluginName);
    if (!transactions) {
      transactions = [];
      this.activeTransactions.set(pluginName, transactions);
    }
    transactions.push(transaction);

    this.logger.debug(`Plugin ${pluginName} started transaction ${transactionId}`);
    return transactionId;
  }

  async addQueryToTransaction(pluginName: string, transactionId: string, query: DatabaseQuery): Promise<void> {
    const transactions = this.activeTransactions.get(pluginName);
    const transaction = transactions?.find((tx) => tx.id === transactionId && tx.status === 'active');

    if (!transaction) {
      throw new BadRequestException(`Invalid or inactive transaction ${transactionId} for plugin ${pluginName}`);
    }

    transaction.queries.push(query);
    this.logger.debug(`Plugin ${pluginName} added query to transaction ${transactionId}`);
  }

  async commitTransaction(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    transactionId: string
  ): Promise<DatabaseResult[]> {
    const transactions = this.activeTransactions.get(pluginName);
    const transaction = transactions?.find((tx) => tx.id === transactionId && tx.status === 'active');

    if (!transaction) {
      throw new BadRequestException(`Invalid or inactive transaction ${transactionId} for plugin ${pluginName}`);
    }

    try {
      const results: DatabaseResult[] = [];

      // Execute all queries in transaction
      for (const query of transaction.queries) {
        const result = await this.executeQuery(pluginName, config, query);
        results.push(result);
      }

      transaction.status = 'committed';
      this.updateTransactionMetrics(pluginName);

      this.logger.debug(
        `Plugin ${pluginName} committed transaction ${transactionId} with ${transaction.queries.length} queries`
      );
      return results;
    } catch (error) {
      transaction.status = 'rolled_back';
      this.logger.error(
        `Plugin ${pluginName} transaction ${transactionId} rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  async rollbackTransaction(pluginName: string, transactionId: string): Promise<void> {
    const transactions = this.activeTransactions.get(pluginName);
    const transaction = transactions?.find((tx) => tx.id === transactionId && tx.status === 'active');

    if (!transaction) {
      throw new BadRequestException(`Invalid or inactive transaction ${transactionId} for plugin ${pluginName}`);
    }

    transaction.status = 'rolled_back';
    this.logger.debug(`Plugin ${pluginName} rolled back transaction ${transactionId}`);
  }

  private validateQuery(pluginName: string, config: PluginDatabaseAccessConfig, query: DatabaseQuery): void {
    const sql = query.sql.trim().toLowerCase();

    // Extract operation type
    const operation = sql.split(' ')[0].toUpperCase() as any;
    if (!config.allowedOperations.includes(operation)) {
      throw new ForbiddenException(`Operation ${operation} not allowed for plugin ${pluginName}`);
    }

    // Check for dangerous operations (future enhancement)
    if (operation === 'DELETE' || operation === 'UPDATE') {
      if (!sql.includes('where') && !sql.includes('limit')) {
        throw new ForbiddenException(`${operation} without WHERE clause not allowed for plugin ${pluginName}`);
      }
    }

    // Validate table access
    this.validateTableAccess(pluginName, config, sql);

    // Check for stored procedure calls
    if (sql.includes('call ') || sql.includes('exec ')) {
      if (!config.allowStoredProcedures) {
        throw new ForbiddenException(`Stored procedures not allowed for plugin ${pluginName}`);
      }
    }

    // Validate parameters
    if (query.parameters && query.parameters.length > 100) {
      throw new BadRequestException(`Too many parameters (${query.parameters.length}) for plugin ${pluginName}`);
    }
  }

  private validateTableAccess(pluginName: string, config: PluginDatabaseAccessConfig, sql: string): void {
    // Extract table names from SQL (simplified regex)
    const tableRegex = /(?:from|join|into|update)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    const matches = sql.match(tableRegex);

    if (matches) {
      for (const match of matches) {
        const tableName = match.split(' ').pop();
        if (tableName && config.allowedTables.length > 0 && !config.allowedTables.includes(tableName)) {
          throw new ForbiddenException(`Table ${tableName} not in allowed list for plugin ${pluginName}`);
        }
      }
    }
  }

  private calculateQueryComplexity(sql: string): number {
    let complexity = 1;
    const sqlLower = sql.toLowerCase();

    // Add complexity for joins
    const joinCount = (sqlLower.match(/join/g) || []).length;
    complexity += joinCount * 2;

    // Add complexity for subqueries
    const subqueryCount = (sqlLower.match(/\(/g) || []).length;
    complexity += subqueryCount;

    // Add complexity for aggregations
    const aggregationCount = (sqlLower.match(/group by|having|order by/g) || []).length;
    complexity += aggregationCount * 1.5;

    // Add complexity for functions
    const functionCount = (sqlLower.match(/count\(|sum\(|avg\(|max\(|min\(/g) || []).length;
    complexity += functionCount;

    return Math.ceil(complexity);
  }

  private async performQuery(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    query: DatabaseQuery,
    complexity: number
  ): Promise<DatabaseResult> {
    // This is a mock implementation - in real scenario, you'd use actual database drivers
    const startTime = Date.now();

    // Simulate query execution time based on complexity
    const executionTime = Math.max(10, complexity * 10 + Math.random() * 100);
    await new Promise((resolve) => setTimeout(resolve, executionTime));

    // Check timeout
    const totalTime = Date.now() - startTime;
    if (totalTime > (query.options?.timeout || config.queryTimeout)) {
      throw new RequestTimeoutException(`Query timeout after ${totalTime}ms for plugin ${pluginName}`);
    }

    // Mock result based on query type
    const sql = query.sql.trim().toLowerCase();
    let mockResult: DatabaseResult;

    if (sql.startsWith('select')) {
      const rowCount = Math.min(query.options?.maxResults || config.maxResultSize, 100);
      mockResult = {
        rows: Array.from({ length: rowCount }, (_, i) => ({ id: i + 1, data: `mock_data_${i}` })),
        rowCount,
        fields: ['id', 'data'],
        executionTime: totalTime,
        queryComplexity: complexity,
      };
    } else if (sql.startsWith('insert')) {
      mockResult = {
        rows: [],
        rowCount: 0,
        fields: [],
        affectedRows: 1,
        insertId: Math.floor(Math.random() * 1000000),
        executionTime: totalTime,
        queryComplexity: complexity,
      };
    } else {
      mockResult = {
        rows: [],
        rowCount: 0,
        fields: [],
        affectedRows: Math.floor(Math.random() * 10) + 1,
        executionTime: totalTime,
        queryComplexity: complexity,
      };
    }

    // Check result size limit
    if (mockResult.rowCount > config.maxResultSize) {
      throw new BadRequestException(`Result set too large (${mockResult.rowCount} rows) for plugin ${pluginName}`);
    }

    return mockResult;
  }

  private updateMetrics(
    pluginName: string,
    result: DatabaseResult | null,
    executionTime: number,
    isError: boolean
  ): void {
    let metrics = this.metrics.get(pluginName);
    if (!metrics) {
      metrics = {
        queryCount: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        errorCount: 0,
        transactionCount: 0,
        dataTransferred: 0,
        lastResetTime: Date.now(),
      };
      this.metrics.set(pluginName, metrics);
    }

    metrics.queryCount++;
    metrics.totalExecutionTime += executionTime;
    metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.queryCount;

    if (result) {
      metrics.dataTransferred += result.rowCount * 100; // Estimate 100 bytes per row
    }

    if (isError) {
      metrics.errorCount++;
    }
  }

  private updateTransactionMetrics(pluginName: string): void {
    const metrics = this.metrics.get(pluginName);
    if (metrics) {
      metrics.transactionCount++;
    }
  }

  private generateCacheKey(pluginName: string, query: DatabaseQuery): string {
    return `${pluginName}:${Buffer.from(query.sql + JSON.stringify(query.parameters || [])).toString('base64')}`;
  }

  getMetrics(pluginName: string): DatabaseMetrics | null {
    return this.metrics.get(pluginName) || null;
  }

  getAllMetrics(): Map<string, DatabaseMetrics> {
    return new Map(this.metrics);
  }

  resetMetrics(pluginName: string): void {
    const metrics = this.metrics.get(pluginName);
    if (metrics) {
      metrics.queryCount = 0;
      metrics.totalExecutionTime = 0;
      metrics.averageExecutionTime = 0;
      metrics.errorCount = 0;
      metrics.transactionCount = 0;
      metrics.dataTransferred = 0;
      metrics.lastResetTime = Date.now();
    }
  }

  clearCache(pluginName?: string): void {
    if (pluginName) {
      const keysToDelete = Array.from(this.queryCache.keys()).filter((key) => key.startsWith(pluginName + ':'));
      keysToDelete.forEach((key) => this.queryCache.delete(key));
    } else {
      this.queryCache.clear();
    }
  }

  getActiveConnections(pluginName: string): DatabaseConnection[] {
    return this.connectionPools.get(pluginName) || [];
  }

  getActiveTransactions(pluginName: string): DatabaseTransaction[] {
    return this.activeTransactions.get(pluginName) || [];
  }

  // Utility methods for common database operations
  async select(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    table: string,
    where?: string,
    parameters?: any[]
  ): Promise<DatabaseResult> {
    const sql = `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`;
    return this.executeQuery(pluginName, config, { sql, parameters });
  }

  async insert(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    table: string,
    data: Record<string, any>
  ): Promise<DatabaseResult> {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
    return this.executeQuery(pluginName, config, { sql, parameters: values });
  }

  async update(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    table: string,
    data: Record<string, any>,
    where: string,
    parameters?: any[]
  ): Promise<DatabaseResult> {
    const setClause = Object.keys(data)
      .map((field) => `${field} = ?`)
      .join(', ');
    const values = [...Object.values(data), ...(parameters || [])];
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    return this.executeQuery(pluginName, config, { sql, parameters: values });
  }

  async delete(
    pluginName: string,
    config: PluginDatabaseAccessConfig,
    table: string,
    where: string,
    parameters?: any[]
  ): Promise<DatabaseResult> {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    return this.executeQuery(pluginName, config, { sql, parameters });
  }
}
