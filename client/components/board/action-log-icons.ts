export type LogIconKey =
  | 'harvest'
  | 'sheep'
  | 'boar'
  | 'cattle'
  | 'home'
  | 'family'
  | 'resource'
  | 'card'
  | 'system'

const RULES: Array<[RegExp, LogIconKey]> = [
  [/收获|harvest/i, 'harvest'],
  [/羊|sheep/i, 'sheep'],
  [/猪|pig|boar/i, 'boar'],
  [/牛|cattle/i, 'cattle'],
  [/建造|房间|木屋|build|room|hut/i, 'home'],
  [/家庭|family|繁殖|grow/i, 'family'],
  [/木|stone|clay|reed|资源|food|wood/i, 'resource'],
  [/卡|card|发展|occupation/i, 'card'],
]

export function pickLogIcon(text: string): LogIconKey {
  for (const [re, icon] of RULES) if (re.test(text)) return icon
  return 'system'
}
