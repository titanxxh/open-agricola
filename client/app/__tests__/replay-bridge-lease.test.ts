// @vitest-environment jsdom
import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplayBridgeTransport } from '../../../replay-viewer/src/bridge-transport'
import { parseReplayBridgeRequest, type ReplayBridgeContext } from '../../../shared/contract/protocol/replay-bridge'

const context: ReplayBridgeContext = { protocolVersion:1,nonce:'c'.repeat(32),environment:'prerelease',targetId:'pre',
  appBuildId:'a'.repeat(40),generationId:'11111111-1111-1111-1111-111111111111',roomId:'room-1',viewerBuildId:'b'.repeat(64),schemaVersion:1,mode:{kind:'archive'} }
const cleanups: (()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).forEach(clean=>clean());vi.useRealTimers()})
async function fixture() {
  vi.useFakeTimers({toFake:['performance','setTimeout','clearTimeout','setInterval','clearInterval']})
  const channel = new MessageChannel()
  const transport = new ReplayBridgeTransport(context,window.location.origin)
  cleanups.push(()=>{transport.close();channel.port1.close();channel.port2.close()})
  const first = new Promise<unknown>(resolve=>channel.port1.once('message',resolve))
  window.dispatchEvent(new MessageEvent('message',{source:window.parent,origin:window.location.origin,
    data:{type:'open-agricola-replay-bridge-connect',context},ports:[channel.port2]}))
  const request = parseReplayBridgeRequest(await first)
  if(request?.type !== 'lease') throw new Error('Viewer did not request a lease')
  const reply = async (remainingMs:number)=>{
    const received = new Promise<void>(resolve=>channel.port2.addEventListener('message',()=>resolve(),{once:true}))
    channel.port1.postMessage({type:'lease',nonce:context.nonce,requestId:request.requestId,remainingMs})
    await received
  }
  return {transport,reply,port:channel.port1}
}

describe('Viewer shared authorization lease',()=>{
  it('subtracts the entire message round trip and cannot create a new lease on receipt',async()=>{
    const {transport,reply}=await fixture()
    vi.advanceTimersByTime(200)
    await reply(500)
    expect(transport.check()).toBe(true)
    vi.advanceTimersByTime(299)
    expect(transport.check()).toBe(true)
    vi.advanceTimersByTime(2)
    expect(transport.check()).toBe(false)
  })
  it('clears an idle display when the parent stops replying despite a longer identity lease',async()=>{
    const {transport,reply}=await fixture()
    await reply(30_000)
    const closed=vi.fn()
    transport.subscribe(closed)
    vi.advanceTimersByTime(3_001)
    expect(transport.check()).toBe(false)
    expect(closed).toHaveBeenCalledTimes(1)
  })
  it.each(['pageshow','visibilitychange'])('retires cached display on %s and rejects a late old-session lease',async event=>{
    const {transport,reply,port}=await fixture()
    await reply(30_000)
    const closed=vi.fn()
    transport.subscribe(closed)
    if(event==='pageshow') window.dispatchEvent(new Event(event))
    else document.dispatchEvent(new Event(event))
    port.postMessage({type:'lease',nonce:context.nonce,requestId:'r1',remainingMs:30_000})
    expect(transport.check()).toBe(false)
    expect(closed).toHaveBeenCalledTimes(1)
    await expect(transport.read({kind:'manifest'},new AbortController().signal)).rejects.toThrow()
  })
})
