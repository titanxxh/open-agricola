// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })
it('reads saved status and explicitly recovers the same card through the configured backend', async () => {
  vi.stubEnv('VITE_API_BASE','https://backend.example')
  const requests = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ok:false,code:'creation_unknown'}))
  vi.stubGlobal('fetch',requests)
  const {submissionStatus,startPropose} = await import('../workshop-pr')
  await submissionStatus('card-id')
  expect(requests).toHaveBeenLastCalledWith('https://backend.example/api/workshop/cards/card-id/submit-review',{credentials:'include'})
  requests.mockResolvedValue(Response.json({ok:false,code:'creation_unknown'}))
  await startPropose('card-id','recover')
  expect(requests).toHaveBeenLastCalledWith('https://backend.example/api/workshop/cards/card-id/submit-review',{
    credentials:'include',method:'POST',body:JSON.stringify({action:'recover'}),headers:{'Content-Type':'application/json'},
  })
})
