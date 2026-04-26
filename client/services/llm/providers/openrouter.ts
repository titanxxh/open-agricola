// client/services/llm/providers/openrouter.ts
import type { LlmConfig, ProviderDef, ReferenceImage } from '../types'

function extractOpenRouterImageUrl(data: unknown): string | null {
  const root = data as {
    choices?: Array<{
      message?: {
        images?: Array<{ image_url?: { url?: string } }>
        content?: unknown
      }
    }>
  }
  const message = root.choices?.[0]?.message
  const imageUrl = message?.images?.[0]?.image_url?.url
  if (imageUrl) return imageUrl

  const content = message?.content
  if (Array.isArray(content)) {
    for (const part of content) {
      const candidate = part as {
        type?: string
        image_url?: { url?: string }
        source?: { data?: string; media_type?: string }
      }
      if (candidate.image_url?.url) return candidate.image_url.url
      if (candidate.source?.data) {
        return `data:${candidate.source.media_type ?? 'image/png'};base64,${candidate.source.data}`
      }
    }
  }

  return null
}

async function openrouterGenerateImage(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const imageParts = (referenceImages ?? []).map(img => ({
    type: 'image_url',
    image_url: { url: `data:${img.mimeType};base64,${img.data}` },
  }))
  const content = imageParts.length > 0
    ? [{ type: 'text', text: prompt }, ...imageParts]
    : prompt

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content }],
      modalities: ['image'],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => '')
    throw new Error(`OpenRouter image API error ${resp.status}: ${err}`)
  }
  return extractOpenRouterImageUrl(await resp.json())
}

export const openrouterProvider: ProviderDef = {
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'qwen/qwen3.6-plus:free',
  models: [
    { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus (免费)' },
    { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
    { id: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini (图片生成)' },
    { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image / Nano Banana (图片生成)' },
    { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5 (图片生成)' },
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (免费)' },
    { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (免费)' },
    { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick (免费)' },
  ],
  apiKeyHint: 'openrouter.ai/settings/keys',
  apiKeyHelpUrl: 'https://openrouter.ai/settings/keys',
  capabilities: { chat: true, image: true },
  generateImage: openrouterGenerateImage,
}
