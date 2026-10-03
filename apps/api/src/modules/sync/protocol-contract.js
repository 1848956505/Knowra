import { syncError } from './journal.js';
import { TRAINING_SYNC_CAPABILITY } from './entity-contract.js';

export const SYNC_ENTITY_SCHEMA_VERSION = 7;
export const KNOWLEDGE_PROVENANCE_SYNC_CAPABILITY = 'knowledge-provenance-v1';
export const KNOWLEDGE_LIFECYCLE_SYNC_CAPABILITY = 'knowledge-lifecycle-v1';
export const REQUIRED_SYNC_CAPABILITIES = Object.freeze([
  'asset-lifecycle-v1', 'atomic-entities-v2', 'knowledge-items-v1', KNOWLEDGE_PROVENANCE_SYNC_CAPABILITY, KNOWLEDGE_LIFECYCLE_SYNC_CAPABILITY, TRAINING_SYNC_CAPABILITY
]);
export const SYNC_CAPABILITIES = Object.freeze([...REQUIRED_SYNC_CAPABILITIES, 'attachment-transfer-v1'].sort());
export const syncContract = () => ({ entitySchemaVersion: SYNC_ENTITY_SCHEMA_VERSION, capabilities: [...SYNC_CAPABILITIES] });

export function assertSyncContract(input, { query = false } = {}) {
  const schema = query ? Number(input?.entitySchemaVersion) : input?.entitySchemaVersion;
  const capabilities = query && typeof input?.capabilities === 'string' ? input.capabilities.split(',') : input?.capabilities;
  if (schema !== SYNC_ENTITY_SCHEMA_VERSION || !Array.isArray(capabilities)
    || capabilities.length > SYNC_CAPABILITIES.length || new Set(capabilities).size !== capabilities.length
    || capabilities.some(value => typeof value !== 'string' || !SYNC_CAPABILITIES.includes(value))
    || REQUIRED_SYNC_CAPABILITIES.some(value => !capabilities.includes(value))) {
    throw syncError('SYNC_CLIENT_UPGRADE_REQUIRED', '知识与训练同步格式已升级，请更新应用与云端；本地数据和待同步修改已保留。', 422);
  }
  return { entitySchemaVersion: schema, capabilities: [...capabilities].sort() };
}

export function syncContractQuery() {
  const contract = syncContract();
  return `entitySchemaVersion=${contract.entitySchemaVersion}&capabilities=${encodeURIComponent(contract.capabilities.join(','))}`;
}

export function assertSnapshotBinding(snapshot, contract, ownerId, epoch) {
  if (!snapshot || snapshot.ownerId !== ownerId || snapshot.datasetEpoch !== epoch
    || snapshot.entitySchemaVersion !== contract.entitySchemaVersion
    || JSON.stringify(snapshot.capabilities) !== JSON.stringify(contract.capabilities)
    || typeof snapshot.snapshotId !== 'string' || typeof snapshot.cursor !== 'string'
    || !Number.isSafeInteger(snapshot.count) || snapshot.count < 0) {
    throw syncError('SYNC_SNAPSHOT_CONTRACT_MISMATCH', '初始化快照不属于当前同步格式或资料库，请重新建立基线。', 409);
  }
  return snapshot;
}

export function snapshotBinding(snapshot) {
  return Object.fromEntries(['snapshotId', 'ownerId', 'datasetEpoch', 'entitySchemaVersion', 'capabilities', 'cursor', 'count']
    .map(key => [key, structuredClone(snapshot[key])]));
}
