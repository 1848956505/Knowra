import type { PathLike } from 'node:fs';
import {
  reconcileAttachmentIntegrity,
  normalizeSha256,
  type AttachmentIntegrityRecord,
  type ReconcileAttachmentIntegrityOptions
} from '../src/infrastructure/attachment-record-reconciliation.ts';
import {
  reconcileAttachmentIntegrity as bridgeReconcileAttachmentIntegrity,
  normalizeSha256 as bridgeNormalizeSha256
} from '../src/infrastructure/attachment-record-reconciliation.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type ReconcileResult = Assert<Equal<ReturnType<typeof reconcileAttachmentIntegrity>, boolean>>;
type NormalizedHash = string | null;
export type NormalizeResult = Assert<Equal<ReturnType<typeof normalizeSha256>, NormalizedHash>>;
export type ReconcileArguments = Assert<
  Equal<
    Parameters<typeof reconcileAttachmentIntegrity>,
    [
      attachment: AttachmentIntegrityRecord | null | undefined,
      filePath: PathLike | null | undefined,
      options?: ReconcileAttachmentIntegrityOptions | undefined
    ]
  >
>;
export type NormalizeArguments = Assert<Equal<Parameters<typeof normalizeSha256>, [value: unknown]>>;
export type BridgeReconcile = Assert<
  Equal<typeof bridgeReconcileAttachmentIntegrity, typeof reconcileAttachmentIntegrity>
>;
export type BridgeNormalize = Assert<Equal<typeof bridgeNormalizeSha256, typeof normalizeSha256>>;
export type RecordKeys = Assert<
  Equal<keyof AttachmentIntegrityRecord, 'id' | 'size' | 'sha256' | 'status' | 'verifiedAt'>
>;
export type UnknownId = Assert<Equal<AttachmentIntegrityRecord['id'], unknown>>;
export type UnknownSize = Assert<Equal<AttachmentIntegrityRecord['size'], unknown>>;
export type UnknownHash = Assert<Equal<AttachmentIntegrityRecord['sha256'], unknown>>;
export type UnknownStatus = Assert<Equal<AttachmentIntegrityRecord['status'], unknown>>;
export type UnknownVerification = Assert<Equal<AttachmentIntegrityRecord['verifiedAt'], unknown>>;
export type OptionalRecord = Assert<Equal<AttachmentIntegrityRecord, Partial<AttachmentIntegrityRecord>>>;
export type MutableRecord = Assert<
  Equal<
    AttachmentIntegrityRecord,
    { -readonly [Key in keyof AttachmentIntegrityRecord]: AttachmentIntegrityRecord[Key] }
  >
>;
export type OptionKeys = Assert<Equal<keyof ReconcileAttachmentIntegrityOptions, 'now'>>;
export type NativeDateInput = Assert<
  Equal<ReconcileAttachmentIntegrityOptions['now'], string | number | Date | undefined>
>;

declare const unknownValue: unknown;
declare const uncheckedRecord: AttachmentIntegrityRecord;
declare const filePath: PathLike;
const record: AttachmentIntegrityRecord = {
  id: Symbol('id'),
  size: unknownValue,
  sha256: unknownValue,
  status: unknownValue,
  verifiedAt: unknownValue
};
const result: boolean = reconcileAttachmentIntegrity(record, filePath, { now: undefined });
const digest: string | null = normalizeSha256(unknownValue);
reconcileAttachmentIntegrity({}, null);
reconcileAttachmentIntegrity(null, undefined);
reconcileAttachmentIntegrity(undefined, undefined, undefined);
reconcileAttachmentIntegrity(
  { id: undefined, size: undefined, sha256: undefined, status: undefined, verifiedAt: undefined },
  null
);
reconcileAttachmentIntegrity(record, '/synthetic/attachment', {});
reconcileAttachmentIntegrity(record, Buffer.from('/synthetic/attachment'), { now: 0 });
reconcileAttachmentIntegrity(record, new URL('file:///synthetic/attachment'), { now: new Date() });
reconcileAttachmentIntegrity(record, filePath, { now: 'not a valid date' });
reconcileAttachmentIntegrity(record, filePath, { now: NaN });
reconcileAttachmentIntegrity(record, filePath, { now: new Date(NaN) });
bridgeReconcileAttachmentIntegrity(record, null, { now: undefined });
bridgeReconcileAttachmentIntegrity(null, Buffer.from('/synthetic/attachment'));
bridgeReconcileAttachmentIntegrity(undefined, new URL('file:///synthetic/attachment'), { now: new Date() });
bridgeNormalizeSha256(undefined);
bridgeNormalizeSha256(Symbol('hash'));
normalizeSha256(() => 'hash');
normalizeSha256({
  toString() {
    return 'hash';
  }
});
normalizeSha256(null);
normalizeSha256(new String('hash'));

// 五个字段仍然可变且未经验证；返回 true 不把记录细化为完整附件 DTO。
record.id = unknownValue;
record.size = unknownValue;
record.sha256 = unknownValue;
record.status = unknownValue;
record.verifiedAt = unknownValue;
record.size = Symbol('size');
record.sha256 = { unverified: true };
record.status = false;
record.verifiedAt = 1n;
const options: ReconcileAttachmentIntegrityOptions = { now: undefined };
options.now = 'synthetic';
options.now = new Date(NaN);
options.now = NaN;
options.now = undefined;
const nativeDateInput: NonNullable<ReconcileAttachmentIntegrityOptions['now']> = new Date();
new Date(nativeDateInput);

// 结构类型无法拒绝冻结对象或吞掉赋值的访问器，不承诺原生写入一定成功。
const frozen = Object.freeze({ id: 'frozen', size: unknownValue });
reconcileAttachmentIntegrity(frozen, null);
const accessorRecord: AttachmentIntegrityRecord = {
  get id() {
    return Symbol('id');
  },
  get size() {
    return unknownValue;
  },
  set size(value: unknown) {
    void value;
  },
  get sha256() {
    return unknownValue;
  },
  set sha256(value: unknown) {
    void value;
  },
  get status() {
    return unknownValue;
  },
  set status(value: unknown) {
    void value;
  },
  get verifiedAt() {
    return unknownValue;
  },
  set verifiedAt(value: unknown) {
    void value;
  }
};
bridgeReconcileAttachmentIntegrity(accessorRecord, null);
void [result, digest, uncheckedRecord];
