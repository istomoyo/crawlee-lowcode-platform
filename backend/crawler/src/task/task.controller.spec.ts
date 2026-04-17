import { TaskController } from './task.controller';
import { TaskCookieCredentialService } from './task-cookie-credential.service';
import { TaskService } from './task.service';
import { TaskTemplateService } from './task-template.service';

describe('TaskController', () => {
  let controller: TaskController;

  beforeEach(() => {
    controller = new TaskController(
      {} as TaskService,
      {} as TaskCookieCredentialService,
      {} as TaskTemplateService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
