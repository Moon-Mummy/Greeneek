/**
 * TypeScript client SDK for the Greeneek Harness runtime: spawn the
 * same-version `gnk --profile sdk` runtime as a subprocess and drive agent
 * turns over stdio JSON-RPC. `GreeneekHarness` is the high-level run API;
 * `HarnessClient` is the lower-level protocol client. A pure library — it
 * registers nothing on a Cordis context; named profiles and ordered patch
 * files customize the runtime process it spawns.
 *
 * @module @greeneek/gnk-sdk-client
 */

export { GreeneekHarness, HarnessSession } from './api.ts'
export type { RunOptions } from './api.ts'
export {
  HarnessClient,
  RequestTimeoutError,
  SdkProtocolError,
  TransportClosedError,
} from './client.ts'
export type { NotificationSubscription } from './client.ts'
export { JsonRpcResponseError } from '@greeneek/gnk-sdk-protocol'
export type {
  ContentBlock,
  SdkPromptContentBlock,
  GreeneekHarnessOptions,
  HarnessClientOptions,
  HarnessNotification,
  NotificationFilter,
  RunResult,
} from './types.ts'
