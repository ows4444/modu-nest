import { Controller, Get } from '@nestjs/common';

@Controller('api/v1')
export class AppController {
  @Get()
  getApiInfo(): { 
    name: string; 
    version: string; 
    description: string;
    endpoints: string[];
  } {
    return {
      name: 'Plugin Registry API',
      version: 'v1',
      description: 'RESTful API for managing plugins in the ModuleNest ecosystem',
      endpoints: [
        'GET /api/v1/plugins - List all plugins',
        'POST /api/v1/plugins - Upload a plugin',
        'GET /api/v1/plugins/:name - Get plugin details',
        'GET /api/v1/plugins/:name/download - Download plugin',
        'DELETE /api/v1/plugins/:name - Delete plugin',
        'GET /health - Health check',
        'GET /stats - Registry statistics'
      ]
    };
  }
}
