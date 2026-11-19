import { expect } from 'vitest'
import type { CardSource } from '../../../shared/cards/card-source'
import type { GameState } from '../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { createWorkSession } from './session-fixtures'
import { choose } from './card-play-lifecycle'
import { CFL001_FarmCart } from '../../../shared/cards/classic/CFL/CFL001_FarmCart'
import { CFL002_BeguineCourtyard } from '../../../shared/cards/classic/CFL/CFL002_BeguineCourtyard'
import { CFL003_BelgianShepherd } from '../../../shared/cards/classic/CFL/CFL003_BelgianShepherd'
import { CFL004_EducationalBuilding } from '../../../shared/cards/classic/CFL/CFL004_EducationalBuilding'
import { CFL005_Brabant } from '../../../shared/cards/classic/CFL/CFL005_Brabant'
import { CFL006_EndiveField } from '../../../shared/cards/classic/CFL/CFL006_EndiveField'
import { CFL007_DiamondTradingPost } from '../../../shared/cards/classic/CFL/CFL007_DiamondTradingPost'
import { CFL008_WoodenDraisine } from '../../../shared/cards/classic/CFL/CFL008_WoodenDraisine'
import { CFL009_EbonyShoe } from '../../../shared/cards/classic/CFL/CFL009_EbonyShoe'
import { CFL010_StuckCart } from '../../../shared/cards/classic/CFL/CFL010_StuckCart'
import { CFL011_Towhead } from '../../../shared/cards/classic/CFL/CFL011_Towhead'
import { CFL012_Cart } from '../../../shared/cards/classic/CFL/CFL012_Cart'
import { CFL013_GiftTable } from '../../../shared/cards/classic/CFL/CFL013_GiftTable'
import { CFL014_JeneverDistillery } from '../../../shared/cards/classic/CFL/CFL014_JeneverDistillery'
import { CFL015_CourtyardGarden } from '../../../shared/cards/classic/CFL/CFL015_CourtyardGarden'
import { CFL016_JannekenPis } from '../../../shared/cards/classic/CFL/CFL016_JannekenPis'
import { CFL017_BobbinTable } from '../../../shared/cards/classic/CFL/CFL017_BobbinTable'
import { CFL018_Oce } from '../../../shared/cards/classic/CFL/CFL018_Oce'
import { CFL019_LanternWonder } from '../../../shared/cards/classic/CFL/CFL019_LanternWonder'
import { CFL020_LoveGarden } from '../../../shared/cards/classic/CFL/CFL020_LoveGarden'
import { CFL021_LionsMound } from '../../../shared/cards/classic/CFL/CFL021_LionsMound'
import { CFL022_CornMaze } from '../../../shared/cards/classic/CFL/CFL022_CornMaze'
import { CFL023_CarrotMuseum } from '../../../shared/cards/classic/CFL/CFL023_CarrotMuseum'
import { CFL024_LoversTryst } from '../../../shared/cards/classic/CFL/CFL024_LoversTryst'
import { CFL025_Cockaigne } from '../../../shared/cards/classic/CFL/CFL025_Cockaigne'
import { CFL026_SpeculoosBakery } from '../../../shared/cards/classic/CFL/CFL026_SpeculoosBakery'
import { CFL027_TrappistBeer } from '../../../shared/cards/classic/CFL/CFL027_TrappistBeer'
import { CFL028_HashwithFries } from '../../../shared/cards/classic/CFL/CFL028_HashwithFries'
import { CFL029_BirdTrap } from '../../../shared/cards/classic/CFL/CFL029_BirdTrap'
import { CFL030_WildBoarHunt } from '../../../shared/cards/classic/CFL/CFL030_WildBoarHunt'
import { CFL031_OldMaster } from '../../../shared/cards/classic/CFL/CFL031_OldMaster'
import { CFL032_Elder } from '../../../shared/cards/classic/CFL/CFL032_Elder'
import { CFL033_Sculptor } from '../../../shared/cards/classic/CFL/CFL033_Sculptor'
import { CFL034_FranciscanMonk } from '../../../shared/cards/classic/CFL/CFL034_FranciscanMonk'
import { CFL035_Freemason } from '../../../shared/cards/classic/CFL/CFL035_Freemason'
import { CFL036_VegetableSeller } from '../../../shared/cards/classic/CFL/CFL036_VegetableSeller'
import { CFL037_RoughBaker } from '../../../shared/cards/classic/CFL/CFL037_RoughBaker'
import { CFL038_ShepherdwithFlock } from '../../../shared/cards/classic/CFL/CFL038_ShepherdwithFlock'
import { CFL039_Cosmographer } from '../../../shared/cards/classic/CFL/CFL039_Cosmographer'
import { CFL040_Anatomist } from '../../../shared/cards/classic/CFL/CFL040_Anatomist'
import { CFL041_FryCook } from '../../../shared/cards/classic/CFL/CFL041_FryCook'
import { CFL042_Rainmaker } from '../../../shared/cards/classic/CFL/CFL042_Rainmaker'
import { CFL043_RubenesqueWoman } from '../../../shared/cards/classic/CFL/CFL043_RubenesqueWoman'
import { CFL044_Returnee } from '../../../shared/cards/classic/CFL/CFL044_Returnee'
import { CFL045_SchoolDropout } from '../../../shared/cards/classic/CFL/CFL045_SchoolDropout'
import { CFL046_StableArchitect } from '../../../shared/cards/classic/CFL/CFL046_StableArchitect'
import { CFL047_FarmLawyer } from '../../../shared/cards/classic/CFL/CFL047_FarmLawyer'
import { CFL048_Botanist } from '../../../shared/cards/classic/CFL/CFL048_Botanist'
import { CFL049_Accountant } from '../../../shared/cards/classic/CFL/CFL049_Accountant'
import { CFL050_MeatSupplier } from '../../../shared/cards/classic/CFL/CFL050_MeatSupplier'
import { CFL051_NorthSeaFisherman } from '../../../shared/cards/classic/CFL/CFL051_NorthSeaFisherman'
import { CFL052_Scribbler } from '../../../shared/cards/classic/CFL/CFL052_Scribbler'
import { CFL053_CafeSinger } from '../../../shared/cards/classic/CFL/CFL053_CafeSinger'
import { CFL054_ChansonSinger } from '../../../shared/cards/classic/CFL/CFL054_ChansonSinger'
import { CFL055_Recluse } from '../../../shared/cards/classic/CFL/CFL055_Recluse'
import { CFL056_FlemishPatriot } from '../../../shared/cards/classic/CFL/CFL056_FlemishPatriot'
import { CFL057_Chaplain } from '../../../shared/cards/classic/CFL/CFL057_Chaplain'
import { CFL058_GoldWeigher } from '../../../shared/cards/classic/CFL/CFL058_GoldWeigher'
import { CFL059_PillarBiter } from '../../../shared/cards/classic/CFL/CFL059_PillarBiter'
import { CFL060_VirtuousHero } from '../../../shared/cards/classic/CFL/CFL060_VirtuousHero'
import { CFL061_BlacklegChicken } from '../../../shared/cards/classic/CFL/CFL061_BlacklegChicken'

export const fl: Record<number, CardSource> = {
  1: CFL001_FarmCart,
  2: CFL002_BeguineCourtyard,
  3: CFL003_BelgianShepherd,
  4: CFL004_EducationalBuilding,
  5: CFL005_Brabant,
  6: CFL006_EndiveField,
  7: CFL007_DiamondTradingPost,
  8: CFL008_WoodenDraisine,
  9: CFL009_EbonyShoe,
  10: CFL010_StuckCart,
  11: CFL011_Towhead,
  12: CFL012_Cart,
  13: CFL013_GiftTable,
  14: CFL014_JeneverDistillery,
  15: CFL015_CourtyardGarden,
  16: CFL016_JannekenPis,
  17: CFL017_BobbinTable,
  18: CFL018_Oce,
  19: CFL019_LanternWonder,
  20: CFL020_LoveGarden,
  21: CFL021_LionsMound,
  22: CFL022_CornMaze,
  23: CFL023_CarrotMuseum,
  24: CFL024_LoversTryst,
  25: CFL025_Cockaigne,
  26: CFL026_SpeculoosBakery,
  27: CFL027_TrappistBeer,
  28: CFL028_HashwithFries,
  29: CFL029_BirdTrap,
  30: CFL030_WildBoarHunt,
  31: CFL031_OldMaster,
  32: CFL032_Elder,
  33: CFL033_Sculptor,
  34: CFL034_FranciscanMonk,
  35: CFL035_Freemason,
  36: CFL036_VegetableSeller,
  37: CFL037_RoughBaker,
  38: CFL038_ShepherdwithFlock,
  39: CFL039_Cosmographer,
  40: CFL040_Anatomist,
  41: CFL041_FryCook,
  42: CFL042_Rainmaker,
  43: CFL043_RubenesqueWoman,
  44: CFL044_Returnee,
  45: CFL045_SchoolDropout,
  46: CFL046_StableArchitect,
  47: CFL047_FarmLawyer,
  48: CFL048_Botanist,
  49: CFL049_Accountant,
  50: CFL050_MeatSupplier,
  51: CFL051_NorthSeaFisherman,
  52: CFL052_Scribbler,
  53: CFL053_CafeSinger,
  54: CFL054_ChansonSinger,
  55: CFL055_Recluse,
  56: CFL056_FlemishPatriot,
  57: CFL057_Chaplain,
  58: CFL058_GoldWeigher,
  59: CFL059_PillarBiter,
  60: CFL060_VirtuousHero,
  61: CFL061_BlacklegChicken,
}

export function flSession(numbers: number[], configure: (state: GameState) => void): GameSession {
  return createWorkSession({
    seed: 6100,
    options: { playerCount: 4 },
    customCards: numbers.map((number) => ({
      cardType:
        fl[number]!.meta.kind === 'occupation' ||
        (fl[number]!.meta.kind === 'playerAction' &&
          fl[number]!.meta.playerActionCardType === 'occupation')
          ? 'occupation'
          : 'minor',
      cardJson: fl[number]!.meta,
    })),
    configure,
  })
}

export function confirmTurns(session: GameSession, response: SessionResponse): SessionResponse {
  let current = response
  for (let index = 0; index < 8; index++) {
    expect(current.ok, current.error).toBe(true)
    if (
      current.interaction.stateId !== 'wait' ||
      !['confirm-next-player', 'confirm-player-switch'].includes(current.interaction.request.kind)
    )
      return current
    current = session.resolveChoice(current.interaction.playerIndex, 'confirm')
  }
  throw new Error('Unexpected confirmation loop')
}

export function chooseBranch(
  session: GameSession,
  response: SessionResponse,
  index = 0,
): SessionResponse {
  if (response.interaction.stateId !== 'wait')
    throw new Error(`Expected choice, got ${JSON.stringify(response.interaction)}`)
  const option = flOptions(response).filter(
    (entry) => !entry.disabled && entry.value !== '__skip__',
  )[index]
  if (!option) throw new Error(`Missing choice ${index}: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

export function takeFlAnytime(
  session: GameSession,
  number: number,
  suffix: string,
): SessionResponse {
  const response = session.takeAnytimeAction(0, `${fl[number]!.id}-${suffix}`)
  expect(response.ok, `${number}: ${response.error}`).toBe(true)
  return response
}

export const flOptions = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    ? response.interaction.request.options
    : []
