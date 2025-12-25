import { Module } from '@nestjs/common';
import { ResultService } from './result.service';
import { ResultController } from './result.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from './entities/result.entity';
import { Execution } from '../execution/entities/execution.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Result, Execution])],
  controllers: [ResultController],
  providers: [ResultService],
})
export class ResultModule {}
