// 迁移兼容入口；旧 JS 调用方继续复用同一个错误类。
export { AppError, createAppError } from './app-error.ts';
