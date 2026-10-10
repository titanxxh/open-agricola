import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed, workersAvailable } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { compileContractCard, createRoundTenSession } from './_helpers/workshop-contract-card'

/**
 * ADR 0025 fixed behavior tests for the query hooks that take part in
 * commitments, extra turns, breeding, animal scoring and shared animal zones,
 * for the effect metadata, for the listener data fields, and for the
 * computeExchanges phase. Each scenario is a two-player game in which player 0
 * has played the custom card; unless a scenario says otherwise it is the work
 * phase of round 10 and each player owns 10 food and nothing else.
 */

const CARD_ID = 'CUSTOM_DeclarationProbe'
const GAIN_FOOD = `gainLeaf(CARD_ID, { food: 1 })`
const END_OF_GAME_TIMEOUT_MS = 20_000

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

type Options = { workers?: [number, number]; configure?: (state: GameState, owner: PlayerState) => void }

const start = (impl: string, { workers, configure }: Options = {}) => {
  const session = createRoundTenSession(compileContractCard(CARD_ID, `const CARD_IMPL = ${impl}`), {
    workers, configure: state => configure?.(state, state.players[0]!),
  })
  sessions.push(session)
  return session
}

const effect = (declarations: string) => `{ effect: { id: CARD_ID, ${declarations} } }`

/** A round whose workers are all placed, so the next command ends it. */
const roundEnding = (round: number, configure?: Options['configure']): Options => ({
  configure: (state, owner) => {
    state.round = round
    configure?.(state, owner)
    state.players.forEach(player => markAllWorkersUsed(state, player))
  },
})

type Wait = Extract<ReturnType<GameSession['getState']>['interaction'], { stateId: 'wait' }>

/** Ends the round, answering each choice with `answer` and recording the prompts that were shown. */
const endRound = (session: GameSession, answer: (interaction: Wait) => string) => {
  const prompts: Array<{ playerIndex: number; promptKey?: string; options: string[] }> = []
  autoAdvanceRoundEnd(session, {
    maxIterations: 200,
    onChoice: (interaction) => {
      prompts.push({
        playerIndex: interaction.playerIndex, promptKey: interaction.promptKey,
        options: (interaction.request.options ?? []).map(option => option.value),
      })
      return session.resolveChoice(interaction.playerIndex, answer(interaction))
    },
  })
  return prompts
}

const lastOption = (interaction: Wait) => interaction.request.options!.at(-1)!.value
const cardOption = (interaction: Wait) => interaction.request.options!.find(option => option.sourceCard === CARD_ID)?.value

const sheepPasture = (player: PlayerState, sheep: number) => {
  player.pastures = [{
    id: `${player.id}-pasture`, size: 2, tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], stables: 0, animalType: 'sheep', animalCount: sheep,
  }]
  player.resources.sheep = sheep
}

describe('Workshop Capability Contract query hooks', () => {
  it('computeResourceCommitments: rejects a command that would spend the committed goods', () => {
    const session = start(effect('computeResourceCommitments: (state, owner) => [{ playerId: owner.id, resources: { grain: 1 } }]'), {
      configure: (_state, owner) => {
        owner.fields = [{ row: 0, col: 2, stacks: [] }]
        owner.resources.grain = 1
      },
    })

    let pending = session.takeAction(0, 'grain-utilization')
    if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') {
      pending = session.resolveChoice(0, pending.interaction.request.options!.find(option => option.labelKey === 'actions.sow.name')!.value)
    }
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })

    expect(sown).toMatchObject({ ok: false, error: 'command would break a resource commitment' })
    expect(sown.state.players[0]!.resources.grain).toBe(1)
    expect(sown.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(session.cardWarnings).toEqual([])
  })

  it('countExtraTurns: decides how many extra turns the card still offers this round', () => {
    const session = start(effect(`
      countExtraTurns: (state, player) => 2 - ((player.cardStates[CARD_ID] && player.cardStates[CARD_ID].counters || {}).used || 0),
      contributeExtraTurn: () => ({ type: 'seq', children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'increment-counter', key: 'used', amount: 1 } },
        ${GAIN_FOOD}] })`), { workers: [1, 1] })

    expect(session.takeAction(0, 'forest').ok).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)

    // Both players have placed their only worker: the card's two extra turns follow.
    confirmNextPlayer(session)
    expect(session.getState().state.players[0]!.resources.food).toBe(11)
    confirmNextPlayer(session)
    expect(session.getState().state.players[0]!.resources.food).toBe(12)

    // contributeExtraTurn still returns a flow; the count of 0 is what ends the round.
    confirmNextPlayer(session)
    const state = session.getState().state
    expect(state.round).toBe(11)
    expect(state.players[0]!.resources.food).toBe(12)
    expect(session.cardWarnings).toEqual([])
  })

  it.each([
    { enforce: true, reorganizations: 1 },
    { enforce: false, reorganizations: 0 },
  ])('enforceReorganizeOnLastHarvest: $enforce asks for $reorganizations reorganization after the last Harvest without newborns', ({ enforce, reorganizations }) => {
    const session = start(effect(`enforceReorganizeOnLastHarvest: () => ${enforce}`), roundEnding(14, (_state, owner) => {
      owner.houseAnimalType = 'sheep'
      owner.houseAnimalCount = 1
      owner.resources.sheep = 1
    }))

    autoAdvanceRoundEnd(session, { maxIterations: 200 })

    const state = session.getState().state
    expect(state.gameOver).toBe(true)
    expect(state.players[0]!.resources.sheep).toBe(1)
    expect(state.events.filter(event => event.type === 'farm.animalMoved')).toHaveLength(reorganizations)
    expect(session.cardWarnings).toEqual([])
  }, END_OF_GAME_TIMEOUT_MS)

  it.each([
    {
      hook: 'computeBreedThreshold',
      source: `computeBreedThreshold: (state, player, animalType, ctx) => animalType === 'sheep' && ctx.sourceCard === 'harvest' ? 1 : undefined`,
    },
    {
      hook: 'computeBreedableAnimalCount',
      source: `computeBreedableAnimalCount: (state, player, animalType, currentCount, ctx) =>
        animalType === 'sheep' && ctx.sourceCard === 'harvest' ? currentCount + 1 : undefined`,
    },
  ])('$hook: lets a single sheep breed at Harvest for the owner only', ({ source }) => {
    // Round 4 ends with the first Harvest.
    const session = start(effect(source), roundEnding(4, (state) => { state.players.forEach(player => sheepPasture(player, 1)) }))

    autoAdvanceRoundEnd(session, { maxIterations: 200 })

    const state = session.getState().state
    expect(state.round).toBe(5)
    expect(state.players.map(player => player.resources.sheep)).toEqual([2, 1])
    expect(session.cardWarnings).toEqual([])
  })

  it('computeAnimalScoreAdjustment: adjusts the horse score in a Farmers of the Moor game', () => {
    const session = start(effect(`computeAnimalScoreAdjustment: (state, player, animalType, ctx) =>
      animalType === 'horse' && ctx.categoryKey === 'horses' && ctx.quantity === 0 ? 2 : 0`),
    { configure: (state) => { state.enableFarmersOfTheMoor = true } })

    const horses = session.getState().scores!.map(score => score.categories.find(category => category.key === 'horses')!.total)

    // Having no horse scores -1; the card adds 2 for its owner.
    expect(horses).toEqual([1, -1])
    expect(session.cardWarnings).toEqual([])
  })

  it('onComputeSharedAnimalZones: offers the card\'s zone to the other player, not to its owner', () => {
    const session = start(effect(`onComputeSharedAnimalZones: (owner, animalOwner, zones, state) =>
      [{ id: 'shared-probe', zoneType: 'card', capacity: state.round - 8 }]`))
    const state = session.state
    const [owner, opponent] = state.players as [PlayerState, PlayerState]

    const zonesOf = (player: PlayerState) => session.withCtx(() => computeAnimalZones(player, state))

    expect(zonesOf(opponent).find(zone => zone.id === 'shared-probe')).toMatchObject({
      zoneType: 'card', cardId: CARD_ID, capacity: 2,
      ownerPlayerId: owner.id, animalOwnerPlayerId: opponent.id, displaySource: 'borrowed-played-card',
    })
    expect(zonesOf(owner).some(zone => zone.id === 'shared-probe')).toBe(false)
    expect(session.cardWarnings).toEqual([])
  })
})

describe('Workshop Capability Contract effect metadata', () => {
  it.each([
    { name: 'the owner only by default', metadata: '', food: [7, 6] },
    { name: 'every player with beforeEndGameScope allPlayers', metadata: `beforeEndGameScope: 'allPlayers',`, food: [7, 7] },
  ])('onBeforeEndGame runs for $name', ({ metadata, food }) => {
    const session = start(effect(`${metadata} onBeforeEndGame: () => ${GAIN_FOOD}`), roundEnding(14))

    const prompts = endRound(session, lastOption)

    const state = session.getState().state
    expect(state.gameOver).toBe(true)
    // Each player paid 4 food at the last Harvest.
    expect(state.players.map(player => player.resources.food)).toEqual(food)
    expect(prompts).toEqual([])
    expect(session.cardWarnings).toEqual([])
  }, END_OF_GAME_TIMEOUT_MS)

  it.each([
    { name: 'accepted', accept: true, food: 7 },
    { name: 'skipped', accept: false, food: 6 },
  ])('beforeEndGameMandatory false makes the end-game effect optional: $name', ({ accept, food }) => {
    const session = start(effect(`beforeEndGameMandatory: false, onBeforeEndGame: () => ${GAIN_FOOD}`), roundEnding(14))

    const prompts = endRound(session, interaction => accept ? cardOption(interaction)! : '__skip__')

    expect(prompts).toEqual([{ playerIndex: 0, promptKey: 'ui.interactionOptionalAction', options: [expect.any(String), '__skip__'] }])
    const state = session.getState().state
    expect(state.gameOver).toBe(true)
    expect(state.players[0]!.resources.food).toBe(food)
    expect(session.cardWarnings).toEqual([])
  }, END_OF_GAME_TIMEOUT_MS)

  it('extraTurnBeforeWorkers offers the extra turn while the owner still has workers', () => {
    const session = start(effect(`extraTurnBeforeWorkers: true,
      contributeExtraTurn: (state, player) => player.cardStates[CARD_ID] && player.cardStates[CARD_ID].flagged ? undefined
        : { type: 'seq', children: [
            { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
            ${GAIN_FOOD}] }`),
    { workers: [2, 2], configure: (state) => { state.currentPlayerIndex = 1 } })

    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const offered = confirmNextPlayer(session)

    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.request.options!.map(option => option.labelKey))
      .toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    const used = session.resolveChoice(0, cardOption(offered.interaction)!)

    expect(used.ok).toBe(true)
    expect(used.state.players[0]!.resources.food).toBe(11)
    expect(workersAvailable(used.state, used.state.players[0]!)).toBe(2)
    expect(session.cardWarnings).toEqual([])
  })

  it.each([
    { name: 'preHarvestGoodsWanted without a grain field', metadata: `preHarvestGoodsWanted: ['grain'],`, field: false, offered: true },
    { name: 'preHarvestGoodsWanted with a grain field that will be reaped', metadata: `preHarvestGoodsWanted: ['grain'],`, field: true, offered: false },
    { name: 'preHarvestGoodsWantedBeforeReap with a grain field', metadata: `preHarvestGoodsWantedBeforeReap: ['grain'],`, field: true, offered: true },
    {
      name: 'preHarvestGoodsWanted with maySkipHarvestFieldPhase and a grain field',
      metadata: `preHarvestGoodsWanted: ['grain'], maySkipHarvestFieldPhase: true,`, field: true, offered: true,
    },
    { name: 'no declaration', metadata: '', field: false, offered: false },
  ])('$name: the grain exchange is offered before Harvest = $offered', ({ metadata, field, offered }) => {
    // Ebonist turns 1 wood into 1 food and 1 grain once per Harvest; the owner has no grain.
    const session = start(effect(metadata), roundEnding(4, (_state, owner) => {
      owner.occupationPlayed = ['D155_Ebonist']
      owner.resources.wood = 1
      if (field) owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    }))

    const prompts = endRound(session, () => 'cancel')

    expect(prompts.filter(prompt => prompt.promptKey === 'ui.interactionExchangeChoice')).toHaveLength(offered ? 1 : 0)
    expect(session.getState().state.round).toBe(5)
    expect(session.cardWarnings).toEqual([])
  })
})

describe('Workshop Capability Contract listener data fields', () => {
  it.each([
    { zone: 'hand', food: 11 },
    { zone: 'played', food: 10 },
  ])('zones hand: reacts while the card is in $zone = food $food', ({ zone, food }) => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], zones: ['hand'],
      handler: () => ({ sourceCard: CARD_ID, flow: ${GAIN_FOOD} }) }] }`, {
      configure: (_state, owner) => {
        if (zone !== 'hand') return
        owner.minorPlayed = []
        owner.minorHand = [CARD_ID]
      },
    })

    const collected = session.takeAction(0, 'forest')

    expect(collected.ok).toBe(true)
    expect(collected.state.players[0]!.resources.food).toBe(food)
    expect(session.cardWarnings).toEqual([])
  })

  it.each([
    { name: 'a mandatory reaction cannot be passed until it has run', mandatory: 'mandatory: true,', passDisabled: true },
    { name: 'optional reactions can all be passed', mandatory: '', passDisabled: false },
  ])('mandatory: $name', ({ mandatory, passDisabled }) => {
    // Two reactions at the same moment make the player choose their order.
    const session = start(`{ listeners: [
      { cardIds: [CARD_ID], actions: ['collect'], phases: ['before'], ${mandatory} handler: () => ({ sourceCard: CARD_ID, flow: ${GAIN_FOOD} }) },
      { cardIds: [CARD_ID], actions: ['collect'], phases: ['before'], handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { grain: 1 }) }) },
    ] }`)

    const offered = session.takeAction(0, 'forest')
    expect(offered.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionSelectTrigger' })
    if (offered.interaction.stateId !== 'wait') return
    const options = offered.interaction.request.options!
    expect(!!options.find(option => option.value === '__pass__')!.disabled).toBe(passDisabled)

    let passed = session.resolveChoice(0, '__pass__')
    if (passDisabled) {
      expect(passed).toMatchObject({ ok: false, error: 'choice disabled' })
      expect(session.resolveChoice(0, options[0]!.value).state.players[0]!.resources.food).toBe(11)
      passed = session.resolveChoice(0, '__pass__')
    }

    expect(passed.ok).toBe(true)
    // The remaining reactions were passed and Forest was collected.
    expect(passed.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 0, food: passDisabled ? 11 : 10 })
    expect(session.cardWarnings).toEqual([])
  })

  it('replacesTurn: the anytime entry uses up the owner\'s turn without placing a worker', () => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], phases: ['anytime'], replacesTurn: true,
      handler: () => ({ sourceCard: CARD_ID, flow: ${GAIN_FOOD} }) }] }`, { workers: [2, 2] })
    const entry = `${CARD_ID}:listener:0`
    expect(session.getState().interaction.anytimeActions.map(action => action.id)).toEqual([entry])

    const used = session.takeAnytimeAction(0, entry)

    expect(used.ok).toBe(true)
    expect(used.state.players[0]!.resources.food).toBe(11)
    expect(used.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
    expect(workersAvailable(used.state, used.state.players[0]!)).toBe(2)
    confirmNextPlayer(session)
    expect(session.getState().state.currentPlayerIndex).toBe(1)
    expect(session.cardWarnings).toEqual([])
  })

  it('blockedAnytimeInteractionKinds: hides the anytime entry during the named interaction', () => {
    const session = start(`{ listeners: [
      { cardIds: [CARD_ID], phases: ['anytime'], blockedAnytimeInteractionKinds: ['farm-select'],
        handler: () => ({ sourceCard: CARD_ID, flow: ${GAIN_FOOD} }) },
      { cardIds: [CARD_ID], phases: ['anytime'], handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { grain: 1 }) }) },
    ] }`)
    const offered = (interaction: { anytimeActions: Array<{ id: string }> }) => interaction.anytimeActions.map(action => action.id)

    expect(offered(session.getState().interaction)).toEqual([`${CARD_ID}:listener:0`, `${CARD_ID}:listener:1`])

    const plowing = session.takeAction(0, 'farmland')

    expect(plowing.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    expect(offered(plowing.interaction)).toEqual([`${CARD_ID}:listener:1`])
    expect(session.cardWarnings).toEqual([])
  })

  it('preScoring: only the marked anytime entry is offered in the window before scoring', () => {
    // The marked entry is offered once: using it sets the card's flag.
    const session = start(`{ listeners: [
      { cardIds: [CARD_ID], phases: ['anytime'], preScoring: true,
        handler: (ctx) => ctx.player.cardStates[CARD_ID] && ctx.player.cardStates[CARD_ID].flagged ? undefined
          : { sourceCard: CARD_ID, flow: { type: 'seq', children: [
              { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
              ${GAIN_FOOD}] } } },
      { cardIds: [CARD_ID], phases: ['anytime'], handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { grain: 1 }) }) },
    ] }`, roundEnding(14))

    // Earlier Harvest windows list no option of the card and are skipped.
    const prompts = endRound(session, interaction => cardOption(interaction) ?? '__skip__')

    const windows = prompts.filter(prompt => prompt.options.length > 1)
    // One option for the marked listener beside the skip; the unmarked listener is not offered.
    expect(windows).toEqual([{ playerIndex: 0, promptKey: 'ui.interactionOptionalAction', options: [expect.any(String), '__skip__'] }])
    const state = session.getState().state
    expect(state.gameOver).toBe(true)
    expect(state.players[0]!.resources).toMatchObject({ food: 7, grain: 0 })
    expect(session.cardWarnings).toEqual([])
  }, END_OF_GAME_TIMEOUT_MS)
})

describe('Workshop Capability Contract computeExchanges phase', () => {
  it('adds the returned exchange to the owner\'s exchange menu', () => {
    const session = start(`{ listeners: [{ cardIds: [CARD_ID], phases: ['computeExchanges'],
      handler: (ctx) => ctx.extraData.window === 'anytime'
        ? { sourceCard: CARD_ID, extraExchanges: [{ from: { food: 2 }, to: { wood: 1 }, triggers: ['anytime'] }] }
        : undefined }] }`)

    const menu = session.takeAnytimeAction(0, 'exchange')

    expect(menu.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionExchangeChoice' })
    if (menu.interaction.stateId !== 'wait') return
    // The only exchange the owner has; its menu entry trades as often as the 10 food allow.
    expect(menu.interaction.request.options!.map(option => [option.value, option.sourceCard]))
      .toEqual([['trade:0:5', CARD_ID], ['cancel', undefined]])
    const traded = session.resolveChoice(0, 'trade:0:5')

    expect(traded.ok).toBe(true)
    expect(traded.state.players[0]!.resources).toMatchObject({ food: 0, wood: 5 })
    expect(session.cardWarnings).toEqual([])
  })
})
