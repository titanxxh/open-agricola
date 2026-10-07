import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const REFERENCE_EXAMPLES = readFileSync(new URL('../../docs/community-card-examples.md', import.meta.url), 'utf8')
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'CUSTOM_PromptContract'
const sessions: GameSession[] = []

const sessionFromPrompt = (marker: string) => {
  const example = [...REFERENCE_EXAMPLES.matchAll(/```typescript\s*([\s\S]*?)```/g)]
    .map((match) => match[1]!)
    .find((code) => code.includes(marker))
  expect(example, `Missing executable reference example: ${marker}`).toBeDefined()
  const result = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Prompt Contract' })
${example}
`, CARD_ID)
  if (!result.valid) throw new Error(result.errors.join('\n'))
  const session = new GameSession(42, [{
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Prompt Contract', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: result.compiledCode,
    codeManifest: result.manifest,
  }], { playerCount: 2 })
  sessions.push(session)
  stabilizeRandomHands(session.state.players)
  session.state.players[0]!.minorPlayed.push(CARD_ID)
  return session
}

afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose())
})

describe('executable Workshop reference contracts', () => {
  it('grants feeding-start food once, after feeding starts and before consumption', () => {
    const session = sessionFromPrompt('onStartHarvestFeedingPhase:')
    const state = session.state
    state.round = 4
    state.players.forEach((player) => {
      setActiveWorkerCount(player, 1)
      Object.keys(player.resources).forEach((key) => {
        player.resources[key as keyof typeof player.resources] = 0
      })
      player.resources.food = 1
      markAllWorkersUsed(state, player)
    })
    session.loadState(state)
    const scoresBefore = session.getState().scores!
    const response = session.performRoundEnd()
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players.map((player) => player.resources.begging)).toEqual([0, 1])
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.log).toContainEqual({
      key: 'log.cardEffectGain',
      playerId: state.players[0]!.id,
      params: { player: state.players[0]!.name, gain: { food: 1 }, cardId: CARD_ID },
    })
    expect(response.scores?.map((score) => score.total)).toEqual([
      scoresBefore[0]!.total,
      scoresBefore[1]!.total - 3,
    ])
    const gains = response.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    expect(gains).toHaveLength(1)
    expect(gains[0]).toMatchObject({ phase: 'feeding', resources: { food: 1 } })
    const feeding = response.state.events.find((event) =>
      event.type === 'harvest.phaseStarted' && event.harvestPhase === 'feeding')
    expect(feeding).toBeDefined()
    expect(gains[0]!.seq).toBeGreaterThan(feeding!.seq)
  })

  it.each([
    ['wood', true, 5],
    ['clay', true, 4],
    ['stone', true, 5],
    ['clay', false, 5],
  ] as const)('discounts only clay rooms with the card played: %s / %s', (houseType, played, cost) => {
    const session = sessionFromPrompt("context.player.houseType !== 'clay'")
    const state = session.state
    const player = state.players[0]!
    player.houseType = houseType
    if (!played) player.minorPlayed = []
    Object.assign(player.resources, { wood: 10, clay: 10, stone: 10, reed: 10 })
    session.loadState(state)
    const before = session.getState()
    const resourcesBefore = { ...player.resources }
    const logBefore = structuredClone(before.state.log)
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 2, resources: resourcesBefore })
    expect(response.scores).toEqual(before.scores)
    expect(response.state.log).toEqual([
      { key: 'log.placeFarmer', playerId: player.id, params: { player: player.name, action: 'actions.farm-expansion.name' } },
      ...logBefore,
    ])
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionFarmExpansionSelect', request: { kind: 'choice' },
    })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected construction choice')
    const construct = response.interaction.request.options?.find((option) => option.value.includes('construct'))
    expect(construct).toBeDefined()
    const selectionLog = structuredClone(response.state.log)
    response = session.resolveChoice(0, construct!.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 2, resources: resourcesBefore })
    expect(response.scores).toEqual(before.scores)
    expect(response.state.log).toEqual(selectionLog)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('Expected room selection')
    }
    expect(response.interaction.request.farm.farmType).toBe('room')
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { rooms: [tile] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources[houseType]).toBe(10 - cost)
    expect(response.state.players[0]!.resources.reed).toBe(8)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionFarmExpansionSelect', request: { kind: 'choice' },
    })
    expect(response.scores?.[0]?.total).toBe(before.scores![0]!.total + { wood: 1, clay: 2, stone: 3 }[houseType])
    expect(response.scores?.[1]).toEqual(before.scores![1])
    const paymentLog = response.state.log.find((entry) =>
      entry.key === 'log.actionDetail' && entry.params?.action === 'actions.farm-expansion.name')
    expect(paymentLog).toMatchObject({
      params: { detailParts: { costs: { [houseType]: cost, reed: 2 } } },
    })
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail',
      params: expect.objectContaining({ action: 'actions.construct.name', detailParts: { effects: { buildRoom: 1 } } }),
    }))
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.saved.clay ?? 0).toBe(5 - cost)
    if (cost === 4) {
      expect(paymentLog).toMatchObject({ params: { detailParts: { bonusSources: [CARD_ID] } } })
    } else {
      expect(paymentLog).not.toMatchObject({ params: { detailParts: { bonusSources: [CARD_ID] } } })
    }
  })
})
