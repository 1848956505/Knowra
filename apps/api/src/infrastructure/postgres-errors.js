import { createAppError } from '../errors/app-error.js';

export function mapPostgresError(error, {
  fallbackCode = 'DATABASE_OPERATION_FAILED',
  fallbackMessage = 'PostgreSQL operation failed'
} = {}) {
  if (error?.code === 'P2002') {
    return createAppError(
      'DATABASE_CONFLICT',
      'PostgreSQL unique constraint conflict',
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
  return createAppError(fallbackCode, fallbackMessage, 500, { cause: error });
}

export async function withPostgresErrors(operation, options = {}) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code?.startsWith?.('DATABASE_')) {
      throw error;
    }
    throw mapPostgresError(error, options);
  }
}
