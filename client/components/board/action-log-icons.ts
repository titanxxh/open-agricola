export type LogIconKey = '🌾' | '🐑' | '🐖' | '🐂' | '🏠' | '👶' | '💰' | '🃏' | '⚙️'

const RULES: Array<[RegExp, LogIconKey]> = [
  [/收获|harvest/i, '🌾'],
  [/羊|sheep/i, '🐑'],
  [/猪|pig|boar/i, '🐖'],
  [/牛|cattle/i, '🐂'],
  [/建造|房间|木屋|build|room|hut/i, '🏠'],
  [/家庭|family|繁殖|grow/i, '👶'],
  [/木|stone|clay|reed|资源|food|wood/i, '💰'],
  [/卡|card|发展|occupation/i, '🃏'],
]

export function pickLogIcon(text: string): LogIconKey {
  for (const [re, icon] of RULES) if (re.test(text)) return icon
  return '⚙️'
}
