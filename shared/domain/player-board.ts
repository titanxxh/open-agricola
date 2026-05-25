import type { GameState, PlayerState } from '../contract/types.ts'
import { Farmyard } from './farmyard.ts'
import { AnimalZones } from './animal-zones.ts'

type AnimalType = 'sheep' | 'boar' | 'cattle'

/**
 * Facade over a single player's board. Composes the `Farmyard` and
 * `AnimalZones` sub-aggregates and exposes a few cross-aggregate
 * convenience queries. Constructed via `playerBoard(state, idx)`.
 *
 * Mutation contract: query methods (`hasRoomFor`,
 * `totalAnimalCapacity`, `familySize`) never mutate. The single
 * exception is `animals.enforceCapacity()`, which intentionally
 * mutates `player.pastures` / `player.resources` / `player.houseAnimal*`
   * / `player.stableAnimals` to keep the current flat state in sync (see
 * `AnimalZones.enforceCapacity` docblock).
 */
export class PlayerBoard {
  readonly farmyard: Farmyard
  readonly animals: AnimalZones
  private readonly player: PlayerState
  private readonly state: GameState

  constructor(player: PlayerState, state: GameState) {
    this.player = player
    this.state = state
    this.farmyard = new Farmyard(player, state)
    this.animals = new AnimalZones(player, state)
  }

  /** Underlying state (escape hatch for PR2+ migrations). */
  protected getState(): GameState {
    return this.state
  }

  /**
   * Cross-aggregate: does the player have *any* room for a given animal
   * (pasture / house / loose stable / card zone)?
   */
  hasRoomFor(animal: AnimalType): boolean {
    const remaining = this.animals.capacityRemaining()
    return remaining[animal] > 0
  }

  /** Total animal capacity across all zones. */
  totalAnimalCapacity(): number {
    return this.animals.totalCapacity()
  }

  /** Active family-member count. */
  familySize(): number {
    return (this.player.workers ?? []).filter((w) => w.isActive).length
  }
}

/**
 * Factory: create a `PlayerBoard` view bound to `(state, idx)`. Throws
 * if the index is out of range. The returned facade holds a direct
 * reference to the underlying state — it never copies. Query methods
 * are non-mutating; `animals.enforceCapacity()` mutates by design.
 */
export function playerBoard(state: GameState, idx: number): PlayerBoard {
  const player = state.players[idx]
  if (!player) throw new Error(`playerBoard: no player at index ${idx}`)
  return new PlayerBoard(player, state)
}
