import { Test } from '@nestjs/testing';
import { MyPluginController } from './my-plugin.controller';
import { MyPluginService } from './my-plugin.service';

describe('MyPluginController', () => {
  let controller: MyPluginController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MyPluginService],
      controllers: [MyPluginController],
    }).compile();

    controller = module.get(MyPluginController);
  });

  it('should be defined', () => {
    expect(controller).toBeTruthy();
  });
});
