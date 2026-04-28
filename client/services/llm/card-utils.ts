// client/services/llm/card-utils.ts
// Card metadata extraction from LLM responses, translation helper, and the
// art-prompt builder. All of these are independent of which provider is
// actually called — they consume the public streamChat() and any LlmConfig.
import type { ChatMessage, LlmConfig } from './types'
import { streamChat } from './index'

/**
 * Extract card metadata from a TypeScript code block in LLM response.
 * TS-only — the LLM system prompt requires a ```typescript fenced block that
 * calls `registerCardEffect` / `registerCardListener` and instantiates either
 * `new Occupation({...})` or `new MinorImprovement({...})`.
 */
export function extractCardFromResponse(text: string): {
  card: Record<string, unknown>
  sourceCode: string
} | null {
  // Try TypeScript code blocks first
  const tsMatches = [...text.matchAll(/```(?:typescript|ts)\s*([\s\S]*?)```/g)]
  if (tsMatches.length > 0) {
    const code = tsMatches[tsMatches.length - 1]![1]!.trim()
    const parsed = parseCardFromTs(code)
    if (parsed) return parsed
  }

  // Fall back to any code block (might be TS without language tag)
  const anyMatches = [...text.matchAll(/```\s*([\s\S]*?)```/g)]
  for (let i = anyMatches.length - 1; i >= 0; i--) {
    const block = anyMatches[i]![1]!.trim()
    // Check if it looks like TypeScript (has const CARD_ID or import)
    if (block.includes('CARD_ID') || block.includes("from '../../shared/cards/")) {
      const parsed = parseCardFromTs(block)
      if (parsed) return parsed
    }
  }

  return null
}

/**
 * Translate card content (name, desc, prerequisite) to a target language.
 * Uses the player's existing LLM config — calls the LLM directly from the browser.
 */
export async function translateCardContent(
  content: { name: string; desc: string[]; prerequisite?: string },
  targetLang: string,
  config: LlmConfig,
): Promise<{ name: string; desc: string[]; prerequisite?: string }> {
  const langLabel = targetLang === 'en' ? 'English' : targetLang === 'zh' ? '中文' : targetLang
  const prompt = `Translate the following Agricola board game card content to ${langLabel}. Return ONLY a JSON object with the translated fields, no explanation or markdown.

Input:
${JSON.stringify(content, null, 2)}

Output format:
{"name": "translated name", "desc": ["translated line 1", "translated line 2"], "prerequisite": "translated prerequisite or omit if empty"}

Important:
- Keep resource tags like <WOOD>, <FOOD>, <GRAIN> etc. unchanged
- Keep game terminology accurate for board games
- Return valid JSON only, no markdown code fences`

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
  let full = ''
  for await (const chunk of streamChat(messages, 'You are a professional translator for board game content.', config)) {
    full += chunk
  }

  // Strip markdown code fences if present
  const cleaned = full.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let parsed: { name: string; desc: string[]; prerequisite?: string }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Translation failed: LLM returned invalid JSON`)
  }
  return {
    name: parsed.name ?? content.name,
    desc: Array.isArray(parsed.desc) ? parsed.desc : content.desc,
    prerequisite: parsed.prerequisite ?? undefined,
  }
}

/**
 * Parse card metadata from TypeScript source code.
 */
function parseCardFromTs(code: string): {
  card: Record<string, unknown>
  sourceCode: string
} | null {
  // Extract card_type from class constructor
  const isOccupation = /new\s+Occupation\s*\(/.test(code)
  const isMinor = /new\s+MinorImprovement\s*\(/.test(code)
  if (!isOccupation && !isMinor) return null

  const cardType = isOccupation ? 'occupation' : 'minor'

  // Extract CARD_ID
  const idMatch = code.match(/const\s+CARD_ID\s*=\s*['"]([^'"]+)['"]/)
  const cardId = idMatch?.[1] ?? 'CUSTOM_Unknown'

  // Extract the card definition object — find the constructor argument
  const constructorPattern = /new\s+(?:MinorImprovement|Occupation)\s*\(\s*\{([\s\S]*)\}\s*\)\s*$/m
  const ctorMatch = code.match(constructorPattern)
  if (!ctorMatch) return null

  const objStr = ctorMatch[1]!

  // Parse fields from the object literal
  const name = extractStringField(objStr, 'name') ?? cardId
  const descRaw = extractArrayField(objStr, 'desc') ?? []
  const desc = descRaw.filter(line => {
    const trimmed = line.trim()
    // Filter out Chinese prerequisite patterns
    if (/^前置条件[：:]/.test(trimmed)) return false
    // Filter out English prerequisite patterns
    if (/^[Pp]rerequisite[s]?\s*[：:]/i.test(trimmed)) return false
    return true
  })
  const vp = extractNumberField(objStr, 'vp') ?? 0
  const cost = extractObjectField(objStr, 'cost') ?? {}
  const modifiers = extractModifiers(objStr)
  const locales = extractLocales(objStr)

  const card: Record<string, unknown> = {
    id: cardId,
    name,
    card_type: cardType,
    cost,
    vp,
    desc,
  }
  if (modifiers.length > 0) card.modifiers = modifiers
  if (locales) card.locales = locales

  return {
    card,
    sourceCode: code,
  }
}

/**
 * Extract `locales: { <lang>: { name, desc[], prerequisite? }, ... }` from
 * the constructor object literal. Returns `null` when the field is absent or
 * has no recognised language entries.
 *
 * Uses brace-balance scanning rather than regex so a `desc` array containing
 * `}` characters or trailing keys (like `modifiers`) doesn't confuse the
 * boundary.
 */
function extractLocales(
  objStr: string,
): Record<string, { name: string; desc: string[]; prerequisite?: string }> | null {
  const headerRe = /locales\s*:\s*\{/g
  const header = headerRe.exec(objStr)
  if (!header) return null
  const bodyStart = header.index + header[0].length
  const bodyEnd = findMatchingBrace(objStr, bodyStart)
  if (bodyEnd < 0) return null
  const body = objStr.slice(bodyStart, bodyEnd)

  const result: Record<string, { name: string; desc: string[]; prerequisite?: string }> = {}
  const langRe = /(\w+)\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = langRe.exec(body)) !== null) {
    const lang = m[1]!
    const entryStart = m.index + m[0].length
    const entryEnd = findMatchingBrace(body, entryStart)
    if (entryEnd < 0) continue
    const entry = body.slice(entryStart, entryEnd)
    const name = extractStringField(entry, 'name')
    const desc = extractArrayField(entry, 'desc') ?? []
    const prerequisite = extractStringField(entry, 'prerequisite') ?? undefined
    if (!name && desc.length === 0) continue
    result[lang] = {
      name: name ?? '',
      desc,
      ...(prerequisite ? { prerequisite } : {}),
    }
    langRe.lastIndex = entryEnd + 1
  }

  return Object.keys(result).length > 0 ? result : null
}

/** Given an open-brace body start index, return the index of its matching `}`. */
function findMatchingBrace(source: string, openBodyStart: number): number {
  let depth = 1
  for (let i = openBodyStart; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function extractStringField(objStr: string, field: string): string | null {
  // Match: name: 'xxx' or name: "xxx"
  const re = new RegExp(`${field}\\s*:\\s*(['"])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`)
  const m = objStr.match(re)
  return m?.[2] ?? null
}

function extractNumberField(objStr: string, field: string): number | null {
  const re = new RegExp(`${field}\\s*:\\s*(\\d+)`)
  const m = objStr.match(re)
  return m ? Number(m[1]) : null
}

function extractArrayField(objStr: string, field: string): string[] | null {
  // Match desc: ['...', '...']
  const re = new RegExp(`${field}\\s*:\\s*\\[([^\\]]*?)\\]`)
  const m = objStr.match(re)
  if (!m) return null
  const items = [...m[1]!.matchAll(/['"]([^'"]*)['"]/g)].map(x => x[1]!)
  return items.length > 0 ? items : null
}

function extractObjectField(objStr: string, field: string): Record<string, number> | null {
  const re = new RegExp(`${field}\\s*:\\s*\\{([^}]*)\\}`)
  const m = objStr.match(re)
  if (!m) return null
  const result: Record<string, number> = {}
  for (const [, k, v] of m[1]!.matchAll(/(\w+)\s*:\s*(\d+)/g)) {
    result[k!] = Number(v!)
  }
  return result
}

function extractModifiers(objStr: string): unknown[] {
  // Simple check: does it have modifiers: [...]?
  if (!objStr.includes('modifiers')) return []
  // Extract the modifiers array content
  const re = /modifiers\s*:\s*\[([\s\S]*?)\]\s*,?\s*(?:implemented|$)/
  const m = objStr.match(re)
  if (!m) return []
  // Try to parse each object in the array
  const results: unknown[] = []
  const objMatches = m[1]!.matchAll(/\{([^}]+)\}/g)
  for (const om of objMatches) {
    try {
      // Convert JS object literal to JSON
      const jsonStr = '{' + om[1]!
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        + '}'
      results.push(JSON.parse(jsonStr))
    } catch { /* skip malformed */ }
  }
  return results
}

/** @deprecated Use extractCardFromResponse instead */
export function extractCardJson(text: string): Record<string, unknown> | null {
  const result = extractCardFromResponse(text)
  if (!result) return null
  return { card: result.card }
}

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Build art generation prompt based on card type and locale.
 * Occupation cards: person in circular gold-trimmed border (Klemens Franz style)
 * Minor improvement cards: object in hexagonal gold-trimmed border
 */
export function buildCardArtPrompt(
  subject: string,
  cardType: 'minor' | 'occupation',
  locale: 'zh' | 'en',
): string {
  if (cardType === 'occupation') {
    return locale === 'zh'
      ? `一幅《农场主》(Agricola)桌游"职业卡"风格的2D插画，完全致敬画师 Klemens Franz。画面主体是${subject}（半身像构图）。角色造型略显粗犷讨喜，具有粗黑墨水勾边和平涂水彩质感，背景是简单的乡村农田风光。画面被完美地框在一个带金边的圆形画框内，框外为纯白背景。画面中绝对不允许出现任何文字、字母、单词或标签。`
      : `A 2D illustration for an Agricola board game "Occupation" card, closely matching the art style of Klemens Franz. It features ${subject}. The character has a quirky, slightly chunky, and charming design, drawn with thick dark ink outlines and flat watercolor texturing. The background is a simple rustic agricultural landscape. The illustration is perfectly enclosed within a gold-trimmed circular border, with a solid white background outside the circle. STRICTLY NO TEXT, NO WORDS, NO LETTERS, AND NO LABELS ANYWHERE IN THE IMAGE.`
  }
  // Minor improvement
  return locale === 'zh'
    ? `一幅《农场主》(Agricola)桌游"次要发展卡"风格的2D插画，完全致敬画师 Klemens Franz。画面特写${subject}。具有粗黑墨水勾边和平涂水彩质感，重点突出物品的质朴感、手工制作痕迹与中世纪实用性。柔和的大地色系，以温暖的棕色和绿色为主。画面被完美地框在一个带金边的【六角形】画框内，框外为纯白背景。画面中绝对不允许出现任何文字、字母、单词或标签。完全的2D平面插画，不要3D，不要写实元素。`
    : `A 2D illustration for an Agricola board game "Minor Improvement" card, in the exact art style of Klemens Franz. It features a close-up of ${subject}. Drawn with thick dark ink outlines and flat watercolor texturing. Focus on the object's rustic, handmade texture and medieval utility. Earthy muted colors with warm browns and greens. The illustration is perfectly enclosed within a gold-trimmed hexagon border, with a solid white background outside the hexagon. STRICTLY NO TEXT, NO WORDS, NO LETTERS, AND NO LABELS ANYWHERE IN THE IMAGE. purely 2D flat illustration, no 3d, no realistic elements.`
}
