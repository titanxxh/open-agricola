import type { Resource } from '../contract/types'

export type HarvestReapEntry = {
  player: string
  grain: number
  vegetable: number
}

export type HarvestFeedEntry = {
  player: string
  food: number
  grain: number
  vegetable: number
  sheep: number
  boar: number
  cattle: number
  begging: number
  conversions: {
    sourceName: string
    resourceKey: keyof Resource
    count: number
    food: number
  }[]
}

export type HarvestBreedEntry = {
  player: string
  sheep: number
  boar: number
  cattle: number
}

export type HarvestSummary = {
  reap: HarvestReapEntry[]
  feed: HarvestFeedEntry[]
  breed: HarvestBreedEntry[]
}
