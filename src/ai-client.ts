import type { AIMessage, AITool } from './ai-types'

export function aiBridge() {
  const bridge = window.desktop?.ai
  if (!bridge) throw new Error('请重启 yarn dev 后，在 Electron 桌面窗口使用 AI 功能')
  return bridge
}

export async function aiComplete(messages: AIMessage[], tools: AITool[], toolChoice: 'auto' | 'required', signal: AbortSignal) {
  signal.throwIfAborted()
  const bridge = aiBridge()
  const requestId = crypto.randomUUID()
  let rejectAbort!: (error: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const abort = () => {
    void bridge.cancel(requestId).catch(() => undefined)
    rejectAbort(signal.reason || new DOMException('已停止', 'AbortError'))
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    return await Promise.race([bridge.complete({ requestId, messages, tools, toolChoice }), aborted])
  } finally { signal.removeEventListener('abort', abort) }
}
