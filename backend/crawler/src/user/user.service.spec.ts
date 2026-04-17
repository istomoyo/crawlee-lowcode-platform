import { JwtService } from '@nestjs/jwt';
import type Redis from 'ioredis';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService(
      {} as Repository<User>,
      {} as JwtService,
      {} as MailService,
      {} as Redis,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
