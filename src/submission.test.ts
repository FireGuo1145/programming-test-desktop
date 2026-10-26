import { describe, expect, it, vi } from 'vitest'
import { createSaveQueue, submitAfterSave } from './submission'
import type { AnswerPaper } from './types'

function paper(code: string): AnswerPaper {
  return { q0: [], q1: [], q2: [], q3: [], q4: [{ globalId: 'q', qType: 5, answer: code }], q5: [] }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('submission ordering', () => {
  it('waits for an in-flight autosave and final save before submitting', async () => {
    const autosave = deferred<{ code: number; timeLeft: number }>()
    const finalSave = deferred<{ code: number; timeLeft: number }>()
    const send = vi.fn().mockReturnValueOnce(autosave.promise).mockReturnValueOnce(finalSave.promise)
    const save = createSaveQueue(send)
    const submit = vi.fn().mockResolvedValue(null)
    const pendingAuto = save(paper('old'))
    const pendingSubmit = submitAfterSave(() => save(paper('latest')), submit)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(submit).not.toHaveBeenCalled()
    autosave.resolve({ code: 0, timeLeft: 10 })
    await pendingAuto
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls[1][0].q4[0].answer).toBe('latest')
    expect(submit).not.toHaveBeenCalled()
    finalSave.resolve({ code: 0, timeLeft: 10 })
    await pendingSubmit
    expect(submit).toHaveBeenCalledOnce()
  })
  it('does not submit after a rejected server save', async () => {
    const save = createSaveQueue(vi.fn().mockResolvedValue({ code: 8, timeLeft: 0 }))
    const submit = vi.fn()
    await expect(submitAfterSave(() => save(paper('latest')), submit)).rejects.toThrow('校验失败')
    expect(submit).not.toHaveBeenCalled()
  })
  it('does not submit after a network failure', async () => {
    const submit = vi.fn()
    await expect(submitAfterSave(() => Promise.reject(new Error('offline')), submit)).rejects.toThrow('offline')
    expect(submit).not.toHaveBeenCalled()
  })
  it('allows retry after an earlier autosave failed', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ code: 0, timeLeft: 10 })
    const save = createSaveQueue(send)
    await expect(save(paper('old'))).rejects.toThrow('offline')
    await expect(save(paper('latest'))).resolves.toEqual({ code: 0, timeLeft: 10 })
  })
  it('rejects an explicit submit failure', async () => {
    await expect(submitAfterSave(async () => undefined, async () => false)).rejects.toThrow('未接受提交')
  })
})
