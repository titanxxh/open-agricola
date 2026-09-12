import { describe, expect, it } from 'vitest'
import { setupMoorAudit } from './_helpers/moor-rules-audit'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { markAllWorkersUsed } from '../../shared/domain/player'

describe('Moor worker and conversion printed-rule audit', () => {
  it('M099 currently rewards a healthy Infirmary visitor when its earlier visitor was sick', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M099_HealingClay']
    player.sickWorkerIds = [player.workers.find((worker) => worker.isActive)!.id]
    let response = session.takeAction(0, 'moor-infirmary')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(22)
    expect(response.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toHaveLength(1)
    confirmNextPlayer(session)
    session.state.currentPlayerIndex = 0
    response = session.takeAction(0, 'moor-infirmary')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toHaveLength(2)
    expect(response.state.players[0]!.resources.food).toBe(24)
  })

  it('M115 currently misses the wood reward for a boar cooked through harvest feeding', () => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M115_OakBark']
    player.improvements = ['Major_Fireplace1']
    player.resources.food = 2
    player.resources.boar = 1
    player.houseAnimalType = 'boar'
    player.houseAnimalCount = 1
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    let response = session.performRoundEnd()
    for (let step = 0; step < 12 && response.interaction.request.kind !== 'feed'; step++) {
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.request.kind).toBe('choice')
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.interaction.request.kind).toBe('feed')
    expect(response.interaction.playerIndex).toBe(0)
    response = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'Major_Fireplace1', exchangeIndex: 1, count: 1, sourceName: 'Fireplace' },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 0, wood: 20, begging: 0 })
  })
})
