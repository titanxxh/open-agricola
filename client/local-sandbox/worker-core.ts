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
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import {
  validateFarmChoice,
  type FarmChoiceType,
  type FarmChoiceValidation,
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

  init(config: LocalGameConfig, viewer: ViewerSpec): LocalSandboxResult {
    const customCards = compileCards(config.cards)
    this.config = config
    const core = new GameCore({
      stateOrSeed: config.seed,
      customCards: customCards.length > 0 ? customCards : undefined,
      initialStateOptions: toInitialStateOptions(config),
      registerCustomCardImpl: registerBrowserBackedCustomCard,
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
    const customCards = compileCards(persisted.config.cards)
    this.config = persisted.config
    const core = new GameCore({
      stateOrSeed: rehydrateState(persisted.serializedState),
      customCards: customCards.length > 0 ? customCards : undefined,
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    })
    this.core = core
    return this.respond(core.withCtx(() => core.getState()), viewer)
  }

  call(method: string, args: unknown[], viewer: ViewerSpec): LocalSandboxResult {
    const core = this.requireCore()
    // Run inside the session card context (like the server router's
    // session.withCtx) so custom-card effects/hooks resolve from
    // SessionCardContext for every command, not just the ones that self-wrap.
    return this.respond(core.withCtx(() => this.dispatch(core, method, args)), viewer)
  }

  validateFarmChoice(type: FarmChoiceType, playerId: string, payload: Record<string, unknown>): FarmChoiceValidation {
    const core = this.requireCore()
    return core.withCtx(() => validateFarmChoice(core.getStateForRead(), type, playerId, payload))
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
      case 'commitSelection': return core.commitSelectionChoice(a[0], a[1])
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
      case 'parentSubmit': return core.submitParentSelection(a[0], a[1])
      default:
        throw new Error(`Unknown local-sandbox method: ${method}`)
    }
  }

  private reinit(config: LocalGameConfig): SessionResponse {
    const customCards = compileCards(config.cards)
    this.config = config
    const core = new GameCore({
      stateOrSeed: config.seed,
      customCards: customCards.length > 0 ? customCards : undefined,
      initialStateOptions: toInitialStateOptions(config),
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    })
    this.core = core
    return core.withCtx(() => core.getState())
  }

  private respond(resp: SessionResponse, viewer: ViewerSpec): LocalSandboxResult {
    const core = this.requireCore()
    return {
      payload: buildSyncPayload(core, resp, viewer.viewerPlayerId, viewer.mode),
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
    if (request.kind === 'call' && request.method === 'validateFarmChoice') {
      const [type, playerId, payload] = request.args as [FarmChoiceType, string, Record<string, unknown>]
      return { kind: 'result', id: request.id, ok: true, raw: core.validateFarmChoice(type, playerId, payload) }
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
