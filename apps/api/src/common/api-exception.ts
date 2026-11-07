import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@devascent/domain';

/** An error the client is meant to see, already in the shape of `ApiErrorBody`. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}
