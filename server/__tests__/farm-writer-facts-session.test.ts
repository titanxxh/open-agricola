import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'

const cards = ['M092_AridField', 'M096_FallowLand']
const target = { row: 0, col: 2 }

function setup(card: string, zone: 'played' | 'hand' | 'opponent') {
  return createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
    state.round = 5
    const player = state.players[0]!
    player.farmTerrain = [{ ...target, kind: 'moor' }]
    player.fields = []
    Object.assign(player.resources, { fuel: 0, food: 10 })
    if (zone === 'played') player.minorPlayed = [card]
    if (zone === 'hand') player.minorHand = [card]
    if (zone === 'opponent') state.players[1]!.minorPlayed = [card]
  } })
}

// The cleared-space source and owner are tested through real Moor commands.
describe('farm goods marker ownership and committed clearing', () => {
  it.each(cards.flatMap(card => (['hand', 'opponent'] as const).map(zone => ({ card, zone }))))(
    '$card does not create a token from $zone', ({ card, zone }) => {
      const session = setup(card, zone)
      try {
        const other = structuredClone(session.state.players[1])
        const special = session.state.farmersOfTheMoor!.specialActionCards.find(entry => entry.actions.includes('cut-peat'))!
        const response = session.takeSpecialAction(0, special.id, 'cut-peat', { tile: target })
        expect(response.ok, response.error).toBe(true)
        expect(response.state.players[0]!.farmyardSpaceStates ?? []).toEqual([])
        expect(response.state.players[0]!.resources).toMatchObject({ fuel: 3, food: 10 })
        expect(response.state.players[1]).toEqual(other)
        expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toHaveLength(1)
        expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([])
      } finally { session.dispose() }
    },
  )

  it.each(cards)('%s waits for a successful clear after a rejected command and keeps its token unused', card => {
    const session = setup(card, 'played')
    try {
      const special = session.state.farmersOfTheMoor!.specialActionCards.find(entry => entry.actions.includes('cut-peat'))!
      assertRejectedUnchanged(session, () => session.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 99, col: 99 } }))
      const response = session.takeSpecialAction(0, special.id, 'cut-peat', { tile: target })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.farmyardSpaceStates).toMatchObject([{ sourceCardId: card, spaceKey: '0-2' }])
      expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
      expect(response.state.players[0]!.resources).toMatchObject({ fuel: 3, food: 10 })
      expect(getUsedFarmyardTileKeys(response.state.players[0]!)).not.toContain('0-2')
      expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([])
    } finally { session.dispose() }
  })
})
