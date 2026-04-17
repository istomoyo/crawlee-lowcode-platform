import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;

  beforeEach(() => {
    controller = new UserController({} as UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
