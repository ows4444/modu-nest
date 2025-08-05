# Deployment Patterns - Single Instance Architecture

## Docker Deployment

### Recommended Single-Instance Setup:

```yaml
# Simple Docker Compose for production
version: '3.8'
services:
  plugin-host:
    build: ./apps/plugin-host
    ports:
      - "4001:4001"
    environment:
      - NODE_ENV=production
      - PORT=4001
      - PLUGINS_DIR=/app/plugins
    volumes:
      - ./plugins:/app/plugins
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  plugin-registry:
    build: ./apps/plugin-registry
    ports:
      - "6001:6001"
    environment:
      - NODE_ENV=production
      - PORT=6001
    volumes:
      - registry-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  registry-data:
```

## Container Deployment

### Dockerfile Optimization:

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY ./dist ./dist
COPY ./plugins ./plugins
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4001/health || exit 1
CMD ["node", "dist/main.js"]
```

## Production Configuration

```bash
# Production environment configuration
NODE_ENV=production
PORT=4001
PLUGIN_REGISTRY_PORT=6001

# Application settings
APP_NAME=plugin-host
API_PREFIX=api
ENABLE_SWAGGER=false

# Plugin system
PLUGINS_DIR=/app/plugins
PLUGIN_LOAD_TIMEOUT=30000
MAX_PLUGIN_SIZE=52428800
AUTO_LOAD_PLUGINS=true

# Security
ALLOW_UNSIGNED_PLUGINS=false
CORS_ORIGINS=https://your-frontend-domain.com

# Logging
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_DIR=/app/logs
```

## Infrastructure Requirements

### Minimal Production Stack:

1. **Reverse Proxy**: nginx or cloud load balancer for SSL termination
2. **Container Runtime**: Docker or containerd
3. **File Storage**: Persistent volumes for plugins and data
4. **Backup Strategy**: Regular backups of SQLite database and plugin files
5. **Monitoring**: Basic health checks and log aggregation

## Kubernetes Deployment (Optional)

```yaml
# Single pod deployment for Kubernetes
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plugin-host
spec:
  replicas: 1
  selector:
    matchLabels:
      app: plugin-host
  template:
    spec:
      containers:
      - name: plugin-host
        image: modu-nest/plugin-host:latest
        ports:
        - containerPort: 4001
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - name: plugin-data
          mountPath: /app/plugins
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 4001
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 4001
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: plugin-data
        persistentVolumeClaim:
          claimName: plugin-data-pvc
```

## Health Monitoring - Current Implementation

### Built-in Health Checks

The system includes basic health monitoring suitable for development and single-instance deployment:

```typescript
// Basic health check implementation
@Controller('health')
export class HealthController {
  
  @Get()
  async getHealth(): Promise<HealthStatus> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        loadedPlugins: this.pluginLoader.getLoadedPluginCount()
      }
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessStatus> {
    // Basic readiness check
    return {
      ready: true,
      timestamp: new Date().toISOString()
    };
  }
}
```

### Monitoring Capabilities

**Current Features:**
- Basic application health endpoint (`/health`)
- Plugin statistics endpoint (`/plugins/stats`)
- Memory usage monitoring
- Plugin loading performance tracking
- Circuit breaker status monitoring

**Development Monitoring:**
- Console logging with configurable levels
- Plugin loading timeline debugging
- Guard resolution status tracking
- Dependency graph visualization

### Future Monitoring Enhancements

For production deployments, consider adding:
- Prometheus metrics integration
- Structured logging (JSON format)
- Application performance monitoring (APM)
- Custom dashboards for plugin metrics
- Alert management for system health

## Advanced Deployment Scenarios

### 1. Cloud Provider Deployments

#### AWS Deployment

```yaml
# docker-compose.aws.yml
version: '3.8'
services:
  plugin-host:
    image: your-registry/plugin-host:latest
    environment:
      - NODE_ENV=production
      - AWS_REGION=${AWS_REGION}
      - LOG_LEVEL=info
    volumes:
      - /efs/plugins:/app/plugins
    networks:
      - plugin-network
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 1G
          cpus: '0.5'

networks:
  plugin-network:
    driver: overlay
```

#### Azure Deployment

```yaml
# Azure Container Instances
apiVersion: 2019-12-01
location: eastus
name: plugin-host-container-group
properties:
  containers:
  - name: plugin-host
    properties:
      image: your-registry/plugin-host:latest
      resources:
        requests:
          cpu: 0.5
          memoryInGb: 1
      ports:
      - port: 4001
        protocol: TCP
      environmentVariables:
      - name: NODE_ENV
        value: production
      - name: PORT
        value: '4001'
      volumeMounts:
      - name: plugin-storage
        mountPath: /app/plugins
  volumes:
  - name: plugin-storage
    azureFile:
      shareName: plugins
      storageAccountName: yourstorageaccount
      storageAccountKey: your-key
  osType: Linux
  restartPolicy: Always
  ipAddress:
    type: Public
    ports:
    - protocol: TCP
      port: 4001
```

### 2. Traditional Server Deployment

#### systemd Service Configuration

```ini
# /etc/systemd/system/plugin-host.service
[Unit]
Description=Modu-Nest Plugin Host
After=network.target
Wants=network.target

[Service]
Type=simple
User=plugin-host
Group=plugin-host
WorkingDirectory=/opt/plugin-host
Environment=NODE_ENV=production
Environment=PORT=4001
Environment=PLUGINS_DIR=/opt/plugin-host/plugins
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=plugin-host

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/plugin-host

[Install]
WantedBy=multi-user.target
```

#### nginx Reverse Proxy Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Plugin Host
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Plugin Registry
    location /registry/ {
        proxy_pass http://localhost:6001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase upload size for plugin packages
        client_max_body_size 100M;
    }
}
```

### 3. Development Environment Setup

#### Docker Compose for Development

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  plugin-host:
    build:
      context: .
      dockerfile: apps/plugin-host/Dockerfile.dev
    ports:
      - "4001:4001"
      - "9229:9229"  # Debug port
    environment:
      - NODE_ENV=development
      - ENABLE_SWAGGER=true
      - ENABLE_HOT_RELOAD=true
      - LOG_LEVEL=debug
    volumes:
      - ./apps/plugin-host/src:/app/src
      - ./plugins:/app/plugins
      - ./dist:/app/dist
    command: npm run start:debug
    depends_on:
      - plugin-registry

  plugin-registry:
    build:
      context: .
      dockerfile: apps/plugin-registry/Dockerfile.dev
    ports:
      - "6001:6001"
      - "9230:9230"  # Debug port
    environment:
      - NODE_ENV=development
      - ENABLE_SWAGGER=true
      - LOG_LEVEL=debug
    volumes:
      - ./apps/plugin-registry/src:/app/src
      - ./registry-storage:/app/storage
    command: npm run start:debug
```

## Backup and Recovery

### SQLite Database Backup

```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/backup/modu-nest"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup SQLite databases
sqlite3 /app/data/plugin-host.db ".backup $BACKUP_DIR/plugin-host-$DATE.db"
sqlite3 /app/data/plugin-registry.db ".backup $BACKUP_DIR/plugin-registry-$DATE.db"

# Backup plugin files
tar -czf "$BACKUP_DIR/plugins-$DATE.tar.gz" /app/plugins

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*.db" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Automated Backup with Cron

```bash
# crontab -e
# Run backup daily at 2 AM
0 2 * * * /opt/scripts/backup-database.sh >> /var/log/backup.log 2>&1

# Run weekly full backup
0 3 * * 0 /opt/scripts/full-backup.sh >> /var/log/backup.log 2>&1
```

## SSL/TLS Configuration

### Let's Encrypt with Certbot

```bash
#!/bin/bash
# Setup Let's Encrypt SSL

# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Performance Optimization

### Production Optimizations

```dockerfile
# Optimized production Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
WORKDIR /app

COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/plugins ./plugins

USER nestjs
EXPOSE 4001

ENV NODE_ENV production
ENV NODE_OPTIONS="--max-old-space-size=1024"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/main.js"]
```

This deployment guide provides comprehensive patterns for deploying the modu-nest plugin architecture in various environments while maintaining the single-instance design principles.