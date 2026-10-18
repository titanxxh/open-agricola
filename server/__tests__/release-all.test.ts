import { describe, expect, it } from 'vitest'
import { releaseAll, releaseQueue } from './_helpers/release-all'

describe('releaseAll', () => {
  it('runs every step after a failure and rethrows a single failure unchanged', async () => {
    const released: string[] = []
    const failure = new Error('object store unavailable')
    const steps = [
      () => { released.push('objects'); throw failure },
      async () => { released.push('pool') },
      () => { released.push('database') },
    ]

    await expect(releaseAll(steps)).rejects.toBe(failure)
    expect(released).toEqual(['objects', 'pool', 'database'])
    expect(steps).toEqual([])
  })

  it('keeps every failure in order', async () => {
    const first = new Error('clear prefix failed')
    const second = new Error('drop failed')
    const released: string[] = []

    const error = await releaseAll([
      () => { throw first },
      () => { released.push('pool') },
      async () => { throw second },
    ]).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([first, second])
    expect(released).toEqual(['pool'])
  })

  it('waits for each step and also drains steps registered while it runs', async () => {
    const order: string[] = []
    const steps: Array<() => unknown> = []
    steps.push(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      order.push('first finished')
      steps.push(() => { order.push('late registration') })
    }, () => { order.push('second') })

    await releaseAll(steps)

    expect(order).toEqual(['first finished', 'second', 'late registration'])
    expect(steps).toEqual([])
  })
})

describe('releaseQueue', () => {
  it('releases the most recent registration first and reports every failure', async () => {
    const released: string[] = []
    const failure = new Error('drop failed')
    const queue = releaseQueue()
    queue.register(() => { released.push('fixture') })
    queue.register(() => { released.push('target'); throw failure })

    await expect(queue.release()).rejects.toBe(failure)
    expect(released).toEqual(['target', 'fixture'])
  })

  it('releases a registration made after teardown began right away', async () => {
    const released: string[] = []
    const late: unknown[] = []
    const lateFailure = new Error('late drop failed')
    const queue = releaseQueue(error => { late.push(error) })
    queue.register(() => { released.push('fixture') })
    await queue.release()

    // What a timed-out test body does once its next resource is ready.
    queue.register(() => { released.push('late target') })
    queue.register(async () => { throw lateFailure })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(released).toEqual(['fixture', 'late target'])
    expect(late).toEqual([lateFailure])
  })
})
