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
    expect(script).toMatch(/VITE_ENABLE_DEV_AUTH_SHORTCUTS=1[\s\\]+"?\$PNPM_BIN"? run build/)
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
    expect(script).toContain('REPLAY_VIEWER_ALLOW_MISSING_BGA_ART=1')
  })

  it('documents and wires --moor for fixed dev rooms', () => {
    expect(script).toContain('[--parents] [--seasons] [--moor] [--draft] [--preview]')
    expect(script).toContain('--moor')
    expect(script).toMatch(/MOOR_ENABLED=0/)
    expect(script).toMatch(/--moor\)\s*MOOR_ENABLED=1/s)
    expect(script).toContain('DEV_ENABLE_FARMERS_OF_THE_MOOR="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)"')
    expect(script).toContain('DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)"')
    expect(script).toContain('&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true')
  })

  it('does not require incomplete-minor startup options from serialized Moor game state', () => {
    const resetScanner = script.match(/dev_rooms_without_farmers_of_the_moor\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(resetScanner).toContain('state.enableFarmersOfTheMoor !== true')
    expect(resetScanner).not.toContain('state.allowIncompleteFarmersOfTheMoorMinorDeal')
  })
})
