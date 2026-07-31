import { createAppError } from '../errors/app-error.js';

export function mapPostgresError(error, {
  fallbackCode = 'DATABASE_OPERATION_FAILED',
  fallbackMessage = 'PostgreSQL operation failed',
  uniqueCode = 'DATABASE_CONFLICT',
  uniqueMessage = 'PostgreSQL unique constraint conflict',
  concurrentCode = 'DATABASE_CONCURRENT_UPDATE',
  concurrentMessage = 'The record changed during this operation; reload and retry'
} = {}) {
  if (error?.code === 'P2002') {
    return createAppError(
      uniqueCode,
      uniqueMessage,
      409,
      { cause: error }
    );
  }
  if (error?.code === 'P2003') {
    return createAppError(
      'DATABASE_REFERENCE_INVALID',
      'PostgreSQL foreign-key reference is invalid',
      422,
      { cause: error }
    );
  }
  if (error?.code === 'P2025') {
    return createAppError(
      'DATABASE_RECORD_NOT_FOUND',
      'PostgreSQL record was not found',
      404,
      { cause: error }
    );
  }
  if (error?.code === 'P2034') {
    return createAppError(
      concurrentCode,
      concurrentMessage,
      409,
      { cause: error }
    );
  }
  return createAppError(fallbackCode, fallbackMessage, 500, { cause: error });
}

export async function withPostgresErrors(operation, options = {}) {
  try {
    return await operation();
  } catch (error) {
    if (
      error?.code?.startsWith?.('DATABASE_')
      || (error?.code && Number.isInteger(error?.statusCode))
    ) {
      throw error;
    }
    throw mapPostgresError(error, options);
  }
}
