import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import type { ProblemDetails } from '@flowforge/contracts';

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: ProblemDetails['errors'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        title = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        title = typeof resp['message'] === 'string' ? resp['message'] : exception.message;
        detail = typeof resp['error'] === 'string' ? resp['error'] : undefined;

        if (Array.isArray(resp['message'])) {
          errors = (resp['message'] as string[]).map((msg) => ({
            field: 'unknown',
            message: msg,
          }));
          title = 'Validation Error';
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const problem: ProblemDetails = {
      type: `https://flowforge.dev/errors/${status}`,
      title,
      status,
      detail,
      instance: request.url,
      errors,
    };

    response.status(status).type('application/problem+json').json(problem);
  }
}
