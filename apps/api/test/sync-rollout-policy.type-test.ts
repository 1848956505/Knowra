import { assertSyncDeviceEnabled } from '../src/modules/sync/rollout-policy.ts';
import { assertSyncDeviceEnabled as bridgeAssertSyncDeviceEnabled } from '../src/modules/sync/rollout-policy.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type PolicyArguments = Assert<Equal<Parameters<typeof assertSyncDeviceEnabled>, [deviceId: unknown]>>;
export type PolicyResult = Assert<Equal<ReturnType<typeof assertSyncDeviceEnabled>, void>>;
export type PolicyShape = Assert<Equal<typeof assertSyncDeviceEnabled, (deviceId: unknown) => void>>;
export type BridgeArguments = Assert<Equal<Parameters<typeof bridgeAssertSyncDeviceEnabled>, [deviceId: unknown]>>;
export type BridgeResult = Assert<Equal<ReturnType<typeof bridgeAssertSyncDeviceEnabled>, void>>;
export type BridgeShape = Assert<Equal<typeof bridgeAssertSyncDeviceEnabled, (deviceId: unknown) => void>>;
export type BridgeIdentityContract = Assert<
  Equal<typeof bridgeAssertSyncDeviceEnabled, typeof assertSyncDeviceEnabled>
>;

declare const unverifiedDevice: unknown;
const inputs: readonly unknown[] = [
  unverifiedDevice,
  'device',
  '',
  undefined,
  null,
  false,
  0,
  1n,
  Symbol('device'),
  {},
  [],
  new String('device'),
  () => undefined,
  Promise.resolve('device'),
  Object.freeze({ deviceId: 'device' })
];

// 策略检查接受未知值；不验证设备、不细化类型，也不承诺一定成功。
for (const input of inputs) {
  const sourceResult: void = assertSyncDeviceEnabled(input);
  const bridgeResult: void = bridgeAssertSyncDeviceEnabled(input);
  void [sourceResult, bridgeResult];
}
const receiver: { method: (deviceId: unknown) => void } = { method: assertSyncDeviceEnabled };
receiver.method(undefined);
const readonlySearchView: readonly unknown[] = ['device'];
const originalEqualityResult: boolean = readonlySearchView.includes(unverifiedDevice);
void originalEqualityResult;
