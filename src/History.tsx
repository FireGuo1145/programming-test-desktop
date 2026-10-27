import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { exerciseApi } from './api'
import type { HistoryRecord, HistoryTag } from './types'

const states: Record<number, string> = { 0: '未完成', 1: '已完成', 2: '正在评分', 3: '已跳过', 4: '稍后作答' }
const kinds: Record<number, string> = { 0: '单选', 1: '多选', 2: '判断', 3: '填空', 4: '编程' }
function duration(item: HistoryRecord) {
  if (!item.startTime || !item.endTime) return '—'
  const seconds = Math.max(0, Math.floor((new Date(item.endTime.replace(' ', 'T')).getTime() - new Date(item.startTime.replace(' ', 'T')).getTime()) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
function dateLabel(value?: string) { return value ? value.slice(0, 10) : '未记录日期' }

export default function History() {
  const [items, setItems] = useState<HistoryRecord[]>([])
  const [tags, setTags] = useState<HistoryTag[]>([])
  const [tagId, setTagId] = useState(0)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const size = 10
  async function load(nextPage = page, nextTag = tagId) {
    setLoading(true); setError('')
    try { const result = await exerciseApi.history(nextPage, size, '', nextTag); setItems(result.data || []); setTotal(result.total || 0) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '历史记录加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { exerciseApi.historyTags().then(setTags).catch(() => setTags([])); void load(0, 0) }, [])
  useEffect(() => { if (page || tagId) void load(page, tagId) }, [page, tagId])
  const grouped = items.reduce<Record<string, HistoryRecord[]>>((result, item) => { (result[dateLabel(item.startTime)] ||= []).push(item); return result }, {})
  const pages = Math.max(1, Math.ceil(total / size))
  return <div className="records-page"><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE / HISTORY</div><h1>历史记录</h1><p>查看练习提交、用时与评分状态。</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={14} />刷新</button></div>
    <div className="history-layout"><aside className="history-tags"><strong>标签筛选</strong><button className={tagId === 0 ? 'selected' : ''} onClick={() => { setTagId(0); setPage(0) }}>全部</button>{tags.map(tag => <button key={tag.id} className={tagId === tag.id ? 'selected' : ''} onClick={() => { setTagId(tag.id); setPage(0) }}><span>{tag.content}</span><small>{tag.count ?? ''}</small></button>)}</aside>
      <section className="history-list">{error && <div className="results-error">{error}<button className="secondary-button" onClick={() => void load()}>重试</button></div>}{loading ? <div className="loading-state"><span className="spinner" />正在加载历史记录</div> : Object.keys(grouped).length === 0 ? <div className="empty-state">暂无历史记录</div> : Object.entries(grouped).map(([date, records]) => <div className="history-group" key={date}><h2>{date}</h2>{records.map(item => <article className="history-card" key={item.sessionId}><div className="history-kind"><span>{kinds[item.qBaseType ?? 4] || '练习'}</span><strong>{item.score != null && item.fullScore ? `${item.score} / ${item.fullScore}` : item.score ?? '—'}</strong></div><div className="history-main"><strong>{item.tagName || item.tag?.content || '综合练习'}</strong><span>{item.questionCount ? `${item.questionCount} 道题` : ''} · 用时 {duration(item)}</span></div><span className={`history-state state-${item.state}`}>{states[item.state] || '已结束'}</span></article>)}</div>)}<footer className="pager"><span>{total ? `${page * size + 1} – ${Math.min((page + 1) * size, total)} / ${total}` : '0 条记录'}</span><div><button disabled={page === 0} onClick={() => setPage(value => value - 1)} aria-label="上一页"><ChevronLeft size={15} /></button><button disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)} aria-label="下一页"><ChevronRight size={15} /></button></div></footer></section></div>
  </div>
}
