import { parsePublicCardSnapshot, publicCardDefinition } from '../../shared/contract/public-card-input'
import { ALL_CARD_IMPLS } from '../../shared/cards/register-all'
import { getCardDefinition } from '../../shared/cards/catalog'
import { assertPublicSandboxWorkerLease, type PublicSandboxWorkerLease } from '../../shared/contract/public-sandbox'
import { parseCommitSelectionPayload } from '../../shared/contract/protocol/commit-selection'
import { parseFenceSelectionPayload } from '../../shared/contract/protocol/farm-selection'
/**
 * Testable core of the local-sandbox engine worker: owns the `GameCore`
 * instance and maps transport method calls onto it. `worker.ts` is a thin
 * onmessage shell around this class so vitest can drive it in Node directly.
 *
 * The dispatch table mirrors `server/game-router.ts` endpoint → session
 * method mappings so browser-local games behave identically to server
 * sandbox games.
 *
 * SCOPE / server-authoritative boundary: this runs ONLY the single-player
 * workshop playtest (a dry-run of the author's own cards, in the author's own
 * browser). It is not a multiplayer game and never writes any shared/server
 * `GameState` — real multiplayer rooms stay fully server-authoritative through
 * `GameSession`. This is the accepted divergence recorded in wayfinder map #605
 * (real-match card execution stays server-side; only the workshop dry-run is
 * local). Do not route multiplayer rule decisions through this path.
 */
import { GameCore, type SessionResponse } from '../../shared/session/session-core.ts'
import { buildSyncPayload } from '../../shared/session/sync-payload.ts'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import {
  defaultSandboxDeckIds,
  type InitialStateOptions,
} from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { FenceSelectionPayload, FenceSelectionQuote, GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type {
  FarmChoiceType,
  FarmChoiceValidation,
} from '../../shared/session/farm-choice-validation.ts'
import { registerBrowserBackedCustomCard } from './browser-runtime.ts'
import { validateAndCompileCustomCodeLocal } from './browser-executor.ts'
import {
  LOCAL_SANDBOX_SCHEMA_VERSION,
  type LocalCardInput,
  type LocalGameConfig,
  type LocalSandboxRequest,
  type LocalSandboxResponse,
  type PersistedLocalGame,
  type ViewerSpec,
} from './protocol.ts'

export type LocalSandboxResult = {
  payload: GameSyncPayload
  persist: PersistedLocalGame
}

const compileCards = (cards: LocalCardInput[]): CustomCardData[] =>
  cards.map((card) => {
    if (!card.source) {
      // Data-only card: GameCore registers the cardJson, no code to run.
      return {
        cardType: card.cardType,
        cardJson: card.cardJson,
        effectCode: null,
        compiledCode: null,
        codeManifest: null,
        artUrl: card.artUrl ?? null,
      }
    }
    const result = validateAndCompileCustomCodeLocal(card.source, card.cardJson.id)
    if (!result.valid) {
      throw new Error(`Card ${card.cardJson.id} failed to compile: ${result.errors.join('; ')}`)
    }
    return {
      cardType: card.cardType,
      cardJson: card.cardJson,
      effectCode: card.source,
      compiledCode: result.compiledCode,
      codeManifest: result.manifest,
      artUrl: card.artUrl ?? null,
    }
  })

const toInitialStateOptions = (config: LocalGameConfig): InitialStateOptions => {
  const playerCount = Math.max(2, Math.min(6, Math.floor(config.playerCount)))
  const requestedDecks = (config.deckIds ?? [])
    .map((deck) => deck.trim().toUpperCase())
    .filter((deck) => (defaultSandboxDeckIds as readonly string[]).includes(deck))
  const deckIds = requestedDecks.length > 0
    ? Array.from(new Set(requestedDecks))
    : [...defaultSandboxDeckIds]
  const enableFarmersOfTheMoor = config.enableFarmersOfTheMoor === true
  return {
    playerCount,
    deckIds: deckIds as InitialStateOptions['deckIds'],
    enableThroughTheSeasons: config.enableThroughTheSeasons === true,
    enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal:
      enableFarmersOfTheMoor && config.allowIncompleteFarmersOfTheMoorMinorDeal === true,
    enableSnakeOpening: config.enableSnakeOpening === true,
  }
}

export class LocalSandboxCore {
  private core: GameCore | null = null
  private config: LocalGameConfig | null = null
  private admission?: PublicSandboxWorkerLease

  admit(lease: PublicSandboxWorkerLease | undefined, config = this.config): void {
    if (import.meta.env.VITE_RELEASE_CHANNEL !== 'prerelease' && !config?.publicInputs) return
    assertPublicSandboxWorkerLease(lease, config?.publicInputs)
    if (lease?.buildId !== import.meta.env.VITE_GAME_BUILD_ID && import.meta.env.VITE_RELEASE_CHANNEL === 'prerelease') throw new Error('prerelease_runtime_changed')
    this.admission = lease
  }
  assertAdmission(): void {
    if (import.meta.env.VITE_RELEASE_CHANNEL === 'prerelease' || this.config?.publicInputs) assertPublicSandboxWorkerLease(this.admission, this.config?.publicInputs)
  }
  private cards(config: LocalGameConfig): CustomCardData[] {
    if (!config.publicInputs) {
      if (import.meta.env.VITE_RELEASE_CHANNEL === 'prerelease') throw new Error('Fixed public inputs required')
      return compileCards(config.cards)
    }
    if (config.cards.length) throw new Error('Arbitrary source is unavailable in prerelease')
    const seen = new Set<string>()
    return compileCards(config.publicInputs.snapshots.flatMap(value => {
      const snapshot = parsePublicCardSnapshot(value, value.input.source.workshopCardId), definition = publicCardDefinition(snapshot)
      if (seen.has(definition.cardJson.id)) throw new Error('Conflicting public card identities')
      seen.add(definition.cardJson.id)
      if (getCardDefinition(definition.cardJson.id) && ALL_CARD_IMPLS[definition.cardJson.id]) return []
      return [{ ...definition, source: snapshot.input.effectCode }]
    }))
  }

  init(config: LocalGameConfig, viewer: ViewerSpec): LocalSandboxResult {
    const customCards = this.cards(config)
    this.config = config
    const core = new GameCore({
      stateOrSeed: config.seed,
      customCards: customCards.length > 0 ? customCards : undefined,
      initialStateOptions: toInitialStateOptions(config),
      registerCustomCardImpl: registerBrowserBackedCustomCard,
      customCardRegistration: config.publicInputs ? 'strict' : 'warn',
    })
    this.core = core
    return this.respond(core.withCtx(() => core.getState()), viewer)
  }

  restore(persisted: PersistedLocalGame, viewer: ViewerSpec): LocalSandboxResult {
    if (persisted.schemaVersion !== LOCAL_SANDBOX_SCHEMA_VERSION) {
      throw new Error(
        `Persisted local game schema ${persisted.schemaVersion} does not match ${LOCAL_SANDBOX_SCHEMA_VERSION}`,
      )
    }
    const customCards = this.cards(persisted.config)
    this.config = persisted.config
    const core = new GameCore({
      stateOrSeed: rehydrateState(persisted.serializedState),
      customCards: customCards.length > 0 ? customCards : undefined,
      registerCustomCardImpl: registerBrowserBackedCustomCard,
      customCardRegistration: persisted.config.publicInputs ? 'strict' : 'warn',
    })
    this.core = core
    return this.respond(core.withCtx(() => core.getState()), viewer)
  }

  call(method: string, args: unknown[], viewer: ViewerSpec): LocalSandboxResult {
    this.assertAdmission()
    const core = this.requireCore()
    // Run inside the session card context (like the server router's
    // session.withCtx) so custom-card effects/hooks resolve from
    // SessionCardContext for every command, not just the ones that self-wrap.
    return this.respond(core.withCtx(() => this.dispatch(core, method, args)), viewer)
  }

  quoteFenceSelection(playerIndex: number, requestKey: string, payload: FenceSelectionPayload): FenceSelectionQuote {
    this.assertAdmission()
    return this.requireCore().quoteFenceSelection(playerIndex, requestKey, payload)
  }

  validateFarmChoice(type: FarmChoiceType, playerId: string, payload: Record<string, unknown>): FarmChoiceValidation {
    this.assertAdmission()
    return this.requireCore().validateFarmChoice(type, playerId, payload)
  }

  private dispatch(core: GameCore, method: string, args: unknown[]): SessionResponse {
    const a = args as never[]
    switch (method) {
      case 'getState': return core.getState()
      case 'takeAction': return core.takeAction(a[0], a[1])
      case 'takeSpecialAction': return core.takeSpecialAction(a[0], a[1], a[2], a[3])
      case 'resolveChoice': return core.resolveChoice(a[0], a[1], a[2])
      case 'takeAnytimeAction': return core.takeAnytimeAction(a[0], a[1])
      case 'ordinaryDrawKeep': return core.resolveOrdinaryCardDrawChoice(a[0], a[1], a[2])
      case 'commitSelection': return core.commitSelectionChoice(a[0], parseCommitSelectionPayload(a[1]))
      case 'confirmFeed':
        return core.resolveChoice(a[0], 'confirm' as never, { selections: a[1] } as never)
      case 'confirmNextPlayer': {
        const idx = core.getState().state.currentPlayerIndex
        return core.resolveChoice(idx as never, 'confirm' as never)
      }
      case 'confirmPlayerSwitch': {
        const snapshot = core.getState()
        const idx = snapshot.interaction.stateId === 'wait' &&
          snapshot.interaction.request.kind === 'confirm-player-switch'
          ? snapshot.interaction.playerIndex
          : snapshot.state.currentPlayerIndex
        return core.resolveChoice(idx as never, 'confirm' as never)
      }
      case 'performRoundEnd': return core.performRoundEnd()
      case 'undoStep': return core.undoStep()
      case 'undoAction': return core.undoAction()
      case 'newGame': {
        if (!this.config) throw new Error('newGame before init')
        return this.reinit({ ...this.config, seed: a[0] as number | undefined })
      }
      case 'loadGame': return core.loadState(a[0])
      case 'devSetResources': return core.devSetResources(a[0], a[1])
      case 'devSetRound': return core.devSetRound(a[0])
      case 'devDrawCard': return core.devDrawCard(a[0], a[1])
      case 'devPlayCard': return core.devPlayCard(a[0], a[1])
      case 'devCreatePasture': return core.startDevFenceSelect(a[0])
      case 'draftSubmit': return core.submitDraftPick(a[0], a[1])
      case 'soloHandSubmit': return core.submitSoloHandSelection(a[0], a[1])
      case 'parentSubmit': return core.submitParentSelection(a[0], a[1])
      default:
        throw new Error(`Unknown local-sandbox method: ${method}`)
    }
  }

  private reinit(config: LocalGameConfig): SessionResponse {
    const customCards = this.cards(config)
    this.config = config
    const core = new GameCore({
      stateOrSeed: config.seed,
      customCards: customCards.length > 0 ? customCards : undefined,
      initialStateOptions: toInitialStateOptions(config),
      registerCustomCardImpl: registerBrowserBackedCustomCard,
      customCardRegistration: config.publicInputs ? 'strict' : 'warn',
    })
    this.core = core
    return core.withCtx(() => core.getState())
  }

  private respond(resp: SessionResponse, viewer: ViewerSpec): LocalSandboxResult {
    this.assertAdmission()
    const core = this.requireCore()
    return {
      payload: buildSyncPayload(core, resp, viewer.visiblePlayerIds, viewer.mode),
      persist: {
        schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION,
        config: this.config!,
        serializedState: serializeSessionSnapshot(resp.state, core),
      },
    }
  }

  private requireCore(): GameCore {
    if (!this.core) throw new Error('Local sandbox not initialized')
    return this.core
  }
}

/**
 * Maps one protocol request onto a `LocalSandboxCore`. Shared by the real
 * worker shell (`worker.ts`) and the in-process fake worker used in tests so
 * both paths run the exact same logic.
 */
export const handleLocalSandboxRequest = (
  core: LocalSandboxCore,
  request: LocalSandboxRequest,
): LocalSandboxResponse => {
  try {
    core.admit(request.admission, request.kind === 'init' ? request.config : request.kind === 'restore' ? request.persisted.config : undefined)
    if (request.kind === 'call' && request.method === 'quoteFenceSelection') {
      const [playerIndex, requestKey, payload] = request.args
      if (typeof playerIndex !== 'number' || typeof requestKey !== 'string') throw new Error('Invalid fence quote request')
      const raw = core.quoteFenceSelection(playerIndex, requestKey, parseFenceSelectionPayload(payload))
      core.assertAdmission()
      return { kind: 'result', id: request.id, ok: true, raw }
    }
    if (request.kind === 'call' && request.method === 'validateFarmChoice') {
      const [type, playerId, payload] = request.args as [FarmChoiceType, string, Record<string, unknown>]
      const raw = core.validateFarmChoice(type, playerId, payload)
      core.assertAdmission()
      return { kind: 'result', id: request.id, ok: true, raw }
    }
    const result = request.kind === 'init'
      ? core.init(request.config, request.viewer)
      : request.kind === 'restore'
        ? core.restore(request.persisted, request.viewer)
        : core.call(request.method, request.args, request.viewer)
    return { kind: 'result', id: request.id, ok: true, ...result }
  } catch (error) {
    return {
      kind: 'result',
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
