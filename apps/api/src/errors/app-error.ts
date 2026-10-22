export interface AppErrorOptions {
  code?: string;
  statusCode?: number;
  cause?: unknown;
  [key: string]: unknown;
}

export class AppError extends Error {
  declare code: string;
  declare statusCode: number;

  constructor(message: string, { code = 'APPLICATION_ERROR', statusCode = 400, cause }: AppErrorOptions = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createAppError(
  code: string,
  message: string,
  statusCode = 400,
  options: AppErrorOptions = {}
): AppError {
  return new AppError(message, {
    ...options,
    code,
    statusCode
  });
}
