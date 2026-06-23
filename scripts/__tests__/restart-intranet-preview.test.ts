import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync('restart-intranet.sh', 'utf8')

describe('restart-intranet preview mode', () => {
  it('documents and parses --preview', () => {
    expect(script).toContain('[--preview]')
    expect(script).toContain('--preview')
    expect(script).toMatch(/PREVIEW_ENABLED=0/)
    expect(script).toMatch(/--preview\)\s*PREVIEW_ENABLED=1/s)
  })

  it('builds the frontend and serves dist through vite preview', () => {
    expect(script).toContain('VITE_API_BASE="http://$LAN_IP:$BACKEND_PORT"')
    expect(script).toContain('VITE_WS_BASE="ws://$LAN_IP:$BACKEND_PORT/ws"')
    expect(script).toContain('"$PNPM_BIN" run build')
    expect(script).toContain('"$FRONTEND_BIN" preview')
  })

  it('uses CDN only when configured and otherwise serves local BGA images', () => {
    expect(script).not.toContain('x.boardgamearena.net')
    expect(script).not.toMatch(/BGA_CDN_BASE_URL:-https?:/)
    expect(script).toContain('if [ -n "${BGA_CDN_BASE_URL:-}" ]; then')
    expect(script).toContain('BGA_CDN_BASE_URL="$BGA_CDN_BASE_URL"')
    expect(script).toContain('"$SCRIPT_DIR/dist/bga-img"')
    expect(script).toContain('cp -R "$BGA_IMAGE_DIR"/. "$SCRIPT_DIR/dist/bga-img"/')
  })
})
