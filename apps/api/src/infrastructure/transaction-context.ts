// 事务代理提供只读状态，原子操作入口可拒绝被并入一个可捕获其失败的外层事务。
export const PERSISTENCE_TRANSACTION_ACTIVE = Symbol.for('knowra.persistence-transaction-active');
