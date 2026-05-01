import type { ActionDefinition, GameState, PlayerState } from '../../game/types'

export const setStartPlayer = (state: GameState, player: PlayerState) => {
  state.players.forEach((item) => {
    item.startPlayer = item.id === player.id
  })
}

export const setFirstPlayerAction: ActionDefinition = {
  id: 'set-first-player',
  nameKey: 'actions.set-first-player.name',
  descriptionKey: 'actions.set-first-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    setStartPlayer(state, player)
    state.log.unshift({
      key: 'log.startPlayer',
      params: { player: player.name },
    })
    return { type: 'ok' }
  },
}
