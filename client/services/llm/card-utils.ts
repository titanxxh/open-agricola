import { t as translateMessage } from '../../../shared/i18n'
// client/services/llm/card-utils.ts
// Browser-owned card translation and art-prompt helpers.
import type { ChatMessage, LlmConfig } from './types'
import { streamChat } from './stream-chat'

/**
 * Translate card content (name, desc, prerequisite) to a target language.
 * Uses the player's existing LLM config — calls the LLM directly from the browser.
 */
export async function translateCardContent(
  content: { name: string; desc: string[]; prerequisite?: string },
  targetLang: string,
  config: LlmConfig,
): Promise<{ name: string; desc: string[]; prerequisite?: string }> {
  const langLabel = new Intl.DisplayNames(['en'], { type: 'language' }).of(targetLang) ?? targetLang
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

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Build art generation prompt based on card type and locale.
 * The client applies the card-shaped crop and trim after generation.
 */
export function buildCardArtPrompt(
  subject: string,
  cardType: 'minor' | 'occupation',
  locale: string,
): string {
  if (cardType === 'occupation') {
    return translateMessage(locale, "ui.copy.services_llm_card_utils.a_2d_illustration_for_an_agricola_board_a882ee", { value0: subject })
  }
  // Minor improvement
  return translateMessage(locale, "ui.copy.services_llm_card_utils.a_2d_illustration_for_an_agricola_board_65e0db", { value0: subject })
}
