import type { GameState, PlayerState } from '../game/types.ts'
import type { AnimalZone } from '../actions/helpers/animal-zones.ts'
import {
  computeAnimalZones,
  getAssignedAnimalCount,
  getTotalAnimalCapacity,
  enforceAnimalCapacity,
  getPastureCapacity,
  getLooseStableKeys,
  computeInvalidAnimalsForZone,
} from '../actions/helpers/animal-zones.ts'

export type { AnimalZone }

type AnimalType = 'sheep' | 'boar' | 'cattle'

/**
 * View of a player's animal zones (pastures + house + loose stables +
 * card-typed zones). Wraps `actions/helpers/animal-zones.ts`. PR1
 * wrap-only — no behavior change.
 *
 * Mutation contract: query methods (`zones`, `countAnimals`,
 * `totalCapacity`, `capacityRemaining`, `pastureCapacity`,
 * `looseStableKeys`, `invalidAnimalsForZone`) do NOT mutate the
 * underlying `PlayerState`. Only `enforceCapacity()` mutates — see
 * its docblock for details.
 */
export class AnimalZones {
  private readonly player: PlayerState
  private readonly state: GameState

  constructor(player: PlayerState, state: GameState) {
    this.player = player
    this.state = state
  }

  /** All zones (pastures, house, loose stables, card zones) the player has. */
  zones(): AnimalZone[] {
    return computeAnimalZones(this.player)
  }

  /**
   * Count of a given animal type, or all assigned animals if no type given.
   */
  countAnimals(type?: AnimalType): number {
    if (type === undefined) {
      return getAssignedAnimalCount(this.player)
    }
    return (this.player.resources[type] as number) ?? 0
  }

  /** Total capacity across all zones (used for room-for-X questions). */
  totalCapacity(): number {
    return getTotalAnimalCapacity(this.player)
  }

  /**
   * Per-type remaining capacity (animals that still fit on the board).
   * NOTE: total capacity is type-agnostic in BGA; we report the same
   * `free` value for each animal type. PR2+ may refine this if a call
   * site needs per-type slot accounting.
   */
  capacityRemaining(): { sheep: number; boar: number; cattle: number } {
    const total = this.totalCapacity()
    const assigned = getAssignedAnimalCount(this.player)
    const free = Math.max(0, total - assigned)
    return { sheep: free, boar: free, cattle: free }
  }

  /**
   * Imperative: rebalance animals across zones to fit current capacity.
   *
   * **MUTATES** `player.pastures`, `player.houseAnimal*`,
   * `player.stableAnimals`, and the per-type counters in
   * `player.resources` — this is the legacy `enforceAnimalCapacity`
   * contract. Kept here as a wrap rather than split into a separate
   * write-class because PR1 must not change behavior or shape. PR4+
   * may refactor this into an explicit command.
   */
  enforceCapacity(): void {
    enforceAnimalCapacity(this.player)
  }

  /** Capacity of a specific pasture zone (0 if not a pasture). */
  pastureCapacity(zoneId: string): number {
    const pasture = (this.player.pastures ?? []).find((p) => p.id === zoneId)
    if (!pasture) return 0
    return getPastureCapacity(pasture)
  }

  /** Loose-stable tile keys (stables not inside any pasture). */
  looseStableKeys(): string[] {
    return getLooseStableKeys(this.player)
  }

  /**
   * Per-card invalid-animals hook for a given zone. Returns the list of
   * meeple records flagged invalid by the card (e.g. C11 WildlifeReserve).
   * Returns empty list if zone is unknown or not card-typed.
   */
  invalidAnimalsForZone(zoneId: string) {
    const zone = this.zones().find((z) => z.id === zoneId)
    if (!zone) return []
    return computeInvalidAnimalsForZone(this.state, this.player, zone)
  }
}
