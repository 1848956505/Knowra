export class AppError extends Error {
  constructor(message, {
    code = 'APPLICATION_ERROR',
    statusCode = 400,
    cause
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createAppError(code, message, statusCode = 400, options = {}) {
  return new AppError(message, {
    ...options,
    code,
    statusCode
  });
}
