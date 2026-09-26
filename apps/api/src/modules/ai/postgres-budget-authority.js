import { beijingDay, budgetStatus, reserveBudget, settleBudget } from './budget-ledger.js';

const retryable = error => ['P2034', '23505', '40001'].includes(error?.code) || ['23505', '40001'].includes(error?.meta?.code);
const read = (db, sql, ...values) => db.$queryRawUnsafe(sql, ...values);
const write = (db, sql, ...values) => db.$executeRawUnsafe(sql, ...values);
const convert = row => ({ reservationId: row.reservation_id, accountRef: row.account_ref, day: row.beijing_day,
  jobId: row.job_id, attemptId: row.attempt_id, priceVersion: row.price_version,
  reservedMicrounits: Number(row.reserved_microunits), actualMicrounits: row.actual_microunits === null ? null : Number(row.actual_microunits),
  status: row.status, createdAt: row.created_at, settledAt: row.settled_at });

/** 计费账户全局串行化；同一账户跨 owner、资料集及设备共用日额度。 */
export function createPostgresBudgetAuthority(client) {
  if (!client?.$transaction) throw new TypeError('PostgreSQL budget authority needs a Prisma client');
  async function transact(accountRef, operation) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await client.$transaction(async db => {
          await read(db, 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', accountRef);
          const days = await read(db, 'SELECT * FROM ai_budget_days WHERE account_ref = $1', accountRef);
          const reservations = await read(db, 'SELECT * FROM ai_budget_reservations WHERE account_ref = $1', accountRef);
          const state = { budgetDays: days.map(row => ({ accountRef: row.account_ref, day: row.beijing_day,
            spentMicrounits: Number(row.spent_microunits), heldMicrounits: Number(row.held_microunits) })),
          budgetReservations: reservations.map(convert) };
          const before = new Set(state.budgetReservations.map(row => row.reservationId));
          const result = operation(state);
          for (const day of state.budgetDays) {
            await write(db, `INSERT INTO ai_budget_days (account_ref, beijing_day, spent_microunits, held_microunits)
              VALUES ($1, $2, $3, $4) ON CONFLICT (account_ref, beijing_day) DO UPDATE
              SET spent_microunits = EXCLUDED.spent_microunits, held_microunits = EXCLUDED.held_microunits`,
            day.accountRef, day.day, BigInt(day.spentMicrounits), BigInt(day.heldMicrounits));
          }
          for (const row of state.budgetReservations) {
            if (!before.has(row.reservationId)) await write(db, `INSERT INTO ai_budget_reservations
              (reservation_id, account_ref, beijing_day, job_id, attempt_id, price_version, reserved_microunits,
               actual_microunits, status, created_at, settled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            row.reservationId, row.accountRef, row.day, row.jobId, row.attemptId, row.priceVersion,
            BigInt(row.reservedMicrounits), null, row.status, row.createdAt, null);
            else {
              const previous = reservations.find(item => item.reservation_id === row.reservationId);
              if (previous.status !== row.status) await write(db, `UPDATE ai_budget_reservations
                SET status = $1, actual_microunits = $2, settled_at = $3 WHERE reservation_id = $4`,
              row.status, row.actualMicrounits === null ? null : BigInt(row.actualMicrounits), row.settledAt, row.reservationId);
            }
          }
          return result;
        }, { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 });
      } catch (error) { if (!retryable(error) || attempt === 4) throw error; }
    }
  }
  return {
    async status(accountRef, day = beijingDay()) {
      const [row] = await read(client, 'SELECT spent_microunits, held_microunits FROM ai_budget_days WHERE account_ref = $1 AND beijing_day = $2', accountRef, day);
      return budgetStatus({ budgetDays: row ? [{ accountRef, day, spentMicrounits: Number(row.spent_microunits), heldMicrounits: Number(row.held_microunits) }] : [] }, accountRef, day);
    },
    reserve: input => transact(input.accountRef, state => reserveBudget(state, { ...input, day: beijingDay() })),
    settle: input => transact(input.accountRef, state => settleBudget(state, input))
  };
}
