import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { exerciseApi } from './api'
import type { Answer, PaperRecord, ScoreResult } from './types'

function answerText(answer?: Answer) {
  if (!answer) return '未作答'
  if (Array.isArray(answer.answer)) return answer.answer.map(value => typeof value === 'string' ? value : value.content).join('\n')
  return String(answer.answer ?? '') || '未作答'
}

export default function Results() {
  const { sessionId = '' } = useParams()
  const [record, setRecord] = useState<PaperRecord | null>(null)
  const [scores, setScores] = useState<ScoreResult[]>([])
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(true)
  const [retry, setRetry] = useState(0)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    setError(''); setWaiting(true); setSlow(false)
    async function poll() {
      try {
        const paper = await exerciseApi.paper(sessionId)
        if (cancelled) return
        setRecord(paper)
        if (paper.state === 5) throw new Error('服务器评分失败，请稍后刷新结果')
        if (paper.state !== 0 && paper.state !== 2 && paper.state !== 1) {
          setWaiting(false)
          return
        }
        // Empty score arrays mean judging is still in progress on the original API.
        const result = await exerciseApi.score(sessionId)
        if (cancelled) return
        setScores(result)
        if (result.length > 0 || (paper.state === 1 && paper.answerPaper.q4.length === 0)) {
          // Fetch the authoritative aggregate only after judging has completed.
          const finalRecord = await exerciseApi.paper(sessionId)
          if (cancelled) return
          setRecord(finalRecord)
          setWaiting(false)
          return
        }
        attempts++
        if (attempts >= 60) {
          setSlow(true); setWaiting(false)
          return
        }
        timer = setTimeout(() => { void poll() }, 2000)
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : '读取结果失败')
        setWaiting(false)
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sessionId, retry])

  const total = record?.score ?? scores.reduce((sum, result) => sum + result.score, 0)
  const full = record?.fullScore ?? record?.paper.questions.reduce((sum, question) => sum + (question.point || 0), 0)
  const states: Record<number, string> = { 0: '等待服务器确认提交', 1: '评分完成', 2: '正在评分', 3: '已跳过', 4: '稍后作答', 5: '评分失败' }
  return <div className="results-page">
    <header className="results-heading"><div><div className="eyebrow">PRACTICE / RESULTS</div><h1>练习结果</h1><span className="results-meta">作答编号 {sessionId}</span></div><Link className="secondary-button" to="/practice">返回选题</Link></header>
    {error && <div role="alert" className="results-error">{error}<button className="secondary-button" onClick={() => setRetry(value => value + 1)}>重新加载</button></div>}
    <section className="results-summary" aria-live="polite">
      {waiting ? <div className="results-pending"><span className="spinner" />提交已完成，正在等待服务器评分…</div> : slow ? <div><strong>评分仍在进行</strong><p className="results-meta">服务器暂未返回结果，可以稍后重新查询。</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>查询评分结果</button></div> : <><div className="results-score">{record?.state === 1 || scores.length > 0 ? total : '—'}{full ? <small className="results-meta"> / {full}</small> : null}</div><div><div className="results-state">{error ? '结果暂不可用' : record ? states[record.state] || '作答已结束' : '加载结果'}</div><div className="results-meta">{record?.paper.questions.length || 0} 道题目</div></div></>}
    </section>
    <div className="results-list">{record?.paper.questions.map(question => {
      const answer = Object.values(record.answerPaper).flat().find(value => value.globalId === question.globalId)
      const score = scores.find(value => value.globalId === question.globalId)
      return <article className="result-question" key={question.globalId}><header><strong>Q{question.id}</strong><span>{score ? `${score.score} 分` : waiting ? '等待评分' : '暂无得分'}</span></header><div className="problem-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(question.content || '') }} />{record.canViewCode !== false && <pre className="result-answer">{answerText(answer)}</pre>}{score?.scoreResult != null && <details><summary>评分详情</summary><pre className="result-answer">{typeof score.scoreResult === 'string' ? score.scoreResult : JSON.stringify(score.scoreResult, null, 2)}</pre></details>}</article>
    })}</div>
  </div>
}
