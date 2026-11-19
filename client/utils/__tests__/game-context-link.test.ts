import { describe, expect, test } from 'vitest'
import { gameContextLinkFromQuery } from '../game-room-url'

describe('Game Context Link query', () => {
  test('resolves the room id and participant-only alias', () => {
    expect(gameContextLinkFromQuery('?room=public-room&perspective=open')).toEqual({
      roomId: 'public-room',
      participantOnly: false,
    })
    expect(gameContextLinkFromQuery('?room=public-room&context=private-room&page=game')).toEqual({
      roomId: 'private-room',
      participantOnly: true,
    })
  })

  test('keeps an empty room id in the application route for its invalid link response', () => {
    expect(gameContextLinkFromQuery('?room=')).toEqual({ roomId: '', participantOnly: false })
  })

  test.each(['', '?transport=ws', '?room=public-room&page=settings', '?room=dev2', '?context=dev3-2ee2f290-86ba-49ce-abd9-2a63ba880969'])(
    'does not treat %s as a Game Context Link',
    (search) => { expect(gameContextLinkFromQuery(search)).toBeNull() },
  )
})
