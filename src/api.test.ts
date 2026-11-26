import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, exerciseApi, request, verificationCode } from './api'
import { computePowNonce, hasLeadingZeroBits, sha256Bytes } from './CaptchaModal'

describe('verificationCode', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('matches the MD5 token format used by the student API', async () => {
    vi.stubGlobal('window', {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 23, 10))
    expect(await verificationCode('session')).toBe('49bb9704165b05b4f2c555ed25724758')
  })
})

describe('student API error & payload handling', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws ApiError with status and parsed data for desktop 428/429 responses', async () => {
    const desktopReq = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 428,
      data: { captcha: { captchaId: 'c1', type: 'SLIDER', bgImage: 'data:bg', sliderImage: 'data:sl' } },
    }).mockResolvedValueOnce({
      ok: false,
      status: 429,
      data: { waitSeconds: 12 },
    }).mockResolvedValueOnce({
      ok: false,
      status: 403,
      data: { code: -3 },
    })
    vi.stubGlobal('window', { desktop: { request: desktopReq } })

    await expect(exerciseApi.submit('sess-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 428,
      data: { captcha: { captchaId: 'c1' } },
    })
    await expect(exerciseApi.submit('sess-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      data: { waitSeconds: 12 },
    })
    await expect(request('api/student/gate')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: '请使用电脑端作答（移动端不支持答题）',
    })
  })

  it('sends captcha payload on submit when provided and normalizes nested record-tag and 2D record-year', async () => {
    const desktopReq = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, data: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [
          { tag: { id: 7, content: '循环', contentEn: 'Loop' }, count: 3 },
          { id: 8, content: '数组', count: 2 },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [[{ date: '2026-11-25', count: 1, score: 10 }], [{ date: '2026-11-26', count: 2, score: 20 }]],
      })
    vi.stubGlobal('window', { desktop: { request: desktopReq } })

    const track = {
      bgImageWidth: 300,
      bgImageHeight: 180,
      sliderImageWidth: 55,
      sliderImageHeight: 180,
      startTime: 1000,
      stopTime: 1500,
      trackList: [{ x: 0, y: 0, t: 0, type: 'down' as const }, { x: 120, y: 1, t: 500, type: 'up' as const }],
      powNonce: '42',
    }
    await exerciseApi.submit('sess-2', { captchaId: 'cap-2', captchaTrack: track })
    expect(desktopReq.mock.calls[0][0]).toEqual({
      path: 'api/student/submit?sessionId=sess-2&sid=',
      method: 'POST',
      body: JSON.stringify({ captchaId: 'cap-2', captchaTrack: track }),
    })

    const tags = await exerciseApi.historyTags()
    expect(tags).toEqual([
      { id: 7, content: '循环', contentEn: 'Loop', count: 3 },
      { id: 8, content: '数组', contentEn: undefined, count: 2 },
    ])

    const overview = await exerciseApi.historyOverview()
    expect(overview).toEqual([
      { date: '2026-11-25', count: 1, score: 10 },
      { date: '2026-11-26', count: 2, score: 20 },
    ])
  })

  it('computes SHA-256 PoW nonce matching leading zero bits', async () => {
    const nonce = await computePowNonce('test-salt', 8)
    expect(hasLeadingZeroBits(sha256Bytes(`test-salt:${nonce}`), 8)).toBe(true)
    expect(ApiError).toBeDefined()
  })
})
