import { afterEach, describe, expect, it, vi } from 'vitest'
import { verificationCode } from './api'

describe('verificationCode', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('matches the MD5 token format used by the student API', async () => {
    vi.stubGlobal('window', {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 10))
    expect(await verificationCode('session')).toBe('49bb9704165b05b4f2c555ed25724758')
  })
})
