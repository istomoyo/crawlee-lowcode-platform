import { PartialType } from '@nestjs/mapped-types';
import { CreateExecutionDto } from './create-execution.dto';

export class UpdateExecutionDto extends PartialType(CreateExecutionDto) {}
