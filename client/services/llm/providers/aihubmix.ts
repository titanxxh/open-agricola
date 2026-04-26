// client/services/llm/providers/aihubmix.ts
import type { LlmConfig, ProviderDef, ReferenceImage } from '../types'

const AIHUBMIX_BASE_URL = 'https://aihubmix.com/v1'

type OaiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function aihubmixGenerateImage(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const userParts: OaiContentPart[] = [{ type: 'text', text: prompt }]
  for (const img of referenceImages ?? []) {
    userParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    })
  }
  const resp = await fetch(`${AIHUBMIX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: userParts }],
      modalities: ['text', 'image'],
      temperature: 0.7,
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`AiHubMix API error ${resp.status}: ${err}`)
  }
  const data = await resp.json() as {
    choices?: Array<{
      message?: {
        multi_mod_content?: Array<{
          // AiHubMix returns snake_case field names (verified via smoke test)
          inline_data?: { data?: string; mime_type?: string }
        }>
      }
    }>
  }
  const parts = data.choices?.[0]?.message?.multi_mod_content ?? []
  const imgPart = parts.find(p => p.inline_data?.data)
  if (!imgPart?.inline_data?.data) return null
  const mime = imgPart.inline_data.mime_type ?? 'image/png'
  return `data:${mime};base64,${imgPart.inline_data.data}`
}

export const aihubmixProvider: ProviderDef = {
  id: 'aihubmix',
  label: 'AiHubMix',
  baseUrl: AIHUBMIX_BASE_URL,
  defaultModel: 'coding-glm-5.1-free',
  models: [
    {
      id: 'gemini-3.1-flash-image-preview-free',
      label: 'Gemini 3.1 Flash Image (免费)',
      capabilities: { chat: false, image: true },
    },
    {
      id: 'coding-glm-5.1-free',
      label: 'Coding GLM 5.1 (免费)',
      capabilities: { chat: true, image: false },
    },
    {
      id: 'k2.6-code-preview-free',
      label: 'K2.6 Code Preview (免费)',
      capabilities: { chat: true, image: false },
    },
  ],
  apiKeyHint: 'aihubmix.com/token',
  apiKeyHelpUrl: 'https://aihubmix.com/token',
  capabilities: { chat: true, image: true },
  generateImage: aihubmixGenerateImage,
  // No streamChat override — chat goes through the dispatcher's
  // default OpenAI-compat path (POST {baseUrl}/chat/completions,
  // Bearer auth, stream:true).
}
