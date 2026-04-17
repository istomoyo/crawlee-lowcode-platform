import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskGateway } from './task.gateway';
import { CrawleeEngineService } from './crawlee-engine.service';
import { FilePackageService } from './file-package.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskCookieCredential } from './entities/task-cookie-credential.entity';
import { Task } from './entities/task.entity';
import { TaskTemplate } from './entities/task-template.entity';
import { User } from '../user/entities/user.entity';
import { Execution } from '../execution/entities/execution.entity';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { TaskCookieCredentialService } from './task-cookie-credential.service';
import { TaskTemplateService } from './task-template.service';
import { NotificationModule } from '../notification/notification.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskTemplate,
      TaskCookieCredential,
      User,
      Execution,
    ]),
    AdminModule,
    AuthModule,
    MailModule,
    NotificationModule,
  ],
  controllers: [TaskController],
  providers: [
    TaskService,
    TaskCookieCredentialService,
    TaskTemplateService,
    TaskGateway,
    CrawleeEngineService,
    FilePackageService,
  ],
})
export class TaskModule {}
