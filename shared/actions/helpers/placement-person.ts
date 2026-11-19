import type {
  ActionSpace, GameState, PlayerState, SupplyWorkerSource,
} from '../../contract/types'
import { findDispatchableGuest, guestMayEnter } from '../../domain/guests'
import { findSupplyWorker } from '../../domain/supply-workers'
import { findActionSpaceByWorker } from '../../domain/space'

/**
 * The person `place-farmer` puts down when `actionContext.workerSource` names
 * one, instead of the player's next family member at home.
 */
export type PlacementPerson = {
  /** The placement is only available while this person has a legal target. */
  needsTarget?: true
  /** Reserves the person before targets are offered. */
  claim?: () => void
  /** Narrows the legal targets to those this person may enter. */
  allowsSpace?: (space: ActionSpace) => boolean
  /** The identity the person takes on the accepted space, or undefined when it can no longer enter. */
  enter: (space: ActionSpace) => string | undefined
  /** Runs once the person stands on the space; returns actionContext fields for the space's action. */
  placed?: () => Record<string, unknown> | undefined
  /**
   * The person, not the card that placed it, takes the space: the use carries no card
   * source, as for a family member on an ordinary turn.
   */
  ownsUse?: true
}

export type PlacementPersonInput = {
  state: GameState
  player: PlayerState
  actionContext: Record<string, unknown> | undefined
  sourceCard: string | undefined
}

/** Resolves the declared source to a person that can still be placed. */
export type PlacementPersonSource = (input: PlacementPersonInput) => PlacementPerson | undefined

const readSupplySource = (
  context: Record<string, unknown> | undefined,
): SupplyWorkerSource | undefined => {
  const source = context?.workerSource
  if (!source || typeof source !== 'object' || !('kind' in source) || source.kind !== 'supply') return
  if (!('disposition' in source) || (
    source.disposition !== 'return-to-supply' && source.disposition !== 'remove-from-game'
  )) return
  if ('workerId' in source && typeof source.workerId !== 'string') return
  return source as SupplyWorkerSource
}

/** A Supply Person: one of the player's own tokens, used without family growth. */
const supplyPerson: PlacementPersonSource = ({ state, player, actionContext, sourceCard }) => {
  const source = readSupplySource(actionContext)
  if (!source) return
  const workerId = typeof actionContext?.supplyWorkerId === 'string' ? actionContext.supplyWorkerId : source.workerId
  const worker = findSupplyWorker(player, sourceCard, workerId)
  if (!worker) return
  return {
    claim: () => {
      if (actionContext) actionContext.supplyWorkerId = worker.id
      worker.supplyUse = {
        sourceCard,
        disposition: source.disposition,
        status: 'pending',
        returnRound: state.round,
      }
    },
    enter: () => findActionSpaceByWorker(state, player.id, worker.id) === undefined ? worker.id : undefined,
    placed: () => {
      if (worker.supplyUse) worker.supplyUse.status = 'temporary'
      return { trueAction: true }
    },
  }
}

const guestPerson: PlacementPersonSource = ({ state, player, actionContext, sourceCard }) => {
  const source = actionContext?.workerSource
  if (!source || typeof source !== 'object' || !('guestId' in source)) return
  const guest = findDispatchableGuest(state, player, source.guestId)
  if (!guest) return
  return {
    needsTarget: true,
    // Dispatched by rotation or by the card that granted it, the Guest takes its own turn.
    // Sent by another card as that card's extra person, the use is that card's, as a family member's would be.
    ...(sourceCard === undefined || sourceCard === guest.sourceCardId ? { ownsUse: true as const } : {}),
    allowsSpace: (space) => guestMayEnter(guest.where, space),
    enter: () => guest.id,
    placed: () => {
      guest.dispatched = true
      return { workerSource: source }
    },
  }
}

const placementPersonSources: Record<string, PlacementPersonSource> = {
  supply: supplyPerson,
  guest: guestPerson,
}

/** Whether the placement declares a person source at all; an ordinary placement does not. */
export const declaresPlacementPerson = (actionContext: Record<string, unknown> | undefined): boolean =>
  actionContext?.workerSource !== undefined

/** The declared person, or undefined when the source is unknown or its person is unavailable. */
export const resolvePlacementPerson = (input: PlacementPersonInput): PlacementPerson | undefined => {
  const source = input.actionContext?.workerSource
  if (!source || typeof source !== 'object' || !('kind' in source) || typeof source.kind !== 'string') return
  return Object.hasOwn(placementPersonSources, source.kind) ? placementPersonSources[source.kind]!(input) : undefined
}
