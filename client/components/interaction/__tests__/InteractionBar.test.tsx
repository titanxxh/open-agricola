// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AnytimeAction, SessionResponse } from '../../../../shared/contract/types'
import { getParentCardDefinition } from '../../../../shared/parents'
import type { PendingChoice } from '../../../types/ui'
import {
  buildInteractionBarActions,
  buildInteractionBarModel,
  type InteractionBarActions,
  type InteractionBarPresentationInput,
} from '../../../app/interaction-bar-presentation'
import { InteractionBar } from '../InteractionBar'
import { describeFutureSchedule } from '../../../../shared/actions/future-schedule'
import { GameSession } from '../../../../server/game/authoritative-session'

const noop = () => {}

const anytimeActions: AnytimeAction[] = [
  {
    id: 'anytime-test',
    labelKey: 'ui.interactionConfirmSwitch',
  },
]

const pendingChoice: PendingChoice = {
  promptKey: 'ui.interactionChooseOne',
  options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
  playerIndex: 0,
  spaceId: 'test-space',
}

const baseInput = (): InteractionBarPresentationInput => ({
  locale: 'en',
  playerNames: ['P1', 'P2'],
  isInteractive: true,
  pending: {
    animalReorg: null,
    choice: null,
    engineBlocked: null,
    nextPlayerIndex: null,
    playerSwitch: null,
    harvestFeedPlayerName: null,
    heating: null,
    resourceQuantitySelect: null,
    resourceBatchExchangeSelect: null,
    suppressChoiceOptions: false,
  },
  farm: {
    pendingRoomTilesLength: 0,
    maxRoomSelections: 0,
    pendingFenceEdgesLength: 0,
    pendingStableTilesLength: 0,
    maxStableSelections: 0,
    pendingFarmHandSelected: false,
    pendingSowSelectionsLength: 0,
    pendingPositionSelectionsLength: 0,
    maxPositionSelections: 0,
    hasPendingPlowSelection: false,
    errors: {
      fence: '',
      room: '',
      stable: '',
      plow: '',
      sow: '',
    },
    selecting: {
      fences: false,
      rooms: false,
      stables: false,
      plow: false,
      sow: false,
    },
    fence: {
      canBuildPalisades: false,
      placementMode: 'fence',
    },
  },
  animalReorg: {
    state: null,
    remaining: null,
    hasOverflow: false,
  },
  controls: {
    canUndoStep: false,
    canUndoAction: false,
    historyLength: 0,
    hasActionStartSnapshot: false,
    anytimeActions: [],
  },
})

const baseActions = (): InteractionBarActions => buildInteractionBarActions({
  resolveChoice: noop,
  confirmNextPlayer: noop,
  confirmPlayerSwitch: noop,
  confirmHarvestFeed: noop,
  confirmHeating: noop,
  undoStep: noop,
  undoAction: noop,
  showScoring: noop,
  takeAnytimeAction: noop,
  confirmAnimalReorg: noop,
  cancelAnimalDiscardPrompt: noop,
})

const buildBar = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => {
  const input = baseInput()
  configure?.(input)
  return (
    <InteractionBar
      model={buildInteractionBarModel(input)}
      actions={{ ...baseActions(), ...actionOverrides }}
    />
  )
}

const renderBar = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => render(buildBar(configure, actionOverrides))

const renderBarHtml = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => renderToStaticMarkup(buildBar(configure, actionOverrides))

describe('InteractionBar', () => {
  it.each(['zh', 'en'] as const)('renders real Peat Sled choices with fuel and distinct rounds in %s', (locale) => {
    const session = new GameSession(409, undefined, { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    session.state.round = 4
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.wood = 20
      player.farmTerrain = []
    }
    session.state.players[0]!.minorHand.push('M079_PeatSled')
    let response = session.takeAction(0, 'meeting-place')
    for (let step = 0; step < 8 && !response.state.players[0]!.minorPlayed.includes('M079_PeatSled'); step += 1) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected purchase interaction')
      const options = response.interaction.request.options ?? []
      const option = options.find((candidate) => candidate.value === 'M079_PeatSled')
        ?? options.find((candidate) => candidate.value.startsWith('action-improvement-'))
        ?? (response.interaction.promptKey === 'prompt.selectPayment' ? options[0] : undefined)
      if (!option) throw new Error('Expected card purchase option')
      response = session.resolveChoice(0, option.value)
    }
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Peat Sled options')
    const html = renderBarHtml((input) => {
      input.locale = locale
      input.pending.choice = {
        ...pendingChoice,
        promptKey: response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined,
        options: response.interaction.stateId === 'wait' ? response.interaction.request.options! : [],
      }
    })
    expect(html).toContain('data-resource="fuel"')
    expect(html).toContain('data-amount="6"')
    expect(html).toContain(locale === 'en' ? 'Round 6:' : '第 6 回合：')
    expect(html).toContain(locale === 'en' ? 'Round 14:' : '第 14 回合：')
    expect(html).not.toContain(locale === 'en' ? 'Future Resources' : '未来资源')
  })
  it.each(['zh', 'en'] as const)('renders real payment outcomes, target names, action spaces and source scores in %s', (locale) => {
    const make = (card: string, moor = false) => {
      const session = new GameSession(409, undefined, { playerCount: 4, enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor })
      session.state.round = 5
      for (const player of session.state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources = { ...player.resources, food: 20, wood: 20, clay: 20, reed: 20, stone: 20, grain: 1, fuel: 20 }
        player.farmTerrain = []
      }
      session.state.players[0]!.minorHand.push(card)
      return session
    }
    const options = (response: SessionResponse) => {
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected real choice')
      return response.interaction.request.options
    }
    const html = (response: SessionResponse) => renderBarHtml((input) => {
      input.locale = locale
      input.pending.choice = { ...pendingChoice, options: options(response) }
    })
    const pay = (session: GameSession, card: string) => {
      let response = session.takeAction(0, 'meeting-place')
      for (let i = 0; i < 8; i += 1) {
        if (response.state.players[0]!.minorPlayed.includes(card)) return response
        if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') return response
        const choice = options(response).find((option) => option.value === card || option.value.startsWith('action-improvement-'))
        if (!choice) throw new Error('Missing purchase choice')
        response = session.resolveChoice(0, choice.value)
      }
      throw new Error('Missing payment')
    }
    const depot = make('B065_GrainDepot')
    const depotHtml = html(pay(depot, 'B065_GrainDepot'))
    expect(depotHtml).toContain('data-resource="grain"')
    expect(depotHtml).toContain(locale === 'en' ? 'Rounds 6–9' : '第 6–9 回合')
    const sack = make('C040_CanvasSack')
    const sackHtml = html(pay(sack, 'C040_CanvasSack'))
    expect(sackHtml).toContain('data-resource="vegetable"')
    expect(sackHtml).toContain('data-amount="4"')
    const stall = make('M131_CattleStall', true)
    const stallHtml = html(pay(stall, 'M131_CattleStall'))
    expect(stallHtml).toContain(locale === 'en' ? 'Optional purchase' : '可选择购买')
    expect(stallHtml).toContain(locale === 'en' ? 'Round 7:' : '第 7 回合：')
    for (const resource of ['sheep', 'boar', 'cattle', 'horse', 'food']) expect(stallHtml).toContain(`data-resource="${resource}"`)
    const trader = make('D114_SeedTrader')
    trader.state.players[0]!.occupationPlayed = ['D114_SeedTrader']
    trader.state.players[0]!.cardStates.D114_SeedTrader = { counters: { grain: 2, vegetable: 2 } }
    expect(trader.takeAction(0, 'farmland').ok).toBe(true)
    const movementHtml = html(trader.takeAnytimeAction(0, 'D114-seed-trader-anytime'))
    expect(movementHtml).toContain(locale === 'en' ? 'Take from' : '从')
    expect(movementHtml).toContain(locale === 'en' ? 'Seed Trader' : '种子商人')
    expect(movementHtml).toContain('data-resource="grain"')
    expect(movementHtml).toContain('data-resource="vegetable"')
    const artist = make('B152_JuniorArtist')
    artist.state.players[0]!.occupationPlayed = ['B152_JuniorArtist']
    artist.state.players[0]!.occupationHand = ['A116_WoodCutter']
    const triggered = artist.takeAction(0, 'day-laborer')
    const artistHtml = html(artist.resolveChoice(0, options(triggered).find((option) => option.value !== '__skip__')!.value))
    expect(artistHtml).toContain(locale === 'en' ? 'Traveling Players' : '流浪艺人')
    expect(artistHtml).toContain('interaction-option-subtitle')
    expect(artistHtml).not.toContain('Place Farmer')
    const illusionist = make('B146_Illusionist')
    illusionist.state.players[0]!.occupationPlayed = ['B146_Illusionist']
    illusionist.state.players[0]!.minorHand = ['A019_Handplow']
    illusionist.state.players[0]!.occupationHand = ['A116_WoodCutter']
    const trigger = illusionist.takeAction(0, 'forest')
    const handHtml = html(illusionist.resolveChoice(0, options(trigger).find((option) => option.value !== '__skip__')!.value))
    expect(handHtml).toContain(locale === 'en' ? 'Handplow' : '手犁')
    expect(handHtml).toContain(locale === 'en' ? 'Wood Cutter' : '樵夫')
    expect(handHtml).not.toContain('minorImprovements.')
    const rod = make('E038_RodCollection')
    rod.state.players[0]!.minorPlayed = ['E038_RodCollection']
    rod.state.players[0]!.occupationPlayed = ['__a__', '__b__', '__c__']
    const scoreHtml = html(rod.takeAction(0, 'fishing'))
    expect(scoreHtml).toContain(locale === 'en' ? 'contribution: +1 points' : '计分变化：+1 分')
    expect(scoreHtml).not.toContain('Increment Extra Data')
  })
  it.each(['zh', 'en'] as const)('describes the executable room grant as conditional addition in %s', (locale) => {
    const html = renderBarHtml((input) => {
      input.locale = locale
      input.pending.choice = { ...pendingChoice, options: [{ value: 'room', labelKey: 'actions.future-meeples.name', effectPreview: describeFutureSchedule(1, {
        cardId: 'B014_Hawktower', playerId: 'p1', entries: [{ round: 12, roomType: 'stone' }],
      }) }] }
    })
    expect(html).toContain(locale === 'en' ? 'Add 1 Stone room if your house is Stone' : '若为石料屋，增加 1 间石料房间')
    expect(html).not.toContain('Convert house')
  })
  const configureMultiSelect = (input: InteractionBarPresentationInput, maxSelections = 2) => {
    input.pending.choice = {
      ...pendingChoice,
      sourceCard: 'E148_Lazybones',
      multiSelect: { valuePrefix: 'lazybones:', minSelections: 0, maxSelections },
      options: ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion'].map((value) => ({
        value, labelKey: `actions.${value}.name`,
      })),
    }
  }

  it('renders four bounded choice tiles, allows deselection, and submits one subset', () => {
    const resolveChoice = vi.fn()
    renderBar((input) => configureMultiSelect(input), { resolveChoice })
    const choices = screen.getAllByRole('checkbox')
    expect(choices).toHaveLength(4)
    fireEvent.click(choices[0]!)
    fireEvent.click(choices[1]!)
    expect(choices[2]).toBeDisabled()
    expect(choices[3]).toBeDisabled()
    expect(choices[0]).toBeEnabled()
    fireEvent.click(choices[0]!)
    expect(choices[2]).toBeEnabled()
    fireEvent.click(choices[2]!)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm (2/2)' }))
    expect(resolveChoice).toHaveBeenCalledExactlyOnceWith('lazybones:farmland,day-laborer')
  })

  it('permits an empty subset and keeps spectators read-only', () => {
    const resolveChoice = vi.fn()
    const bar = renderBar((input) => configureMultiSelect(input), { resolveChoice })
    fireEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
    expect(resolveChoice).toHaveBeenCalledExactlyOnceWith('lazybones:')
    bar.unmount()
    renderBar((input) => {
      configureMultiSelect(input)
      input.isInteractive = false
    })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Confirm (0/2)' })).not.toBeInTheDocument()
    expect(screen.getByText('Waiting')).toBeInTheDocument()
  })

  it('clears the local subset when the authoritative maximum changes', () => {
    const resolveChoice = vi.fn()
    const bar = renderBar((input) => configureMultiSelect(input, 4), { resolveChoice })
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    bar.rerender(buildBar((input) => configureMultiSelect(input, 1), { resolveChoice }))
    expect(screen.getByRole('button', { name: 'Confirm (0/1)' })).toBeEnabled()
    for (const choice of screen.getAllByRole('checkbox')) expect(choice).not.toBeChecked()
    fireEvent.click(screen.getAllByRole('checkbox')[2]!)
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm (1/1)' }))
    expect(resolveChoice).toHaveBeenCalledExactlyOnceWith('lazybones:day-laborer')
  })

  it.each(['zh', 'en'] as const)('resolves card references in the %s trigger prompt and anytime button', (locale) => {
    const html = renderBarHtml((input) => {
      input.locale = locale
      input.pending.choice = {
        ...pendingChoice,
        promptKey: 'ui.interactionHammerCrusherBuild',
        sourceCard: 'D014_HammerCrusher',
      }
      input.controls.anytimeActions = [{ id: 'mandoline', labelKey: 'cards.C046_Mandoline.anytime' }]
    })
    expect(html).toContain(locale === 'zh' ? '锤碎机：建造房间？' : 'Hammer Crusher: Build rooms?')
    expect(html).toContain(locale === 'zh' ? '多功能切菜器' : 'Mandoline')
    expect(html).not.toContain('碎锤')
    expect(html).not.toContain('{card:')
  })

  it.each(['PS01', 'PS03', 'PS04'])('localizes the offered %s father tier and preserves its choice value', (fatherId) => {
    const card = getParentCardDefinition(fatherId)
    if (card?.kind !== 'father') throw new Error('expected a father card')
    const reward = card.rewards[1]
    const value = fatherId === 'PS04' ? `${fatherId}:2:wood,clay` : `${fatherId}:2`
    const labelParams = { tier: 2, requirement: reward.requirementText, reward: reward.rewardText }
    const resolveChoice = vi.fn()
    const { container } = renderBar((input) => {
      input.locale = 'zh'
      input.pending.choice = {
        ...pendingChoice,
        promptKey: 'ui.cards.parentFatherComplete.prompt',
        options: [{
          value,
          sourceCard: fatherId,
          labelKey: 'ui.cards.parentFatherComplete.tier',
          labelParams,
          ...(fatherId === 'PS03' ? {} : {
            descriptionPreview: {
              kind: 'action',
              labelKey: 'ui.cards.parentFatherComplete.tier',
              labelParams,
              effectPreview: {
                kind: 'resourceExchange',
                resourcesGained: fatherId === 'PS04' ? { wood: 1, clay: 1 } : { stone: 2 },
              },
            },
          }),
        }],
      }
    }, { resolveChoice })
    const button = screen.getByRole('button', { name: /第 2 档/ })
    const expected = {
      PS01: '至少 3 块田 -> 获得 2 石料',
      PS03: '至少 2 种动物 -> 抽取 3 张职业卡，保留 1 张',
      PS04: '至少 4 只同类动物 -> 自选 2 种不同建材，各获得 1 份',
    }[fatherId]
    expect(button).toHaveTextContent(expected!)
    expect(button.textContent).not.toMatch(/fields|animals|immediately|occupation/)
    if (fatherId === 'PS04') {
      expect(container.querySelector('[data-resource="wood"]')).toBeInTheDocument()
      expect(container.querySelector('[data-resource="clay"]')).toBeInTheDocument()
    }
    fireEvent.click(button)
    expect(resolveChoice).toHaveBeenCalledWith(value)
  })
  it('confirms heating with selected fuel and wood conversion', () => {
    const confirmHeating = vi.fn()
    renderBar((input) => {
      input.pending.heating = {
        playerName: 'P1',
        required: 2,
        maxFuelPayable: 1,
        maxWoodConvertibleToFuel: 1,
      }
    }, { confirmHeating })

    fireEvent.change(screen.getByLabelText('Wood to convert'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Fuel to pay'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm heating' }))

    expect(confirmHeating).toHaveBeenCalledWith({ woodToFuel: 1, fuelUsed: 2 })
  })

  it('disables rejected specialized confirmations', () => {
    const heating = renderBar((input) => {
      input.pending.heating = {
        playerName: 'P1',
        required: 1,
        maxFuelPayable: 1,
        maxWoodConvertibleToFuel: 0,
        isConfirmDisabled: () => true,
      }
    })
    expect(screen.getByRole('button', { name: 'Confirm heating' })).toBeDisabled()
    heating.unmount()

    const reorg = renderBar((input) => {
      input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
      input.animalReorg.confirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    reorg.unmount()

    const feed = renderBar((input) => {
      input.pending.harvestFeedPlayerName = 'P1'
      input.pending.harvestFeedConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    feed.unmount()

    const playerSwitch = renderBar((input) => {
      input.pending.playerSwitch = { fromPlayerIndex: 0, toPlayerIndex: 1 }
      input.pending.playerSwitchConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeDisabled()
    playerSwitch.unmount()

    renderBar((input) => {
      input.pending.nextPlayerIndex = 1
      input.pending.nextPlayerConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeDisabled()
  })

  it('renders animal reorg model data and invokes confirm', () => {
    const confirmAnimalReorg = vi.fn()
    renderBar((input) => {
      input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
      input.animalReorg.remaining = { sheep: 1, boar: 0, cattle: 0, horse: 0 }
    }, { confirmAnimalReorg })

    expect(screen.getByText('Reorganize Animals')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmAnimalReorg).toHaveBeenCalledTimes(1)
  })

  it('renders resource quantity selection and invokes cancel', () => {
    const onCancel = vi.fn()
    renderBar((input) => {
      input.pending.resourceQuantitySelect = {
        availableByResource: { sheep: 2, boar: 1 },
        onConfirm: noop,
        onCancel,
      }
    })

    expect(screen.getByText('Select quantity')).toBeTruthy()
    expect(screen.getByText('Sheep (max 2)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders resource batch exchange selection and invokes cancel', () => {
    const onCancel = vi.fn()
    renderBar((input) => {
      input.pending.resourceBatchExchangeSelect = {
        discardAvailableByResource: { wood: 2, clay: 1 },
        receiveResources: ['wood', 'clay', 'reed', 'stone'],
        maxTotal: 4,
        onConfirm: noop,
        onCancel,
      }
    })

    expect(screen.getByText('Exchange building resources')).toBeTruthy()
    expect(screen.getByText('Discard Wood (max 2)')).toBeTruthy()
    expect(screen.getByText('Receive Stone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders top controls and anytime actions and invokes their handlers', () => {
    const undoStep = vi.fn()
    const undoAction = vi.fn()
    const showScoring = vi.fn()
    const takeAnytimeAction = vi.fn()
    renderBar((input) => {
      input.pending.choice = pendingChoice
      input.controls.historyLength = 2
      input.controls.canUndoStep = true
      input.controls.hasActionStartSnapshot = true
      input.controls.canUndoAction = true
      input.controls.anytimeActions = anytimeActions
    }, {
      undoStep,
      undoAction,
      showScoring,
      takeAnytimeAction,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Undo Step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo Action' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scoring Pad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))

    expect(undoStep).toHaveBeenCalledTimes(1)
    expect(undoAction).toHaveBeenCalledTimes(1)
    expect(showScoring).toHaveBeenCalledTimes(1)
    expect(takeAnytimeAction).toHaveBeenCalledWith('anytime-test')
  })

  it('renders choice model data and invokes selected action', () => {
    const resolveChoice = vi.fn()
    renderBar((input) => {
      input.pending.choice = {
        ...pendingChoice,
        sourceCard: 'D117_WoodExpert',
      }
    }, { resolveChoice })

    expect(screen.getByText('Please choose an option')).toBeTruthy()
    expect(screen.getByText(/Triggered by/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(resolveChoice).toHaveBeenCalledWith('confirm')
  })

  it('renders payment preview details from choice options', () => {
    const html = renderBarHtml((input) => {
      input.pending.choice = {
        promptKey: 'prompt.selectPayment',
        options: [
          {
            value: 'pay:test:0',
            labelKey: 'prompt.selectPaymentOption',
            labelParams: {
              resourcesPaid: { wood: 2 },
              cardUsed: 'Major_ClayOven',
            },
            effectPreview: {
              kind: 'payment',
              resourcesPaid: { wood: 2 },
              cardUsed: 'Major_ClayOven',
              sourceCards: ['D117_WoodExpert'],
            },
          },
        ],
        playerIndex: 0,
        spaceId: 'major-improvement',
      }
    })

    expect(html).toContain('Pay Resources')
    expect(html).toContain('data-resource="wood"')
    expect(html).toContain('Return')
    expect(html).toContain('Clay Oven')
    expect(html).toContain('via')
  })

  it('localizes seasonal sources in the choice subtitle and payment preview', () => {
    const html = renderBarHtml((input) => {
      input.locale = 'zh'
      input.pending.choice = {
        ...pendingChoice,
        sourceCard: 'through-the-seasons:spring',
        options: [{
          value: 'payment', labelKey: 'prompt.selectPaymentOption',
          effectPreview: {
            kind: 'payment', resourcesPaid: { wood: 1 },
            sourceCards: ['through-the-seasons:autumn'],
          },
        }],
      }
    })
    expect(html).toContain('由 春季 触发')
    expect(html).toContain('秋季')
    expect(html).not.toContain('through-the-seasons:')
  })

  it('renders waiting state while keeping scoring available', () => {
    const showScoring = vi.fn()
    renderBar((input) => {
      input.isInteractive = false
    }, { showScoring })

    expect(screen.getByText('Waiting')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scoring Pad' }))
    expect(showScoring).toHaveBeenCalledTimes(1)
  })
})
