import { afterEach, describe, expect, it } from 'vitest'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'CUSTOM_PromptContract'
const sessions: GameSession[] = []

const sessionFromPrompt = (marker: string) => {
  const example = [...CARD_DESIGNER_SYSTEM_PROMPT.matchAll(/```typescript\s*([\s\S]*?)```/g)]
    .map((match) => match[1]!)
    .find((code) => code.includes(marker))
  expect(example, `Missing executable prompt example: ${marker}`).toBeDefined()
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

describe('executable Workshop prompt contracts', () => {
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
    const response = session.performRoundEnd()
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players.map((player) => player.resources.begging)).toEqual([0, 1])
    expect(response.state.players[0]!.resources.food).toBe(0)
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
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected construction choice')
    const construct = response.interaction.request.options?.find((option) => option.value.includes('construct'))
    if (construct) response = session.resolveChoice(0, construct.value)
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
  })
})
