import { Injectable } from '@nestjs/common';

@Injectable()
export class MyPluginService {
  getHello(): string {
    return 'Hello from MyPlugin plugin!';
  }

  // Add your plugin service methods here
}
