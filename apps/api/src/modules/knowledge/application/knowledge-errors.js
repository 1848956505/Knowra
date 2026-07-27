import { createAppError } from '../../../errors/app-error.js';

export function validationError(code, message) {
  return createAppError(code, message, 422);
}

export function notFoundError(code, message) {
  return createAppError(code, message, 404);
}

export function conflictError(code, message) {
  return createAppError(code, message, 409);
}
