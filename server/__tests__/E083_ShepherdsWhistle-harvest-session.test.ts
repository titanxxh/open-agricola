import { describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const CARD = 'E083_ShepherdsWhistle'
const setup = (mode: 'occupied' | 'empty' | 'none' | 'fenced' | 'hand') => createWorkSession({
  seed: 1163, configure: state => {
    state.round = 7
    state.players.forEach(p => { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.resources.food = 100 })
    const p = state.players[0]!
    p.minorPlayed = mode === 'hand' ? [] : [CARD]
    if (mode === 'hand') p.minorHand = [CARD]
    if (mode !== 'none') p.stableTiles = [{ row: 0, col: 1 }]
    if (mode === 'occupied') { p.stableAnimals = { '0-1': 'sheep' }; p.resources.sheep = 1 }
    p.pastures = [{ id: 'whistle-target', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    p.fenceSegments = ['H-0-2','H-1-2','V-0-2','V-0-3'].map(edge => ({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}))
    if (mode === 'fenced') {
      p.stableTiles = [{ row: 0, col: 2 }]
      p.pastures[0]!.animalType = 'sheep'
      p.pastures[0]!.animalCount = 1
      p.resources.sheep = 1
    }
  },
})

const harvest = (session: GameSession, mode: 'accept' | 'decline' | 'unchanged') => {
  let r = session.getState()
  let cardReorgs = 0
  for (let n = 0; n < 80; n++) {
    expect(r.ok,r.error).toBe(true)
    const i = r.interaction
    if (r.state.round === 8) return {response:r,cardReorgs}
    if (i.stateId === 'idle') {
      const actor = r.state.currentPlayerIndex
      const space = ['grain-seeds','reed-bank','clay-pit','forest','day-laborer','fishing'].find(id => session.getActionAvailability(actor)[id])
      if (!space) throw new Error('No legal filler action')
      r = session.takeAction(actor,space)
      continue
    }
    if (i.stateId !== 'wait') throw new Error('Unexpected game end before harvest completed')
    const q = i.request
    if (q.kind === 'confirm-next-player') r = confirmNextPlayer(session)
    else if (q.kind === 'confirm-player-switch') r = session.resolveChoice(q.fromPlayerIndex,'confirm')
    else if (q.kind === 'feed') r = session.resolveChoice(i.playerIndex,'confirm',{selections:[]})
    else if (q.kind === 'animal-reorg') {
      cardReorgs++
      const total = r.state.players[i.playerIndex]!.resources.sheep
      let remaining = total
      const orderedZones = [
        ...q.zones.filter(zone => zone.zoneType === 'pasture'),
        ...q.zones.filter(zone => zone.zoneType === 'stable'),
        ...q.zones.filter(zone => zone.zoneType !== 'pasture' && zone.zoneType !== 'stable'),
      ]
      const zones = orderedZones.map(zone => {
        const count = mode === 'unchanged' && total === 1
          ? (zone.zoneType === 'stable' ? 1 : 0)
          : Math.min(remaining,zone.capacity)
        remaining -= count
        return {...zone,animalType: count ? 'sheep' : null,animalCount:count}
      })
      expect(remaining).toBe(0)
      r = session.resolveChoice(i.playerIndex,'confirm',{zones})
    } else if (q.kind === 'choice' || q.kind === 'select-trigger') {
      const option = q.options.find(o => !('disabled' in o && o.disabled) && (mode === 'decline' ? ['__skip__','__pass__'].includes(o.value) : !['__skip__','__pass__'].includes(o.value)))
      if (!option) throw new Error(JSON.stringify(i))
      r = session.resolveChoice(i.playerIndex,option.value)
    } else throw new Error(JSON.stringify(i))
  }
  throw new Error('Harvest did not finish')
}

describe('Shepherds Whistle occupied-stable harvest continuation', () => {
  it.each([{mode:'accept',expected:3},{mode:'decline',expected:1},{mode:'unchanged',expected:1}] satisfies Array<{mode:'accept' | 'decline' | 'unchanged';expected:number}>)('occupied stable $mode finishes natural harvest with $expected sheep', ({mode,expected}) => {
    const session = setup('occupied')
    const {response:r,cardReorgs} = harvest(session,mode)
    expect(r.state.players[0]!.resources.sheep).toBe(expected)
    expect(r.state.players[1]!.resources.sheep).toBe(0)
    if (mode === 'accept') {
      expect(cardReorgs).toBeGreaterThan(0)
      expect(r.state.players[0]!.pastures[0]!.animalCount).toBe(2)
      expect(Object.values(r.state.players[0]!.stableAnimals).filter(a => a === 'sheep')).toHaveLength(1)
    }
    session.dispose()
  })
  it.each([{mode:'empty',expected:1},{mode:'none',expected:0},{mode:'fenced',expected:1},{mode:'hand',expected:0}] satisfies Array<{mode:'empty' | 'none' | 'fenced' | 'hand';expected:number}>)('$mode stable eligibility leaves exactly $expected sheep', ({mode,expected}) => {
    const session = setup(mode)
    const {response:r} = harvest(session,'accept')
    expect(r.state.players[0]!.resources.sheep).toBe(expected)
    session.dispose()
  })
})
