import { Test } from '@nestjs/testing';
import { MyPluginService } from './my-plugin.service';

describe('MyPluginService', () => {
  let service: MyPluginService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MyPluginService],
    }).compile();

    service = module.get(MyPluginService);
  });

  it('should be defined', () => {
    expect(service).toBeTruthy();
  });
});
