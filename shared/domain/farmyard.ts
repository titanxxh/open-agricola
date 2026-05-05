import type {
  GameState,
  PlayerState,
  FarmTilePosition,
  InteractionFarmSelection,
  InteractionSelection,
  Resource,
} from '../game/types.ts'
import type { FenceValidationResult } from '../logic/farm/fence-validation.ts'
import type { PlowValidationResult } from '../logic/farm/plow-validation.ts'
import type { SowValidationResult, SowSelection } from '../logic/farm/sow-validation.ts'
import type {
  RoomSelectionResult,
  StableSelectionResult,
} from '../logic/farm/validators.ts'
import { validateFenceSelection } from '../logic/farm/fence-validation.ts'
import { validatePlowSelection } from '../logic/farm/plow-validation.ts'
import { validateSowSelection } from '../logic/farm/sow-validation.ts'
import {
  validateRoomSelection,
  validateStableSelection,
} from '../logic/farm/validators.ts'
import {
  buildPlowFarmInteraction,
  buildSowFarmInteraction,
  buildFenceFarmInteraction,
  buildRoomFarmInteraction,
  buildStableFarmInteraction,
  buildFarmPositionSelectionInteraction,
  getPermittedExtraSowableFields,
} from '../logic/farm/farm-interaction.ts'
import { computePasturesFromFences, type Pasture } from './pasture.ts'

export type FarmSelectKind =
  | 'plow'
  | 'sow'
  | 'fence'
  | 'room'
  | 'stable'
  | 'farm-position'

export type FenceSpec = {
  edges: string[]
  palisadeEdges?: string[]
  extraWood?: number
  freeFences?: number
  options?: { skipPayment?: boolean; allowPalisades?: boolean }
  lockedKeys?: Set<string>
}

export type SelectableTilesOpts = {
  costOverride?: Partial<Resource>
  actionContext?: Record<string, unknown>
  spaceId?: string
  zoneFilter?: 'pasture-1'
  max?: number
}

/**
 * View of a player's farmyard. Wraps validation + interaction helpers
 * from `shared/logic/farm/*`. PR1 wrap-only — query methods do NOT
 * mutate the underlying `PlayerState`. Held as `PlayerState` (not
 * `Readonly`) because the legacy validators have a non-generic
 * `PlayerState` signature; the "no mutation" contract is by convention
 * within this class, not by type.
 */
export class Farmyard {
  private readonly player: PlayerState
  // Reserved for PR2+ wraps that need cross-player state (e.g.
  // action-space availability lookups); kept on the instance to keep
  // the constructor shape stable across PRs.
  private readonly state: Readonly<GameState>

  constructor(player: PlayerState, state: Readonly<GameState>) {
    this.player = player
    this.state = state
  }

  /** Underlying state (escape hatch for PR2+ migrations). */
  protected getState(): Readonly<GameState> {
    return this.state
  }

  /** Validate a single plow tile selection. */
  canPlow(
    coord: FarmTilePosition,
    lockedKeys?: Set<string>,
  ): PlowValidationResult<PlayerState> {
    return validatePlowSelection(this.player, coord, lockedKeys)
  }

  /** Validate a sow selection (one or more fields with crop assignments). */
  canSow(
    selection: { fields: SowSelection[] },
    options?: Parameters<typeof validateSowSelection>[2],
  ): SowValidationResult<PlayerState> {
    return validateSowSelection(this.player, selection.fields, options)
  }

  /** Validate a fence-build spec (edges + optional palisades). */
  canBuildFence(spec: FenceSpec): FenceValidationResult<PlayerState> {
    return validateFenceSelection(
      this.player,
      spec.edges,
      spec.palisadeEdges ?? [],
      spec.extraWood ?? 0,
      spec.freeFences ?? 0,
      spec.options ?? {},
      spec.lockedKeys,
    )
  }

  /** Validate a room-build selection (one or more contiguous tiles). */
  canBuildRoom(
    coord: FarmTilePosition,
    lockedKeys?: Set<string>,
  ): RoomSelectionResult {
    return validateRoomSelection(this.player, [coord], lockedKeys)
  }

  /** Validate a stable-build selection. */
  canBuildStable(
    coord: FarmTilePosition,
    lockedKeys?: Set<string>,
  ): StableSelectionResult {
    return validateStableSelection(this.player, [coord], lockedKeys)
  }

  /** Derived pasture view (projected from `player.pastures`). */
  pastures(): Pasture[] {
    return computePasturesFromFences(this.player)
  }

  /** Currently-placed fence edges (raw edge IDs). */
  emptyFences(): string[] {
    return (this.player.fenceSegments ?? []).map((s) => s.edge)
  }

  /**
   * Build farm-select interaction payload for a given farm-select kind.
   * Wraps `farm-interaction.ts`. Caller passes opts matching the underlying
   * function's optional parameters (costOverride / actionContext / spaceId).
   */
  selectableTiles(
    kind: FarmSelectKind,
    opts?: SelectableTilesOpts,
  ): InteractionFarmSelection | InteractionSelection {
    const ctx = opts?.actionContext
    const cost = opts?.costOverride
    switch (kind) {
      case 'plow':
        return buildPlowFarmInteraction(this.player, cost)
      case 'sow':
        return buildSowFarmInteraction(this.player, ctx)
      case 'fence':
        return buildFenceFarmInteraction(this.player, opts?.spaceId ?? '')
      case 'room':
        return buildRoomFarmInteraction(this.player, cost, ctx)
      case 'stable':
        return buildStableFarmInteraction(this.player, cost, {
          zoneFilter: opts?.zoneFilter,
          max: opts?.max,
        })
      case 'farm-position':
        return buildFarmPositionSelectionInteraction(this.player, ctx)
    }
  }

  /** Extra sowable fields permitted by card effects (e.g. B72 pastures). */
  permittedExtraSowableFields(actionContext?: Record<string, unknown>) {
    return getPermittedExtraSowableFields(this.player, actionContext)
  }
}
