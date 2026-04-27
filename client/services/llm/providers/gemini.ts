// client/services/llm/providers/gemini.ts
import type { LlmConfig, ProviderDef, ReferenceImage } from '../types'

async function geminiGenerateImage(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const textPart = { text: prompt }
  const imgParts = (referenceImages ?? []).map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.data },
  }))
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [textPart, ...imgParts] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `HTTP ${resp.status}`)
  }
  const data = await resp.json() as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find(p => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) return null
  const mime = imgPart.inlineData.mimeType ?? 'image/png'
  return `data:${mime};base64,${imgPart.inlineData.data}`
}

export const geminiProvider: ProviderDef = {
  id: 'gemini',
  label: 'Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  defaultModel: 'gemini-3.1-pro-preview',
  models: [
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview (65k)',
      capabilities: { chat: true, image: true },
    },
    {
      id: 'gemini-3.1-flash-image-preview',
      label: 'Gemini 3.1 Flash Image (图片生成)',
      capabilities: { chat: false, image: true },
    },
    {
      id: 'gemini-2.5-flash-image',
      label: 'Gemini 2.5 Flash Image (图片生成)',
      capabilities: { chat: false, image: true },
    },
  ],
  apiKeyHint: 'aistudio.google.com/apikey',
  apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
  capabilities: { chat: true, image: true },
  maxOutputTokens: 65536,
  generateImage: geminiGenerateImage,
}
