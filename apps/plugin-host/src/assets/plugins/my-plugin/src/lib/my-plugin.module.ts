import { MyPluginService } from './my-plugin.service';
import { MyPluginController } from './my-plugin.controller';
import { Plugin } from '@modu-nest/plugin-types';

@Plugin({
  name: 'MyPlugin',
  imports: [],
  controllers: [MyPluginController],
  providers: [MyPluginService],
  exports: [MyPluginService],
})
export class MyPlugin {}
