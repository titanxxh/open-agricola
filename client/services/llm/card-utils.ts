// client/services/llm/card-utils.ts
// Card metadata extraction from LLM responses, translation helper, and the
// art-prompt builder. All of these are independent of which provider is
// actually called — they consume the public streamChat() and any LlmConfig.
import type { ChatMessage, LlmConfig } from './types'
import { streamChat } from './index'

/**
 * Extract card metadata from a TypeScript code block in LLM response.
 * TS-only — the LLM system prompt requires a ```typescript fenced block that
 * defines `CARD_DEF` and `CARD_IMPL` constants.
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
  const idMatch = code.match(/const\s+CARD_ID\s*=\s*['"]([^'"]+)['"]/)
  const cardId = idMatch?.[1] ?? 'CUSTOM_Unknown'

  const defMatch = /CARD_DEF\s*=\s*\{/g.exec(code)
  if (!defMatch) return null
  const defStart = defMatch.index + defMatch[0].length
  const defEnd = findMatchingBrace(code, defStart)
  if (defEnd < 0) return null

  const defBody = code.slice(defStart, defEnd)
  const cardType = extractStringField(defBody, 'cardType') ?? extractStringField(defBody, 'card_type')
  if (cardType !== 'occupation' && cardType !== 'minor') return null

  const metaMatch = /meta\s*:\s*\{/g.exec(defBody)
  const objStr = metaMatch
    ? (() => {
        const metaStart = metaMatch.index + metaMatch[0].length
        const metaEnd = findMatchingBrace(defBody, metaStart)
        return metaEnd >= 0 ? defBody.slice(metaStart, metaEnd) : defBody
      })()
    : defBody

  const id = extractStringField(objStr, 'id') ?? cardId
  const name = extractStringField(objStr, 'name') ?? id
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
  const locales = extractLocales(objStr)

  const card: Record<string, unknown> = {
    id,
    name,
    card_type: cardType,
    cost,
    vp,
    desc,
  }
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

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Build art generation prompt based on card type and locale.
 * The client applies the card-shaped crop and trim after generation.
 */
export function buildCardArtPrompt(
  subject: string,
  cardType: 'minor' | 'occupation',
  locale: 'zh' | 'en',
): string {
  if (cardType === 'occupation') {
    return locale === 'zh'
      ? `一幅《农场主》(Agricola)桌游"职业卡"风格的2D插画，完全致敬画师 Klemens Franz。画面主体是${subject}（半身像构图）。角色造型略显粗犷讨喜，具有粗黑墨水勾边和平涂水彩质感，背景是简单的乡村农田风光。这是供程序后处理裁切的原始插画素材，不是成品卡牌、海报或徽章。请使用近方形、略高于宽的竖向构图，宽高比约为 0.95:1。插画必须从边到边铺满整张画布并延伸到四边，主体要大且醒目；不要绘制任何环绕主体或画布的圆形、六角形、矩形边线、画框、徽章或留白。画面中绝对不允许出现任何文字、字母、单词或标签。`
      : `A 2D illustration for an Agricola board game "Occupation" card, closely matching the art style of Klemens Franz. It features ${subject}. The character has a quirky, slightly chunky, and charming design, drawn with thick dark ink outlines and flat watercolor texturing. The background is a simple rustic agricultural landscape. This is raw source artwork for software cropping, not a finished card, poster, or badge. Use a near-square, slightly portrait composition with a width-to-height ratio of about 0.95:1. The artwork must extend to all four edges, with the subject large and prominent. Do not draw any circle, hexagon, rectangular outline, border, frame, badge, margin, text, word, letter, or label.`
  }
  // Minor improvement
  return locale === 'zh'
    ? `一幅《农场主》(Agricola)桌游"次要发展卡"风格的2D插画，完全致敬画师 Klemens Franz。画面特写${subject}。具有粗黑墨水勾边和平涂水彩质感，重点突出物品的质朴感、手工制作痕迹与中世纪实用性。柔和的大地色系，以温暖的棕色和绿色为主。这是供程序后处理裁切的原始插画素材，不是成品卡牌、海报或徽章。请使用近方形、略高于宽的竖向构图，宽高比约为 0.95:1。插画必须从边到边铺满整张画布并延伸到四边，主体要大且醒目；不要绘制任何环绕主体或画布的圆形、六角形、矩形边线、画框、徽章或留白。画面中绝对不允许出现任何文字、字母、单词或标签。完全的2D平面插画，不要3D，不要写实元素。`
    : `A 2D illustration for an Agricola board game "Minor Improvement" card, in the exact art style of Klemens Franz. It features a close-up of ${subject}. Drawn with thick dark ink outlines and flat watercolor texturing. Focus on the object's rustic, handmade texture and medieval utility. Use earthy muted colors with warm browns and greens. This is raw source artwork for software cropping, not a finished card, poster, or badge. Use a near-square, slightly portrait composition with a width-to-height ratio of about 0.95:1. The artwork must extend to all four edges, with the subject large and prominent. Do not draw any circle, hexagon, rectangular outline, border, frame, badge, margin, text, word, letter, or label. Use a purely 2D flat illustration with no 3D or realistic elements.`
}
