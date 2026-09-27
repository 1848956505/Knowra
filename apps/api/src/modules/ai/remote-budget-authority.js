/** Mac 只向云端预算权威申请额度；断网、停用同步和响应不完整均拒绝付费执行。 */
export function createRemoteBudgetAuthority(request) {
  if (typeof request !== 'function') throw new TypeError('Remote budget request is required');
  return {
    status: () => request('status'),
    reserve: input => request('reserve', input),
    settle: input => request('settle', input)
  };
}
