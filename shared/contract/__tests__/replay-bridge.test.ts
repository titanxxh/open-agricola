import { describe, expect, it } from 'vitest'
import { parseReplayBridgeContext, parseReplayBridgeRequest, sameReplayBridgeContext } from '../protocol/replay-bridge'
import { readReplayViewerManifest, supportsReplayBridge } from '../replay-viewer-build'
const context = { protocolVersion: 1, nonce: 'c'.repeat(32), environment: 'prerelease', targetId: 'pre',
  appBuildId: 'a'.repeat(40), generationId: '11111111-1111-1111-1111-111111111111', roomId: 'room-1',
  viewerBuildId: 'b'.repeat(64), schemaVersion: 1, mode: { kind: 'archive' } }
describe('replay bridge boundary contract', () => {
  it.each([{environment:'stable'},{appBuildId:'a'.repeat(64)},{viewerBuildId:'b'.repeat(40)}, {mode:{kind:'evidence',stepNo:1,frameHash:'f'.repeat(64),perspective:'open'}}, {url:'https://arbitrary.test'}])('rejects invalid context %j', patch => {
    expect(parseReplayBridgeContext({...context,...patch})).toBeNull()
  })
  it('binds the entire context including mode and generation', () => {
    const parsed = parseReplayBridgeContext(context)
    expect(parsed).not.toBeNull()
    if (!parsed) throw new Error('context failed')
    for (const patch of [{roomId:'room-2'},{nonce:'d'.repeat(32)},{targetId:'another'},{schemaVersion:2},{generationId:'22222222-1111-1111-1111-111111111111'},{mode:{kind:'evidence',stepNo:0,frameHash:'f'.repeat(64),perspective:'p1'}}]) {
      expect(sameReplayBridgeContext(parsed,{...context,...patch})).toBe(false)
    }
    expect(sameReplayBridgeContext(parsed,context)).toBe(true)
  })
  it('accepts only the finite readonly request vocabulary', () => {
    expect(parseReplayBridgeRequest({type:'read',nonce:context.nonce,requestId:'r1',read:{kind:'segment',checkpointStepNo:0}})).toEqual({type:'read',nonce:context.nonce,requestId:'r1',read:{kind:'segment',checkpointStepNo:0}})
    for (const read of [{kind:'fetch',url:'/private'}, {kind:'asset',hash:'../escape'}, {kind:'anchor',stepNo:0,frameHash:'f'.repeat(64),perspective:'open'}]) {
      expect(parseReplayBridgeRequest({type:'read',nonce:context.nonce,requestId:'r1',read})).toBeNull()
    }
  })
  it('preserves old public manifests while requiring an explicit supported bridge declaration', () => {
    const old = readReplayViewerManifest({entrypoint:'index.html',files:{'index.html':'f'.repeat(64)}})
    expect(old).not.toBeNull()
    if (!old) throw new Error('old manifest failed')
    expect(supportsReplayBridge(old,1)).toBe(false)
    expect(supportsReplayBridge({...old,bridge:{protocolVersion:1,replaySchemaVersions:[1]}},1)).toBe(true)
    expect(supportsReplayBridge({...old,bridge:{protocolVersion:2,replaySchemaVersions:[1]}},1)).toBe(false)
    expect(supportsReplayBridge({...old,bridge:{protocolVersion:1,replaySchemaVersions:[2]}},1)).toBe(false)
    expect(readReplayViewerManifest({...old,bridge:{protocolVersion:1,replaySchemaVersions:['1']}})).toBeNull()
  })
})
