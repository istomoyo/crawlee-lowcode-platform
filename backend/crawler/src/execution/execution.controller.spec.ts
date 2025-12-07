import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';

describe('ExecutionController', () => {
  let controller: ExecutionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [ExecutionService],
    }).compile();

    controller = module.get<ExecutionController>(ExecutionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
