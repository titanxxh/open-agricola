import type { ActionDefinition, ActionFlow, ActionSpace, GameState, Resource } from '../contract/types'

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

export const getRegisteredPlayerActionSpaceIds = (): readonly string[] => [...registry.keys()]

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
        ...(def.flowFactory ? { flowFactory: context => {
          if (context.previewMode !== 'base') return def.flowFactory?.(context)
          const actors = config.access === 'owner' ? context.state.players.filter(actor => actor.id === player.id) : context.state.players
          return { type: 'xor', children: actors.flatMap(actor => {
            const flow = def.flowFactory?.({ ...context, player: actor })
            return flow ? [{ ...flow, targetPlayerId: actor.id }] : []
          }) }
        } } : {}),
        id: cardId,
        roundAvailable: 1,
        gainPerRound: { ...config.gainPerRound },
        strictCanExecute: def.strictCanExecute ?? true,
        resources: { ...emptyResources },
        takenBy: [],
      } as ActionSpace)
    }
  }
  return spaces
}

/** The same pure plan drives runtime effects and recursive descriptions. */
export const definePlayerActionSpaceFlow = (definition: Omit<ActionDefinition, 'roundAvailable' | 'gainPerRound' | 'execute' | 'flowFactory'> & {
  flowFactory: (context: Parameters<NonNullable<ActionDefinition['flowFactory']>>[0]) => ActionFlow
}): Omit<ActionDefinition, 'roundAvailable' | 'gainPerRound'> => {
  const bindSpace = (flow: ActionFlow): ActionFlow => flow.type === 'leaf' ? {
    ...flow,
    actionContext: {
      targetSpaceId: definition.id,
      ...(flow.actionId === 'gain' && !flow.params?.recipientPlayerId && !flow.params?.recipientMode && !flow.params?.payerId
        ? { sourceLocation: { kind: 'actionSpace', spaceId: definition.id } } : {}),
      ...flow.actionContext,
    },
  } : { ...flow, children: flow.children.map(bindSpace) }
  const flowFactory: typeof definition.flowFactory = context => bindSpace(definition.flowFactory(context))
  return { ...definition, flowFactory, execute: context => ({ type: 'flow', flow: flowFactory(context) }) }
}
