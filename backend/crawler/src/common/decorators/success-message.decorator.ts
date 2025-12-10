// src/common/decorators/success-message.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const SUCCESS_MESSAGE = 'success_message';

export const SuccessMessage = (message: string) =>
  SetMetadata(SUCCESS_MESSAGE, message);
