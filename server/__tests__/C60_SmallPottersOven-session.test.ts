import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D106_WhiskyDistiller'
import '../../shared/cards/C/C060_SmallPottersOven'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/__stubs__/STUB_BeforeBakeGainClay'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

const setupBakeViaC60 = (
  grain: number,
  overrides: {
    extraPlayedCards?: string[]
    improvements?: string[]
    clay?: number
    stone?: number
  } = {},
) => {
  const session = new GameSession(6060, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundActionOrder = ['grain-utilization', ...state.roundActionOrder.filter((id) => id !== 'grain-utilization')]
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('C060_SmallPottersOven', ...(overrides.extraPlayedCards ?? []))
  player.resources = {
    ...player.resources,
    grain,
    clay: overrides.clay ?? 3,
    stone: overrides.stone ?? 1,
    food: 0,
  }
  player.fields = []
  player.improvements = overrides.improvements ?? []
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.availableMajorImprovements = ['Major_ClayOven']

  session.loadState(state)
  return session
}

describe('C060_SmallPottersOven server session', () => {
  it('returns the only oven from onBuy and logs separate cardEffectGain on play', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C060_SmallPottersOven']
    player.improvements = ['Major_ClayOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.request.options?.find(
      (option) => option.value === 'C060_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C060_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)

    const playLog = resp.state.log.find(
      (entry) => entry.key === 'log.playMinorImprovement',
    )
    expect(playLog?.params?.improvements).toBe('C060_SmallPottersOven')
    expect(playLog?.params?.returnedCards).toBeUndefined()
    expect(playLog?.params?.costResources).toEqual({ clay: 2 })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C060_SmallPottersOven',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 5 })
  })

  it('asks which oven to return from onBuy when both ovens are owned', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C060_SmallPottersOven']
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.request.options?.find(
      (option) => option.value === 'C060_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenReturn')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toEqual([
      'improvements.Major_ClayOven.name',
      'improvements.Major_StoneOven.name',
    ])

    const returnStone = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'improvements.Major_StoneOven.name',
    )
    expect(returnStone).toBeDefined()

    resp = session.resolveChoice(0, returnStone!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C060_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_StoneOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_StoneOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
  })

  it.each([{ clay: 3, stone: 1 }, { clay: 4, stone: 4 }])('blocks a completed oven purchase with no grain and restores it through undoAction: %j', (resources) => {
    const session = setupBakeViaC60(0, resources)
    const initial = JSON.parse(JSON.stringify(session.state))
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)
    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')
    const build = resp.interaction.request.options!.find((option) => option.value !== '__skip__')!
    resp = session.resolveChoice(0, build.value)
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources).toMatchObject({ clay: resources.clay - 3, stone: resources.stone - 1, grain: 0 })
    resp = session.undoAction(0)
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toEqual(initial.players[0].resources)
    expect(resp.state.players[0]!.improvements).toEqual(initial.players[0].improvements)
    expect(resp.state.availableMajorImprovements).toEqual(initial.availableMajorImprovements)
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
  })

  it('blocks after a C60 build when grain disappears and undoStep restores the purchase choice', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D106_WhiskyDistiller'],
    })
    session.getState().state.players[0]!.resources.grain = 5

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp.state.players[0]!.resources.grain = 0
    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    resp = session.undoStep(0)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 0, clay: 3, stone: 1, food: 0 })
  })

  it('builds the C60 oven source before non-empty bake when it is the only bake source', () => {
    const session = setupBakeViaC60(1)

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    const bakeLog = resp.state.log.find((entry) => entry.key === 'log.bakeBread')
    expect(bakeLog?.params).toMatchObject({
      sourceActionId: 'grain-utilization',
    })
  })

  it('keeps C60 optional when D66 can unlock bake without buying an oven', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D066_PotterCeramics'],
      improvements: ['Major_Fireplace1'],
      clay: 6,
    })

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(6)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    if (resp.interaction.promptKey === 'ui.interactionSmallPottersOvenBuild') {
      resp = session.resolveChoice(0, '__skip__')
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
    }

    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)
  })

  it('allows C60 to create the oven source before D66 creates grain', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D066_PotterCeramics'],
      clay: 6,
    })

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D066_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === 'D066_PotterCeramics') {
      const d66Option = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(d66Option).toBeDefined()
      resp = session.resolveChoice(0, d66Option!.value)
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('allows C60 plus STUB plus D66 to build oven, gain clay, gain grain, then bake', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['STUB_BeforeBakeGainClay', 'D066_PotterCeramics'],
      clay: 3,
    })

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).toBe(true)
    expect(resp.interaction.request.options?.find((option) => option.value === 'STUB_BeforeBakeGainClay')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'STUB_BeforeBakeGainClay')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D066_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === 'D066_PotterCeramics') {
      const d66Option = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(d66Option).toBeDefined()
      resp = session.resolveChoice(0, d66Option!.value)
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
  })
})

describe('ae-negative-39-native', () => {
  const sessions: GameSession[] = [];
  let pause: ((r: SessionResponse) => boolean) | undefined;
  const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/39/oa-probes';
  const traces: unknown[] = [];
  const order = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
  const prerequisites: Record<string, number> = { D064_BakingCourse: 1, E062_SourDough: 3 };
  function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)); }
  function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ commands: traces, value }, null, 2)); }
  function make(card: string, configure: (st: GameState) => void = () => { }, played = true, round = 5) {
      const s = createWorkSession({ seed: 4239, options: { playerCount: 2 }, configure(st) {
              st.round = round;
              st.roundActionOrder = [...order];
              for (const [p, i] of st.players.map((p, i): [
                  PlayerState,
                  number
              ] => [p, i])) {
                  p.occupationHand = i === 0 ? ['A125_Priest', 'A102_Grocer'] : ['A116_WoodCutter', 'A123_FrameBuilder'];
                  p.minorHand = i === 0 ? ['B004_WoodPile', 'A006_StorageBarn'] : ['__test_placeholder__'];
                  p.occupationPlayed = [];
                  p.minorPlayed = [];
                  p.improvements = [];
                  p.cardStates = {};
                  Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
              }
              const p = st.players[0]!;
              if (played) {
                  p.minorPlayed = [card];
                  occupations(p, prerequisites[card] ?? 0);
              }
              else
                  p.minorHand.unshift(card);
              configure(st);
              for (const owner of st.players)
                  for (const id of [...owner.minorHand, ...owner.minorPlayed, ...owner.occupationHand, ...owner.occupationPlayed])
                      if (id !== '__test_placeholder__')
                          { const path=new URL(`../../shared/cards/${id[0]}/${id}.ts`, import.meta.url);assert.ok(fs.existsSync(path), `Unknown fixture card ${id}`);const min=/players:\s*['"](\d+)\+/.exec(fs.readFileSync(path,'utf8'));if(min)assert.ok(Number(min[1])<=2,`Fixture card ${id} exceeds 2p`);}
              if (!played)
                  assert.ok(p.minorHand.includes(card));
          } });
      sessions.push(s);
      return s;
  }
  function take(s: GameSession, a: number, space: string) { const n = order.indexOf(space) + 1; assert.ok(!n || n <= s.state.round); traces.push({ command: 'takeAction', actor: a, space, round: s.state.round }); return ok(s.takeAction(a, space)); }
  function choose(s: GameSession, a: number, value: string, payload?: Parameters<GameSession['resolveChoice']>[2]) { traces.push({ command: 'resolveChoice', actor: a, value, payload }); return ok(s.resolveChoice(a, value, payload)); }
  function select(s: GameSession, a: number, payload: Parameters<GameSession['commitSelectionChoice']>[1]) { traces.push({ command: 'commitSelectionChoice', actor: a, payload }); return ok(s.commitSelectionChoice(a, payload)); }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }
  function finish(s: GameSession, first: SessionResponse, accept = true, markers: string[] = [], forbidden?: string) {
      let r = ok(first);
      for (let n = 0; n < 120 && r.interaction.stateId === 'wait'; n++) {
          if (forbidden)
              assert.equal(JSON.stringify(r.interaction).includes(forbidden), false, JSON.stringify(r.interaction));
          
          if (pause?.(r))
              return r;
          r = passPreparationExchanges(s, r);
          const i = r.interaction;
          if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player')
              return ok(r);
          const q = i.request;
          if (q.kind === 'confirm-player-switch')
              r = choose(s, q.fromPlayerIndex, 'confirm');
          else if (q.kind === 'choice' || q.kind === 'select-trigger') {
              const active = q.options.filter(o => !('disabled' in o && o.disabled)), preferred = markers.flatMap(m => active.filter(o => JSON.stringify(o).includes(m))).find(o => !['__pass__', '__skip__', '__done__'].includes(o.value));
              const picked = (markers.includes('skipOvenBake') && ['Major_ClayOven', 'Major_StoneOven'].includes(i.sourceCard ?? '') && i.promptKey === 'ui.interactionOptionalAction' ? active.find(o => o.value === '__skip__') : undefined) ?? (accept ? preferred ?? active.find(o => !['__pass__', '__skip__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? active.find(o => ['__pass__', '__skip__', '__done__'].includes(o.value)) ?? active[0];
              assert.ok(picked, JSON.stringify(i));
              r = choose(s, i.playerIndex, picked.value);
          }
          else if (q.kind === 'farm-select' && q.farm.farmType === 'plow')
              r = select(s, i.playerIndex, { tile: q.farm.selectableTiles[0]! });
          else if (q.kind === 'selection' && q.selection.kind === 'farm-position')
              r = select(s, i.playerIndex, { positions: [q.selection.selectablePositions[0]!] });
          else if (q.kind === 'animal-reorg')
              r = choose(s, i.playerIndex, 'confirm', { zones: q.zones });
          else if (q.kind === 'feed')
              r = choose(s, i.playerIndex, 'confirm', { selections: [] });
          else
              assert.fail(JSON.stringify(i));
      }
      assert.notEqual(r.interaction.stateId, 'wait');
      return ok(r);
  }
  function ready(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) {
      let r = s.getState();
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
          traces.push({ command: 'resolveChoice', actor: r.interaction.request.nextPlayerIndex, value: 'confirm' });
          r = confirmNext(s, r);
      }
      return finish(s, r, accept, markers, forbidden);
  }
  function fill(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) {
      const r = ready(s, accept, markers, forbidden);
      if (r.state.gameOver || r.interaction.stateId === 'wait')
          return r;
      const a = r.state.currentPlayerIndex, av = s.getActionAvailability(a), space = ['clay-pit', 'reed-bank', 'forest', 'fishing', 'grain-seeds', 'day-laborer'].find(id => av[id]);
      assert.ok(space, JSON.stringify(av));
      return finish(s, take(s, a, space), accept, markers, forbidden);
  }
  function final(s: GameSession) {
      for (let n = 0; n < 25; n++) {
          if (s.state.gameOver)
              return ok(s.getState());
          fill(s);
      }
      assert.fail('Actual final not reached');
  }
  function minor(s: GameSession, a = 0) {
      let r = take(s, a, 'meeting-place');
      for (let n = 0; n < 10; n++) {
          assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction));
          if (opts(r).some(o => o.value === 'B004_WoodPile' || o.value === 'A006_StorageBarn' || o.value.startsWith('Major_')))
              return r;
          const o = opts(r).find(o => o.value.startsWith('action-improvement-'));
          assert.ok(o);
          r = choose(s, a, o.value);
      }
      assert.fail('Minor menu not reached');
  }
  function purchase(s: GameSession, id: string, markers: string[] = []) { const p = minor(s), o = opts(p).find(o => o.value === id || o.value === `minor:${id}`); assert.ok(o, JSON.stringify(p.interaction)); return finish(s, choose(s, 0, o.value), true, markers); }
  function rejectBuy(s: GameSession, id: string) { const p = minor(s); assert.equal(opts(p).some(o => (o.value === id || o.value === `minor:${id}`) && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, id)), r = finish(s, choose(s, 0, 'B004_WoodPile')); assert.ok(r.state.players[0]!.minorHand.includes(id)); return { p, bad, r }; }
  function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) {
      for (const [k, v] of Object.entries(expected))
          assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k);
  }
  function points(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function bakeMenu(s: GameSession, a = 0) { pause = r => r.interaction.stateId === 'wait' && (['ui.interactionBakeBreadChoice', 'ui.interactionBakeBreadCount'].includes(r.interaction.promptKey ?? '') || (r.interaction.sourceCard === 'C061_BeerStein' && r.interaction.promptKey === 'ui.interactionOptionalAction')); const r = finish(s, take(s, a, 'grain-utilization'), true, ['skipOvenBake']); pause = undefined; return r; }
  function bake(s: GameSession, provider = 'Major_Fireplace1', n = 1, a = 0, accept = true, forbidden?: string) { const p = bakeMenu(s, a); if (forbidden)
      assert.equal(JSON.stringify(p.interaction).includes(forbidden), false); if (p.interaction.stateId === 'wait' && ['ui.interactionBakeBreadChoice', 'ui.interactionBakeBreadCount'].includes(p.interaction.promptKey ?? ''))
      return finish(s, choose(s, a, `bulk:${provider}=${n}`), accept, [], forbidden); assert.equal(n, 1, 'automatic single-grain bake only'); return finish(s, p, accept, [], forbidden); }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("C060 N1 real oven return purchase grants five food and before-bake builds a normal oven", () => { const s = make('C060_SmallPottersOven', st => { ownMajor(st, 'Major_ClayOven'); Object.assign(st.players[0]!.resources, { clay: 5, stone: 1, grain: 1 }); }, false), b = purchase(s, 'C060_SmallPottersOven'); resource(b, { food: 105, clay: 3 }); assert.ok(!b.state.players[0]!.improvements.includes('Major_ClayOven')); assert.ok(b.state.availableMajorImprovements.includes('Major_ClayOven')); fill(s); ready(s); const r = bake(s, 'Major_ClayOven'); resource(r, { food: 110, grain: 0, clay: 0, stone: 0 }); assert.ok(r.state.players[0]!.improvements.includes('Major_ClayOven')); save('C060-N1', { b, r }); });
  it("C060 N2 missing return oven missing clay held card and foreign bake cannot build or gain", () => { for (const mode of ['oven', 'clay']) {
      const s = make('C060_SmallPottersOven', st => { st.players[0]!.resources.clay = mode === 'clay' ? 1 : 2; if (mode === 'clay')
          ownMajor(st, 'Major_ClayOven'); }, false);
      save(`C060-N2-${mode}`, rejectBuy(s, 'C060_SmallPottersOven'));
  } for (const mode of ['hand', 'opponent']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('C060_SmallPottersOven', st => { st.currentPlayerIndex = a; ownMajor(st, a ? 'Major_Fireplace2' : 'Major_Fireplace1', a); Object.assign(st.players[a]!.resources, { grain: 1, clay: 3, stone: 1 });if(a===1)Object.assign(st.players[0]!.resources,{grain:1,clay:3,stone:1}); }, mode !== 'hand'), r = bake(s, a ? 'Major_Fireplace2' : 'Major_Fireplace1', 1, a, true, 'C060_SmallPottersOven');
      resource(r, { food: 102, grain: 0 }, a);if(a===1)resource(r,{food:100,grain:1,clay:3,stone:1});
      assert.ok(!r.state.players[a]!.improvements.includes('Major_ClayOven'));
      save(`C060-N2-${mode}`, r);
  } });
  it("C060 N3 both return choices preserve finite ownership and printed five points", () => { for (const target of ['Major_ClayOven', 'Major_StoneOven']) {
      const s = make('C060_SmallPottersOven', st => { ownMajor(st, 'Major_ClayOven'); ownMajor(st, 'Major_StoneOven'); st.players[0]!.resources.clay = 2; }, false), r = purchase(s, 'C060_SmallPottersOven', [target]);
      resource(r, { food: 105, clay: 0 });
      assert.ok(r.state.availableMajorImprovements.includes(target));
      assert.equal(r.state.players[0]!.improvements.length, 1);
      save(`C060-N3-${target}`, r);
  } const s = make('C060_SmallPottersOven', st => { ownMajor(st, 'Major_ClayOven'); st.players[0]!.resources.clay = 2; }, false, 14), b = purchase(s, 'C060_SmallPottersOven'), r = final(s); assert.equal(points(r, 'C060_SmallPottersOven'), 5); save('C060-N3-score', { b, r }); });
})
