import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskGateway } from './task.gateway';
import { CrawleeEngineService } from './crawlee-engine.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { User } from '../user/entities/user.entity';
import { Execution } from '../execution/entities/execution.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Task, User, Execution])],
  controllers: [TaskController],
  providers: [TaskService, TaskGateway, CrawleeEngineService],
})
export class TaskModule {}
