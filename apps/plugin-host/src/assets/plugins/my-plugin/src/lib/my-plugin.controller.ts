import { MyPluginService } from './my-plugin.service';
import { PluginGet, PluginRoute } from '@modu-nest/plugin-types';

@PluginRoute('my-plugin')
export class MyPluginController {
  constructor(private readonly myPluginService: MyPluginService) {}

  @PluginGet('hello')
  getHello() {
    return this.myPluginService.getHello();
  }

  // Add your plugin controller methods here
}
