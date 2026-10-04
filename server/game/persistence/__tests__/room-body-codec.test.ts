import { describe, expect, it } from 'vitest'
import { encodeRoomBody, parseRoomBody } from '../room-body-codec'

describe('small Room body compression', () => {
  it('keeps raw JSON when the compression envelope would be larger', () => {
    const json = '{"state":{"round":1}}'
    expect(encodeRoomBody(json)).toBe(json)
    expect(parseRoomBody(json)).toEqual({ state: { round: 1 } })
  })

  it('compresses an already serialized body deterministically and restores exact JSON values', () => {
    const body = JSON.parse('{"__proto__":{"name":"原始名字"},"constructor":"saved"}') as Record<string, unknown>
    body.state = { labels: Array.from({ length: 300 }, () => '原始名字 / stable snapshot'), round: 11 }
    const json = JSON.stringify(body)
    const encoded = encodeRoomBody(json)
    expect(JSON.parse(encoded)).toMatchObject({ roomBodyEncoding: 'gzip-base64-v1', data: expect.any(String) })
    expect(Buffer.byteLength(encoded)).toBeLessThan(Buffer.byteLength(json))
    expect(encodeRoomBody(json)).toBe(encoded)
    expect(JSON.stringify(parseRoomBody(encoded))).toBe(json)
    expect(Object.getPrototypeOf(parseRoomBody(encoded))).toBe(Object.prototype)
  })

  it.each([
    '{"roomBodyEncoding":"unsupported","data":""}',
    '{"roomBodyEncoding":"gzip-base64-v1","data":42}',
    '{"roomBodyEncoding":"gzip-base64-v1","data":"invalid"}',
  ])('rejects malformed or unsupported encoded bodies: %s', json => {
    expect(() => parseRoomBody(json)).toThrow()
  })
})
