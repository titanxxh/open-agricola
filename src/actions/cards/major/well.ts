import type { MajorCardEffect } from './types'

export const well: MajorCardEffect = {
  id: 'Major_Well',
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  description: ['At the start of the next 5 rounds, gain 1 food'],
  onBuy: (_, player) => {
    player.majorEffects.wellRounds += 5
  },
  onRoundStart: (state, player) => {
    if (player.majorEffects.wellRounds <= 0) return
    player.majorEffects.wellRounds -= 1
    player.resources.food += 1
    state.log.unshift({
      key: 'log.wellFood',
      params: { player: player.name },
    })
  },
}
