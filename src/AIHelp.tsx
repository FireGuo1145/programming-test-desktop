import { useEffect, useRef, useState } from 'react'
import { Settings2, Sparkles, Square, Undo2 } from 'lucide-react'
import AISettings from './AISettings'
import { aiBridge, aiComplete } from './ai-client'
import { solveObjectiveWithTools, solveWithTools } from './ai-agent'
import type { ObjectiveContext, SolverContext } from './ai-agent'
import type { AIEvent } from './ai-types'

export default function AIHelp({ context, disabled, onApply, onBusyChange, run, objective, allContexts, onApplyAll }: {
  context: SolverContext | ObjectiveContext
  disabled: boolean
  onApply: (value: string) => void
  onBusyChange: (busy: boolean) => void
  run: (code: string, input: string) => Promise<unknown>
  objective?: boolean
  allContexts?: (SolverContext | ObjectiveContext)[]
  onApplyAll?: (values: string[]) => void
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [events, setEvents] = useState<AIEvent[]>([])
  const [error, setError] = useState('')
  const [explanation, setExplanation] = useState('')
  const [backup, setBackup] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const lockedRef = useRef(false)
  useEffect(() => () => { controllerRef.current?.abort() }, [])

  async function solveOne(value: SolverContext | ObjectiveContext, signal: AbortSignal, emit: (event: AIEvent) => void) {
    if ('type' in value) {
      const result = await solveObjectiveWithTools({ context: value as ObjectiveContext, signal, complete: aiComplete, onEvent: emit })
      return { value: result.answer, explanation: result.explanation }
    }
    const result = await solveWithTools({ context: value as SolverContext, signal, complete: aiComplete, run, onEvent: emit })
    return { value: result.code, explanation: result.explanation }
  }
  async function start(all = false) {
    if (lockedRef.current || disabled) return
    lockedRef.current = true
    setChecking(true); setError(''); onBusyChange(true)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const config = await aiBridge().getSettings()
      controller.signal.throwIfAborted()
      if (!config.baseUrl || !config.model) { setShowSettings(true); return }
      setBusy(true)
      setEvents([]); setExplanation('')
      const emit = (event: AIEvent) => { if (!controller.signal.aborted) setEvents(previous => [...previous.slice(-59), event]) }
      const contexts = all && allContexts?.length ? allContexts : [context]
      const values: string[] = []
      let explanation = ''
      for (let index = 0; index < contexts.length; index++) {
        emit({ type: 'status', text: `${all ? `正在解决第 ${index + 1}/${contexts.length} 题` : '正在解决当前题目'}` })
        const result = await solveOne(contexts[index], controller.signal, emit)
        values.push(result.value); explanation = result.explanation
        if (!all) { setBackup(objective ? String((context as ObjectiveContext).currentAnswer) : (context as SolverContext).code); onApply(result.value) }
      }
      controller.signal.throwIfAborted()
      if (all && onApplyAll) onApplyAll(values)
      setExplanation(explanation)
      emit({ type: 'status', text: all ? '已解决全部题目并填入答案。' : objective ? '答案已自动填入，可检查后提交。' : '代码已自动填入编辑器，可检查、运行或恢复原代码。' })
    } catch (cause) {
      if (controller.signal.aborted) setEvents(previous => [...previous, { type: 'status', text: '已停止，编辑器代码保持原样。' }])
      else setError(cause instanceof Error ? cause.message : 'AI 请求失败')
    } finally {
      setBusy(false); onBusyChange(false)
      setChecking(false)
      lockedRef.current = false
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  return <section className="ai-help" aria-label="AI 帮忙"><div className="ai-help-bar"><div className="ai-help-title"><Sparkles size={16} /><strong>AI 助手</strong><span>{busy ? '正在解决题目…' : objective ? '分析并自动填写答案' : '生成、测试并自动填入代码'}</span></div><div className="ai-help-actions">{backup !== null && !busy && <button className="secondary-button" disabled={disabled} onClick={() => { onApply(backup); setBackup(null); setExplanation('已恢复 AI 操作前的答案。') }}><Undo2 size={13} />恢复原答案</button>}<button className="icon-button" aria-label="AI 接口设置" disabled={busy || checking} onClick={() => setShowSettings(true)}><Settings2 size={16} /></button>{busy ? <button className="secondary-button" onClick={() => controllerRef.current?.abort()}><Square size={12} />停止</button> : <>{allContexts && onApplyAll && <button className="secondary-button" disabled={disabled || checking} onClick={() => void start(true)}><Sparkles size={13} />一键解决全部</button>}<button className="primary-button" disabled={disabled || checking} onClick={() => void start()}><Sparkles size={14} />{checking ? '读取配置…' : objective ? '解决本题' : 'AI帮忙'}</button></>}</div></div>
    {error && <div className="ai-help-error" role="alert">{error}</div>}{explanation && <p className="ai-explanation">{explanation}</p>}
    {events.length > 0 && <details className="ai-history" open={busy}><summary>{busy ? events[events.length - 1]?.text : '查看 AI 工具调用记录'}</summary><ol>{events.map((event, index) => <li className={`ai-event-${event.type}`} key={index}><span>{event.type === 'tool' ? '工具' : event.type === 'message' ? '模型' : event.type === 'error' ? '错误' : '状态'}</span><pre>{event.text}</pre></li>)}</ol></details>}
    {showSettings && <AISettings onClose={() => setShowSettings(false)} onSaved={() => setError('')} />}
  </section>
}
