import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Execution } from './entities/execution.entity';
import { User } from '../user/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { Result } from '../result/entities/result.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Execution, User, Task, Result])],
  controllers: [ExecutionController],
  providers: [ExecutionService],
})
export class ExecutionModule {}
