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
