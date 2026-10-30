export type Entry = {
  id: string
  key: string
  kind: 'minor' | 'occupation' | 'major' | 'mother' | 'father' | 'special' | 'terrain' | 'season'
  group: string
  number: string
  nameEn: string
  nameZh: string
  bodyEn: string
  bodyZh: string
  rulesEn: string
  rulesZh: string
  costResources: string[]
  costLabel: string
  points: number | null
  bonus: boolean
  upgrade: boolean
  image: string
  terrain: { row: number; col: number; kind: string }[]
}
