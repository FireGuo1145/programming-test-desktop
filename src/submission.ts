import type { AnswerPaper } from './types'

export const saveErrors: Record<number, string> = {
  1: '作答记录不存在', 2: '作答已提交，请查看结果', 3: '练习不存在',
  4: '登录已失效，请重新登录', 5: '作答连接已超时', 6: '此作答已查看参考代码',
  7: '作答时间已结束', 8: '保存校验失败，请检查系统时间后重试',
  9: '练习截止时间已过', 10: '练习尚未开始',
}

/** Serializes auto-save and final save so an older request cannot overwrite the final answer. */
export function createSaveQueue(send: (paper: AnswerPaper) => Promise<{ code: number; timeLeft: number }>) {
  let tail: Promise<unknown> = Promise.resolve()
  return (paper: AnswerPaper) => {
    const snapshot = structuredClone(paper)
    const pending = tail.catch(() => undefined).then(async () => {
      const result = await send(snapshot)
      if (result.code !== 0) throw new Error(saveErrors[result.code] || `保存失败 (${result.code})`)
      return result
    })
    tail = pending
    return pending
  }
}

export async function submitAfterSave(save: () => Promise<unknown>, submit: () => Promise<unknown>) {
  await save()
  const result = await submit()
  // The original endpoint returns no payload on some builds and a boolean on others.
  if (result === false) throw new Error('服务器未接受提交，请重试')
}
