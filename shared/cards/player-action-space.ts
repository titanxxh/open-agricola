import type { ActionDefinition, ActionSpace, GameState, Resource } from '../contract/types'

export type PlayerActionSpaceConfig = {
  /** The card ID */
  cardId: string
  /** Who can use this action space: 'all' = any player, 'owner' = only the player who played it */
  access: 'all' | 'owner'
  gainPerRound?: Partial<Resource>
  /**
   * Optional gate. If provided, the space is only created when this returns
   * true for the current game state. Use for cards whose action-space behavior
   * is conditional on player count or other game state.
   */
  shouldRegister?: (state: GameState) => boolean
  /** Build the ActionDefinition for this card's action space */
  createDefinition: (ownerId: string) => Omit<ActionDefinition, 'roundAvailable' | 'gainPerRound'>
}

const registry = new Map<string, PlayerActionSpaceConfig>()

export const registerPlayerActionSpace = (config: PlayerActionSpaceConfig) => {
  registry.set(config.cardId, config)
}

export const getPlayerActionSpaceConfig = (cardId: string) => registry.get(cardId)

const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

/**
 * Scan all players' minorPlayed, find PlayerActionCards with registered configs,
 * and create ActionSpace objects for them.
 */
export const createPlayerActionSpaces = (state: GameState): ActionSpace[] => {
  const spaces: ActionSpace[] = []
  for (const player of state.players) {
    const allPlayed = [...player.minorPlayed, ...player.occupationPlayed]
    for (const cardId of allPlayed) {
      const config = registry.get(cardId)
      if (!config) continue
      if (config.shouldRegister && !config.shouldRegister(state)) continue
      if (spaces.some((s) => s.id === cardId)) continue
      const def = config.createDefinition(player.id)
      spaces.push({
        ...def,
        id: cardId,
        roundAvailable: 1,
        gainPerRound: { ...config.gainPerRound },
        resources: { ...emptyResources },
        takenBy: [],
      } as ActionSpace)
    }
  }
  return spaces
}
