/**
 * postMessage protocol between the main thread (`LocalGameTransport`) and the
 * local-sandbox engine worker. See wayfinder T1 (#606) for the design notes.
 */
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { PersistedSessionSnapshot } from '../../shared/session/serialization.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'

/** Bumped when a persisted local game can no longer be restored. */
export const LOCAL_SANDBOX_SCHEMA_VERSION = 1

export type LocalCardInput = {
  cardType: 'minor' | 'occupation'
  cardJson: CustomCardData['cardJson']
  /** TypeScript source — compiled locally inside the worker. Null for data-only cards. */
  source: string | null
  artUrl?: string | null
}

export type LocalGameConfig = {
  cards: LocalCardInput[]
  playerCount: number
  deckIds?: string[]
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
  seed?: number
}

export type ViewerSpec = {
  viewerPlayerId: string | null
  mode: SyncPayloadMode
}

/** Everything needed to rebuild the worker: timeout recovery and IndexedDB resume share it. */
export type PersistedLocalGame = {
  schemaVersion: number
  config: LocalGameConfig
  serializedState: PersistedSessionSnapshot
}

export type LocalSandboxRequest =
  | { id: number; kind: 'init'; config: LocalGameConfig; viewer: ViewerSpec }
  | { id: number; kind: 'restore'; persisted: PersistedLocalGame; viewer: ViewerSpec }
  | { id: number; kind: 'call'; method: string; args: unknown[]; viewer: ViewerSpec }

export type LocalSandboxResponse =
  | { kind: 'ready' }
  | { kind: 'result'; id: number; ok: true; payload: GameSyncPayload; persist: PersistedLocalGame }
  | { kind: 'result'; id: number; ok: true; raw: unknown }
  | { kind: 'result'; id: number; ok: false; error: string }
