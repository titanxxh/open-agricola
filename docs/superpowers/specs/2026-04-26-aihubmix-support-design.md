# AiHubMix Provider Support — Design Spec

**Date:** 2026-04-26
**Branch:** `feat/aihubmix`
**Status:** approved, ready for implementation plan

## 1. Background & Goal

AiHubMix (<https://aihubmix.com>) is an OpenAI-compatible LLM aggregator (similar in spirit to OpenRouter) that exposes many third-party models — including a free tier with Gemini 3.1 Flash Image, Coding GLM 5.1, and K2.6 Code Preview.

Goal: add AiHubMix as a first-class provider in the workshop's AI card designer so users can:

- generate card art via `gemini-3.1-flash-image-preview-free`
- generate card code via `coding-glm-5.1-free` and `k2.6-code-preview-free`

without needing a Google or OpenAI key.

This work also incidentally fixes two existing issues:

1. The `ProviderDef.models[]` shape has no per-model capability tag, so OpenRouter / Gemini / etc. show all models in both image and code panels even when most are chat-only. The image and code panels need filtered dropdowns to prevent obvious mis-picks.
2. `geminiGenerateImage` (`client/services/llm/providers/gemini.ts`) hardcodes the URL to `gemini-3.1-flash-image-preview` regardless of which Gemini model the user selected — a silent override.

## 2. Constraints

- **BYOK (Bring Your Own Key)** — AiHubMix key lives only in browser `localStorage`, same as every other provider. Server never sees the key. (CLAUDE.md invariant.)
- **No backend changes** — `/api/workshop/art` already accepts arbitrary `data:image/...;base64,...` URLs; it doesn't care which provider produced them.
- **Backwards compatible types** — `ModelDef.capabilities` must be optional, falling back to provider-level capability so the 6 existing providers (openai / anthropic / gemini / groq / openrouter / deepseek / custom) need zero forced edits.

## 3. Architecture

### 3.1 Type changes (`client/services/llm/types.ts`)

Add `ProviderId = ... | 'aihubmix'`.

Replace inline `{id, label}` model tuples with a named type that carries optional capabilities:

```ts
export type Capabilities = { chat: boolean; image: boolean }

export type ModelDef = {
  id: string
  label: string
  capabilities?: Partial<Capabilities>  // optional; falls back to provider-level
}

export type ProviderDef = {
  // ...
  models: ReadonlyArray<ModelDef>
  capabilities: Capabilities
  // ... unchanged otherwise
}
```

### 3.2 Helper (`client/services/llm/registry.ts`, re-exported from `index.ts`)

```ts
export function listModelsFor(
  provider: ProviderDef,
  cap: keyof Capabilities,
): ReadonlyArray<ModelDef> {
  return provider.models.filter(m => {
    const tag = m.capabilities ?? {}
    return tag[cap] ?? provider.capabilities[cap]
  })
}
```

### 3.3 New provider (`client/services/llm/providers/aihubmix.ts`)

```ts
import type { LlmConfig, ProviderDef, ReferenceImage } from '../types'

async function aihubmixGenerateImage(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const userParts: Array<unknown> = [{ type: 'text', text: prompt }]
  for (const img of referenceImages ?? []) {
    userParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    })
  }
  const resp = await fetch('https://aihubmix.com/v1/chat/completions', {
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
          inlineData?: { data?: string; mimeType?: string }
        }>
      }
    }>
  }
  const parts = data.choices?.[0]?.message?.multi_mod_content ?? []
  const imgPart = parts.find(p => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) return null
  const mime = imgPart.inlineData.mimeType ?? 'image/png'
  return `data:${mime};base64,${imgPart.inlineData.data}`
}

export const aihubmixProvider: ProviderDef = {
  id: 'aihubmix',
  label: 'AiHubMix',
  baseUrl: 'https://aihubmix.com/v1',
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
  // Bearer auth, stream:true), confirmed against AiHubMix docs.
}
```

Register in `client/services/llm/registry.ts`.

### 3.4 Existing Gemini provider cleanup (`client/services/llm/providers/gemini.ts`)

**Trim model list to two entries:**

```ts
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
],
```

(Remove `gemini-2.5-pro` and `gemini-2.5-flash` entries.)

**Fix hardcoded model URL in `geminiGenerateImage`:**

Replace `gemini-3.1-flash-image-preview` in the URL with `${config.model}` so the user's selected model is honored. Both `gemini-3.1-pro-preview` and `gemini-3.1-flash-image-preview` support `:generateContent` with `responseModalities: ['TEXT', 'IMAGE']`.

### 3.5 UI changes (`client/app/workshop/AiCardDesigner.tsx`)

1. **ConfigBar provider button list** (currently line ~227): add `'aihubmix'` to the array, picker becomes 4 buttons.
2. **ArtPanel model dropdown**: render `listModelsFor(provider, 'image')`. If empty → disable the dropdown and the generate button, show inline message: 「该 provider 不支持图像生成，请切换 provider」.
3. **AbilityPanel model dropdown**: render `listModelsFor(provider, 'chat')`. Same disable + message rule for empty list.
4. **Provider switch behavior**: when the user changes provider, if the currently selected model is not in the filtered list for the panel's capability, auto-jump to `provider.defaultModel` if that model supports the capability; otherwise leave the field empty (UI will show the disabled state from #2/#3).

## 4. Data Flow

### 4.1 Chat (GLM / K2)

Identical to DeepSeek / OpenRouter:

1. User types a prompt in AbilityPanel.
2. `streamChat(messages, systemPrompt, config)` → dispatcher → no override → default OAI-compat path.
3. `POST https://aihubmix.com/v1/chat/completions` with `Authorization: Bearer ${key}`, `stream: true`, `model: config.model`.
4. SSE deltas at `choices[0].delta.content` stream into the chat UI.
5. `extractCardFromResponse` parses the typescript code block out of the final text and populates the form.

No backend involvement.

### 4.2 Image (Gemini Flash Image Free)

1. User clicks "生成" in ArtPanel.
2. `generateCardArt(prompt, config, refImages?)` → dispatcher → AiHubMix has `generateImage` override → `aihubmixGenerateImage` runs.
3. `POST https://aihubmix.com/v1/chat/completions` with `modalities: ['text', 'image']` and the prompt as `content[].type='text'`.
4. Response: `choices[0].message.multi_mod_content[]`, find the part with `inlineData.data`, build `data:${mime};base64,${data}`.
5. ArtPanel calls `uploadArt(dataUrl)` → `POST /api/workshop/art` (existing endpoint, unchanged).
6. Server writes file, returns `{ ok: true, url: "/card-art/<uuid>.png" }`.
7. UI displays at `${API_BASE}${url}`.

## 5. Error Handling

- Non-2xx HTTP from AiHubMix → `throw new Error("AiHubMix API error <status>: <body>")`. Existing UI try/catch in `AiCardDesigner` surfaces as a toast.
- Response with no image part → `return null`. ArtPanel already shows "未生成图像".
- User selects a chat-only provider in image panel → blocked at UI layer (§3.5.2), never reaches fetch.
- Free-tier rate limit (429 etc.) → error body is passed through to the user; same behavior as OpenRouter free models.

## 6. Testing

### 6.1 Unit tests

`client/services/llm/__tests__/registry.test.ts` (new or extended):

- `listModelsFor(geminiProvider, 'image')` → contains both `gemini-3.1-pro-preview` and `gemini-3.1-flash-image-preview`
- `listModelsFor(geminiProvider, 'chat')` → contains only `gemini-3.1-pro-preview`
- `listModelsFor(aihubmixProvider, 'image')` → contains only `gemini-3.1-flash-image-preview-free`
- `listModelsFor(aihubmixProvider, 'chat')` → contains only `coding-glm-5.1-free` and `k2.6-code-preview-free`
- `listModelsFor(deepseekProvider, 'image')` → empty array
- `listModelsFor(openrouterProvider, 'chat')` → all 6 models (capability fallback)

### 6.2 Provider unit test

`client/services/llm/__tests__/aihubmix.test.ts` (new):

- Mock `fetch`, return a fake `choices[0].message.multi_mod_content` with one inline image part. Assert `aihubmixGenerateImage` returns the expected `data:image/png;base64,...` URL.
- Mock `fetch` returning HTTP 401. Assert it throws with `AiHubMix API error 401:`.
- Mock `fetch` returning a response with no image part. Assert it returns `null`.

### 6.3 AiCardDesigner render test

Extend `client/app/workshop/__tests__/AiCardDesigner.test.tsx`:

- Assert AiHubMix button renders in the provider picker.
- Switch to DeepSeek in the image panel context → "生成" button is disabled and the inline mismatch message is visible.

### 6.4 Real-API smoke test (manual, not in CI)

`scripts/aihubmix-smoke-test.ts` (new):

1. Read `MY_TEST_AIHUBMIX_APIKEY` from `.env` (use the same `loadGhTokenFromDotenv`-style helper as `scripts/sync-bga-cdn-github-var.ts`).
2. Three real network calls:
   - **GLM chat**: `coding-glm-5.1-free` with prompt "Write a TypeScript function that returns the string 'hello'." Assert the streamed response is non-empty and contains the substring `function`.
   - **K2 chat**: `k2.6-code-preview-free` with the same prompt. Assert non-empty stream.
   - **Gemini image**: `gemini-3.1-flash-image-preview-free` with prompt "a red apple on white background". Assert the return value matches `^data:image\/[a-z]+;base64,` and the base64 payload is longer than 1024 chars.
3. On full success, print `✅ All 3 free models reachable via AiHubMix`. On any failure, dump the response body for debugging and exit 1.
4. Add `package.json` script alias `"smoke:aihubmix": "tsx scripts/aihubmix-smoke-test.ts"`.

This script doubles as the verification mechanism for §7 open question #1 (the `multi_mod_content` field name). If the image case fails because the parser misses the image part, dump the full response JSON to figure out the actual field shape and update `aihubmixGenerateImage` accordingly.

**Definition of done for the implementation:** unit tests green AND `pnpm run smoke:aihubmix` prints the success line.

## 7. Open Questions

These are deferred to implementation time, not blockers for the design.

1. **`multi_mod_content` field name** — the AiHubMix docs describe Gemini image responses as `choices[0].message.multi_mod_content[].inlineData`, but real OAI-compat derivatives sometimes diverge. The smoke test (§6.4) is the verification. Adjust the parser one-liner if the field is named differently.
2. **Free-tier rate limits** — undocumented. No special handling now; if users complain about 429s we can add retry-with-backoff later.
3. **Attribution headers** — OpenRouter requires `HTTP-Referer` / `X-Title`. AiHubMix docs don't mention any. Sending none for now; add only if an endpoint rejects the request.

## 8. Files Touched

- `client/services/llm/types.ts` — add `Capabilities`, `ModelDef`; `ProviderId` adds `'aihubmix'`; `ProviderDef.models` typed as `ReadonlyArray<ModelDef>`
- `client/services/llm/registry.ts` — register `aihubmixProvider`; add `listModelsFor` helper
- `client/services/llm/index.ts` — re-export `listModelsFor`
- `client/services/llm/providers/aihubmix.ts` — new file
- `client/services/llm/providers/gemini.ts` — trim model list, fix hardcoded model URL in `geminiGenerateImage`
- `client/app/workshop/AiCardDesigner.tsx` — add 'aihubmix' to picker, filter dropdowns by capability, disable UI on mismatch, auto-jump to defaultModel on provider switch
- `client/services/llm/__tests__/registry.test.ts` — new or extended
- `client/services/llm/__tests__/aihubmix.test.ts` — new
- `client/app/workshop/__tests__/AiCardDesigner.test.tsx` — extend
- `scripts/aihubmix-smoke-test.ts` — new
- `package.json` — add `smoke:aihubmix` script

No backend or `shared/` changes. No CLAUDE.md or `docs/card_progress.md` updates needed (this is workshop infra, not card content).
