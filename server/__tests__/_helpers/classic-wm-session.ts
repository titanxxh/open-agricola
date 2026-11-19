import { ensureCardModifiers } from '../../../shared/cards/card-modifiers'
import { afterEach, expect } from 'vitest'
import type { CardSource } from '../../../shared/cards/card-source'
import { markAllWorkersUsed } from '../../../shared/domain/player'
import type { GameState, Resource } from '../../../shared/contract/types'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { createWorkSession } from './session-fixtures'
import { sessionOptions } from './card-regression-session'
import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import type { CustomCardData } from '../../../shared/cards/session-card-context'

import { CWM001_Amazon } from '../../../shared/cards/classic/CWM/CWM001_Amazon'
import { CWM002_AnimalBuyer } from '../../../shared/cards/classic/CWM/CWM002_AnimalBuyer'
import { CWM003_ApplePicker } from '../../../shared/cards/classic/CWM/CWM003_ApplePicker'
import { CWM004_BargainingBakerr } from '../../../shared/cards/classic/CWM/CWM004_BargainingBakerr'
import { CWM005_BeeKeeper } from '../../../shared/cards/classic/CWM/CWM005_BeeKeeper'
import { CWM006_Borrower } from '../../../shared/cards/classic/CWM/CWM006_Borrower'
import { CWM007_BranchCollector } from '../../../shared/cards/classic/CWM/CWM007_BranchCollector'
import { CWM008_BreadCarrier } from '../../../shared/cards/classic/CWM/CWM008_BreadCarrier'
import { CWM009_Chemist } from '../../../shared/cards/classic/CWM/CWM009_Chemist'
import { CWM010_CloisterDweller } from '../../../shared/cards/classic/CWM/CWM010_CloisterDweller'
import { CWM011_Contractor } from '../../../shared/cards/classic/CWM/CWM011_Contractor'
import { CWM012_CovetousFarmer } from '../../../shared/cards/classic/CWM/CWM012_CovetousFarmer'
import { CWM013_Cowboy } from '../../../shared/cards/classic/CWM/CWM013_Cowboy'
import { CWM014_CropRotator } from '../../../shared/cards/classic/CWM/CWM014_CropRotator'
import { CWM015_DebrisDealer } from '../../../shared/cards/classic/CWM/CWM015_DebrisDealer'
import { CWM016_Diplomat } from '../../../shared/cards/classic/CWM/CWM016_Diplomat'
import { CWM017_Engineer } from '../../../shared/cards/classic/CWM/CWM017_Engineer'
import { CWM018_ExpertBuilder } from '../../../shared/cards/classic/CWM/CWM018_ExpertBuilder'
import { CWM019_FamilyPlanner } from '../../../shared/cards/classic/CWM/CWM019_FamilyPlanner'
import { CWM020_FarmSchoolGraduate } from '../../../shared/cards/classic/CWM/CWM020_FarmSchoolGraduate'
import { CWM021_FenceDealer } from '../../../shared/cards/classic/CWM/CWM021_FenceDealer'
import { CWM022_FoodConnoisseur } from '../../../shared/cards/classic/CWM/CWM022_FoodConnoisseur'
import { CWM023_ForestFarmer } from '../../../shared/cards/classic/CWM/CWM023_ForestFarmer'
import { CWM024_GemHunter } from '../../../shared/cards/classic/CWM/CWM024_GemHunter'
import { CWM025_Godfather } from '../../../shared/cards/classic/CWM/CWM025_Godfather'
import { CWM026_HedgeMaster } from '../../../shared/cards/classic/CWM/CWM026_HedgeMaster'
import { CWM027_Heiress } from '../../../shared/cards/classic/CWM/CWM027_Heiress'
import { CWM028_Herdsman } from '../../../shared/cards/classic/CWM/CWM028_Herdsman'
import { CWM029_HillFarmer } from '../../../shared/cards/classic/CWM/CWM029_HillFarmer'
import { CWM030_Hoarder } from '../../../shared/cards/classic/CWM/CWM030_Hoarder'
import { CWM031_HumbleFarmboy } from '../../../shared/cards/classic/CWM/CWM031_HumbleFarmboy'
import { CWM032_Hunter } from '../../../shared/cards/classic/CWM/CWM032_Hunter'
import { CWM033_LadyinWaiting } from '../../../shared/cards/classic/CWM/CWM033_LadyinWaiting'
import { CWM034_LivestockKeeper } from '../../../shared/cards/classic/CWM/CWM034_LivestockKeeper'
import { CWM035_Mailman } from '../../../shared/cards/classic/CWM/CWM035_Mailman'
import { CWM036_MasterCook } from '../../../shared/cards/classic/CWM/CWM036_MasterCook'
import { CWM037_MasterStableman } from '../../../shared/cards/classic/CWM/CWM037_MasterStableman'
import { CWM038_Minimalist } from '../../../shared/cards/classic/CWM/CWM038_Minimalist'
import { CWM039_Pawnbroker } from '../../../shared/cards/classic/CWM/CWM039_Pawnbroker'
import { CWM040_Permaculturist } from '../../../shared/cards/classic/CWM/CWM040_Permaculturist'
import { CWM041_Politician } from '../../../shared/cards/classic/CWM/CWM041_Politician'
import { CWM042_Remodeler } from '../../../shared/cards/classic/CWM/CWM042_Remodeler'
import { CWM043_ResourceLender } from '../../../shared/cards/classic/CWM/CWM043_ResourceLender'
import { CWM044_SiloGirl } from '../../../shared/cards/classic/CWM/CWM044_SiloGirl'
import { CWM045_StableDeliveryman } from '../../../shared/cards/classic/CWM/CWM045_StableDeliveryman'
import { CWM046_StoneCurator } from '../../../shared/cards/classic/CWM/CWM046_StoneCurator'
import { CWM047_StorehouseMinder } from '../../../shared/cards/classic/CWM/CWM047_StorehouseMinder'
import { CWM048_SundayWorker } from '../../../shared/cards/classic/CWM/CWM048_SundayWorker'
import { CWM049_SunriseAdmirer } from '../../../shared/cards/classic/CWM/CWM049_SunriseAdmirer'
import { CWM050_TapestryWeaver } from '../../../shared/cards/classic/CWM/CWM050_TapestryWeaver'
import { CWM051_TavernKeeper } from '../../../shared/cards/classic/CWM/CWM051_TavernKeeper'
import { CWM052_TileMaker } from '../../../shared/cards/classic/CWM/CWM052_TileMaker'
import { CWM053_VillageFool } from '../../../shared/cards/classic/CWM/CWM053_VillageFool'
import { CWM054_WheelbarrowPusher } from '../../../shared/cards/classic/CWM/CWM054_WheelbarrowPusher'
import { CWM055_WoodWorker } from '../../../shared/cards/classic/CWM/CWM055_WoodWorker'
import { CWM056_Almshouse } from '../../../shared/cards/classic/CWM/CWM056_Almshouse'
import { CWM057_AnimalNursery } from '../../../shared/cards/classic/CWM/CWM057_AnimalNursery'
import { CWM058_AppleTree } from '../../../shared/cards/classic/CWM/CWM058_AppleTree'
import { CWM059_Apprenticeship } from '../../../shared/cards/classic/CWM/CWM059_Apprenticeship'
import { CWM060_Attic } from '../../../shared/cards/classic/CWM/CWM060_Attic'
import { CWM061_BackDoor } from '../../../shared/cards/classic/CWM/CWM061_BackDoor'
import { CWM062_BackyardWell } from '../../../shared/cards/classic/CWM/CWM062_BackyardWell'
import { CWM063_Birdcage } from '../../../shared/cards/classic/CWM/CWM063_Birdcage'
import { CWM064_Bonre } from '../../../shared/cards/classic/CWM/CWM064_Bonre'
import { CWM065_BoundaryStones } from '../../../shared/cards/classic/CWM/CWM065_BoundaryStones'
import { CWM066_Brazier } from '../../../shared/cards/classic/CWM/CWM066_Brazier'
import { CWM067_BuriedTreasure } from '../../../shared/cards/classic/CWM/CWM067_BuriedTreasure'
import { CWM068_CashCrop } from '../../../shared/cards/classic/CWM/CWM068_CashCrop'
import { CWM069_ChangingPlans } from '../../../shared/cards/classic/CWM/CWM069_ChangingPlans'
import { CWM070_ClockworkMan } from '../../../shared/cards/classic/CWM/CWM070_ClockworkMan'
import { CWM071_Cookies } from '../../../shared/cards/classic/CWM/CWM071_Cookies'
import { CWM072_Crib } from '../../../shared/cards/classic/CWM/CWM072_Crib'
import { CWM073_DiamondMine } from '../../../shared/cards/classic/CWM/CWM073_DiamondMine'
import { CWM074_Donkey } from '../../../shared/cards/classic/CWM/CWM074_Donkey'
import { CWM075_Downsizing } from '../../../shared/cards/classic/CWM/CWM075_Downsizing'
import { CWM076_DrainedPond } from '../../../shared/cards/classic/CWM/CWM076_DrainedPond'
import { CWM077_EdibleRoots } from '../../../shared/cards/classic/CWM/CWM077_EdibleRoots'
import { CWM078_FarmSchool } from '../../../shared/cards/classic/CWM/CWM078_FarmSchool'
import { CWM079_FestivalHall } from '../../../shared/cards/classic/CWM/CWM079_FestivalHall'
import { CWM080_FishHook } from '../../../shared/cards/classic/CWM/CWM080_FishHook'
import { CWM081_FishPond } from '../../../shared/cards/classic/CWM/CWM081_FishPond'
import { CWM082_FlowerPots } from '../../../shared/cards/classic/CWM/CWM082_FlowerPots'
import { CWM083_FreeRangeChickens } from '../../../shared/cards/classic/CWM/CWM083_FreeRangeChickens'
import { CWM084_FriendlyPastures } from '../../../shared/cards/classic/CWM/CWM084_FriendlyPastures'
import { CWM085_Fruitcake } from '../../../shared/cards/classic/CWM/CWM085_Fruitcake'
import { CWM086_GlassblowersShop } from '../../../shared/cards/classic/CWM/CWM086_GlassblowersShop'
import { CWM087_GoldMedal } from '../../../shared/cards/classic/CWM/CWM087_GoldMedal'
import { CWM088_GrainElevator } from '../../../shared/cards/classic/CWM/CWM088_GrainElevator'
import { CWM089_HomeGarden } from '../../../shared/cards/classic/CWM/CWM089_HomeGarden'
import { CWM090_Honeymoon } from '../../../shared/cards/classic/CWM/CWM090_Honeymoon'
import { CWM091_IronPlow } from '../../../shared/cards/classic/CWM/CWM091_IronPlow'
import { CWM092_Keys } from '../../../shared/cards/classic/CWM/CWM092_Keys'
import { CWM093_Kindling } from '../../../shared/cards/classic/CWM/CWM093_Kindling'
import { CWM094_LampOil } from '../../../shared/cards/classic/CWM/CWM094_LampOil'
import { CWM095_MountainCave } from '../../../shared/cards/classic/CWM/CWM095_MountainCave'
import { CWM096_OakCask } from '../../../shared/cards/classic/CWM/CWM096_OakCask'
import { CWM097_OpenGate } from '../../../shared/cards/classic/CWM/CWM097_OpenGate'
import { CWM098_PettingZoo } from '../../../shared/cards/classic/CWM/CWM098_PettingZoo'
import { CWM099_PigWallow } from '../../../shared/cards/classic/CWM/CWM099_PigWallow'
import { CWM100_PlumPatch } from '../../../shared/cards/classic/CWM/CWM100_PlumPatch'
import { CWM101_PrizewinningSheep } from '../../../shared/cards/classic/CWM/CWM101_PrizewinningSheep'
import { CWM102_Ram } from '../../../shared/cards/classic/CWM/CWM102_Ram'
import { CWM103_Raspberries } from '../../../shared/cards/classic/CWM/CWM103_Raspberries'
import { CWM104_ReedNursery } from '../../../shared/cards/classic/CWM/CWM104_ReedNursery'
import { CWM105_RotherhamPlow } from '../../../shared/cards/classic/CWM/CWM105_RotherhamPlow'
import { CWM106_Ruins } from '../../../shared/cards/classic/CWM/CWM106_Ruins'
import { CWM107_SlapdashRenovation } from '../../../shared/cards/classic/CWM/CWM107_SlapdashRenovation'
import { CWM108_Steamer } from '../../../shared/cards/classic/CWM/CWM108_Steamer'
import { CWM109_SteelPlow } from '../../../shared/cards/classic/CWM/CWM109_SteelPlow'
import { CWM110_StorageShed } from '../../../shared/cards/classic/CWM/CWM110_StorageShed'
import { CWM111_UndisturbedPond } from '../../../shared/cards/classic/CWM/CWM111_UndisturbedPond'
import { CWM112_VillageSchool } from '../../../shared/cards/classic/CWM/CWM112_VillageSchool'
import { CWM113_WildBreeding } from '../../../shared/cards/classic/CWM/CWM113_WildBreeding'
import { CWM114_WineCloset } from '../../../shared/cards/classic/CWM/CWM114_WineCloset'
import { CWM115_WormBait } from '../../../shared/cards/classic/CWM/CWM115_WormBait'

const sources: CardSource[] = [
  CWM001_Amazon,
  CWM002_AnimalBuyer,
  CWM003_ApplePicker,
  CWM004_BargainingBakerr,
  CWM005_BeeKeeper,
  CWM006_Borrower,
  CWM007_BranchCollector,
  CWM008_BreadCarrier,
  CWM009_Chemist,
  CWM010_CloisterDweller,
  CWM011_Contractor,
  CWM012_CovetousFarmer,
  CWM013_Cowboy,
  CWM014_CropRotator,
  CWM015_DebrisDealer,
  CWM016_Diplomat,
  CWM017_Engineer,
  CWM018_ExpertBuilder,
  CWM019_FamilyPlanner,
  CWM020_FarmSchoolGraduate,
  CWM021_FenceDealer,
  CWM022_FoodConnoisseur,
  CWM023_ForestFarmer,
  CWM024_GemHunter,
  CWM025_Godfather,
  CWM026_HedgeMaster,
  CWM027_Heiress,
  CWM028_Herdsman,
  CWM029_HillFarmer,
  CWM030_Hoarder,
  CWM031_HumbleFarmboy,
  CWM032_Hunter,
  CWM033_LadyinWaiting,
  CWM034_LivestockKeeper,
  CWM035_Mailman,
  CWM036_MasterCook,
  CWM037_MasterStableman,
  CWM038_Minimalist,
  CWM039_Pawnbroker,
  CWM040_Permaculturist,
  CWM041_Politician,
  CWM042_Remodeler,
  CWM043_ResourceLender,
  CWM044_SiloGirl,
  CWM045_StableDeliveryman,
  CWM046_StoneCurator,
  CWM047_StorehouseMinder,
  CWM048_SundayWorker,
  CWM049_SunriseAdmirer,
  CWM050_TapestryWeaver,
  CWM051_TavernKeeper,
  CWM052_TileMaker,
  CWM053_VillageFool,
  CWM054_WheelbarrowPusher,
  CWM055_WoodWorker,
  CWM056_Almshouse,
  CWM057_AnimalNursery,
  CWM058_AppleTree,
  CWM059_Apprenticeship,
  CWM060_Attic,
  CWM061_BackDoor,
  CWM062_BackyardWell,
  CWM063_Birdcage,
  CWM064_Bonre,
  CWM065_BoundaryStones,
  CWM066_Brazier,
  CWM067_BuriedTreasure,
  CWM068_CashCrop,
  CWM069_ChangingPlans,
  CWM070_ClockworkMan,
  CWM071_Cookies,
  CWM072_Crib,
  CWM073_DiamondMine,
  CWM074_Donkey,
  CWM075_Downsizing,
  CWM076_DrainedPond,
  CWM077_EdibleRoots,
  CWM078_FarmSchool,
  CWM079_FestivalHall,
  CWM080_FishHook,
  CWM081_FishPond,
  CWM082_FlowerPots,
  CWM083_FreeRangeChickens,
  CWM084_FriendlyPastures,
  CWM085_Fruitcake,
  CWM086_GlassblowersShop,
  CWM087_GoldMedal,
  CWM088_GrainElevator,
  CWM089_HomeGarden,
  CWM090_Honeymoon,
  CWM091_IronPlow,
  CWM092_Keys,
  CWM093_Kindling,
  CWM094_LampOil,
  CWM095_MountainCave,
  CWM096_OakCask,
  CWM097_OpenGate,
  CWM098_PettingZoo,
  CWM099_PigWallow,
  CWM100_PlumPatch,
  CWM101_PrizewinningSheep,
  CWM102_Ram,
  CWM103_Raspberries,
  CWM104_ReedNursery,
  CWM105_RotherhamPlow,
  CWM106_Ruins,
  CWM107_SlapdashRenovation,
  CWM108_Steamer,
  CWM109_SteelPlow,
  CWM110_StorageShed,
  CWM111_UndisturbedPond,
  CWM112_VillageSchool,
  CWM113_WildBreeding,
  CWM114_WineCloset,
  CWM115_WormBait
]
const cards = sources.map((source) => source.meta)
const customCards: CustomCardData[] = [
  ...sources.map((source) => ({ cardType: source.meta.kind === 'occupation' ? 'occupation' as const : 'minor' as const, cardJson: source.meta })),
  { cardType: 'minor', cardJson: { id: 'STUB_WMReturnField', name: 'Return a field card', deck: 'TEST', number: 1, desc: [], cost: { cards: { list: ['CWM068_CashCrop'], required: true } } } },
]
export const wmId = (number: number) => cards.find((card) => card.number === number)!.id
export const wmCard = (number: number) => cards.find((card) => card.number === number)!
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

export function wmRestore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))), customCards)
  sessions.push(restored)
  return restored
}

/** Four-player work fixture. Every hand is fixed before load; no accidental redeal. */
export function wmSession(
  numbers: number[],
  configure?: (state: GameState) => void,
  played = true,
) {
  const session = createWorkSession({
    seed: 115,
    options: { playerCount: 4 },
    customCards,
    configure(state) {
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        for (const resource of Object.keys(player.resources))
          player.resources[resource as keyof Resource] = 0
      }
      const owner = state.players[0]!
      for (const n of numbers) {
        const zone =
          n <= 55
            ? played
              ? owner.occupationPlayed
              : owner.occupationHand
            : played
              ? owner.minorPlayed
              : owner.minorHand
        zone.push(wmId(n))
      }
      configure?.(state)
    },
  })
  session.withCtx(() => {
    for (const player of session.state.players)
      for (const card of [
        ...player.occupationPlayed,
        ...player.minorPlayed,
        ...player.improvements,
      ])
        ensureCardModifiers(player, card)
  })
  sessions.push(session)
  return session
}

export function wmOk(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  expect(response.scores).toHaveLength(4)
  return response
}
export function wmChoose(session: GameSession, response: SessionResponse, value: string) {
  expect(
    sessionOptions(response)
      .filter((option) => !option.disabled)
      .map((option) => option.value),
    JSON.stringify(response.interaction),
  ).toContain(value)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending choice')
  return wmOk(session.resolveChoice(response.interaction.playerIndex, value))
}
/** Resolve only forced payments; keep effects and optional decisions visible to assertions. */
export function wmPayment(session: GameSession, initial: SessionResponse) {
  let response = wmOk(initial)
  for (let step = 0; step < 6; step++) {
    const options = sessionOptions(response).filter((option) => !option.disabled)
    if (options.length !== 1 || options[0]!.labelKey !== 'actions.pay.name') break
    response = wmChoose(session, response, options[0]!.value)
  }
  return response
}
export function wmAction(session: GameSession, response: SessionResponse, label: string) {
  const choice = sessionOptions(response).find(
    (option) => !option.disabled && option.labelKey === label,
  )
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return wmPayment(session, wmChoose(session, response, choice!.value))
}
export function wmBonus(response: SessionResponse, n: number, seat = 0) {
  return response.scores[seat]!.categories.flatMap((category) => category.entries)
    .filter((entry) => entry.type === 'bonus' && entry.cardId === wmId(n))
    .reduce((sum, entry) => sum + entry.score, 0)
}
export function wmEvent(response: SessionResponse, n: number) {
  expect(
    response.state.events.some(
      (event) =>
        event.sourceCardId === wmId(n) ||
        ('cardId' in event && event.cardId === wmId(n)) ||
        (event.type === 'resource.paid' &&
          Object.keys(event.resources).some((key) => key.startsWith(wmId(n) + ':'))) ||
        (event.type === 'resource.exchanged' && event.exchangeSource === wmId(n)),
    ),
  ).toBe(true)
  expect(response.state.log.length).toBeGreaterThan(0)
}
export function wmEndRound(session: GameSession, round: number, food = 40) {
  session.state.round = round
  session.state.players.forEach((player) => {
    player.resources.food = food
    markAllWorkersUsed(session.state, player)
  })
  session.loadState(session.state)
  return wmOk(session.performRoundEnd())
}
export function wmConfirmations(session: GameSession, initial: SessionResponse) {
  let response = wmOk(initial)
  for (let step = 0; step < 24 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player')
      response = wmOk(session.resolveChoice(interaction.playerIndex, 'confirm'))
    else if (interaction.request.kind === 'confirm-player-switch')
      response = wmOk(session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm'))
    else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime')
      response = wmChoose(session, response, '__skip__')
    else break
  }
  return response
}
