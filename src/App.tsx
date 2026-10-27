import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import AISettings from './AISettings'
import AIHelp from './AIHelp'
import { Activity, ArrowLeft, BookOpen, Check, ChevronDown, CircleHelp, Code2, FlaskConical, Gauge, LogOut, Play, Search, Settings2, Terminal, Trophy, X } from 'lucide-react'
import { authApi, clearSession, exerciseApi, getApiBase, getSession, saveSession, verificationCode } from './api'
import DOMPurify from 'dompurify'
import QuestionContent from './QuestionContent'
import Results from './Results'
import History from './History'
import Rank from './Rank'
import { createSaveQueue, submitAfterSave } from './submission'
import type { Answer, AnswerPaper, ObjectiveAnswer, PaperRecord, Question, Quota, Tag, UserSession } from './types'

const questionTypes = [{ id: 0, label: '单选题', icon: 'A' }, { id: 1, label: '多选题', icon: '☷' }, { id: 2, label: '判断题', icon: '✓' }, { id: 3, label: '填空题', icon: '___' }, { id: 4, label: '编程题', icon: '</>' }]
const difficulties = ['随机', '初学者', '容易', '中等', '困难', '极难']
const languages = [{ id: 1, name: 'C' }, { id: 2, name: 'C++' }, { id: 3, name: 'Java' }, { id: 4, name: 'Python' }]
const starter = ''

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => getSession())
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!session && location.pathname !== '/login') navigate('/login', { replace: true })
    if (session && location.pathname === '/login') navigate('/practice', { replace: true })
  }, [location.pathname, navigate, session])

  async function logout() {
    try { await authApi.logout() } catch { /* Local session must still end when the network is unavailable. */ }
    clearSession()
    setSession(null)
    navigate('/login')
  }

  return <Routes>
    <Route path="/login" element={<Login onLogin={s => { saveSession(s); setSession(s); navigate('/practice') }} />} />
    <Route path="/practice" element={session ? <Shell session={session} onLogout={logout}><Practice /></Shell> : <Navigate to="/login" replace />} />
    <Route path="/history" element={session ? <Shell session={session} onLogout={logout}><History /></Shell> : <Navigate to="/login" replace />} />
    <Route path="/rank" element={session ? <Shell session={session} onLogout={logout}><Rank /></Shell> : <Navigate to="/login" replace />} />
    <Route path="/results/:sessionId" element={session ? <Shell session={session} onLogout={logout}><Results /></Shell> : <Navigate to="/login" replace />} />
    <Route path="/session/:sessionId" element={session ? <Shell session={session} onLogout={logout}><Session /></Shell> : <Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to={session ? '/practice' : '/login'} replace />} />
  </Routes>
}

function Login({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState(getApiBase())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !code || !password) return
    setBusy(true); setError('')
    try {
      localStorage.setItem('practice-api-base', server.replace(/\/$/, ''))
      const session = await authApi.login(code, password)
      if (session.id <= 0) setError(session.id === -3 ? '登录已锁定，请稍后再试' : session.id === -2 ? '当前账号受登录频率限制' : session.id === -1 ? '当前网络暂时无法登录' : '账号或密码错误')
      else onLogin(session)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录请求失败') }
    finally { setBusy(false) }
  }

  return <main className="login-page">
    <div className="login-decoration"><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /><div className="decoration-caption"><span>LEARN / PRACTICE / GROW</span><strong>Make progress<br />one problem at a time.</strong><span>题序 · 学生自驱练习</span></div><div className="login-edition">PRACTICE DESK <span>BUILD 01</span></div></div>
    <section className="login-panel"><div className="login-form-wrap"><div className="brand-mark large"><Code2 size={22} /></div><div className="eyebrow">STUDENT WORKSPACE</div><h1>欢迎回来</h1><p className="muted">登录以继续你的练习进度。</p>
      <form onSubmit={submit}><label className="field-label" htmlFor="student-code">学号</label><input id="student-code" autoComplete="username" placeholder="输入学号" value={code} onChange={e => setCode(e.target.value)} /><label className="field-label" htmlFor="student-password">密码</label><input id="student-password" type="password" autoComplete="current-password" placeholder="输入密码" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <div className="form-error">{error}</div>}<button className="primary-button login-button" disabled={busy || !code || !password}>{busy ? <span className="spinner" /> : null}{busy ? '正在登录' : '登录'}<span>↗</span></button>
      </form><label className="field-label server-label" htmlFor="server-url">服务地址</label><input id="server-url" className="server-input" value={server} onChange={e => setServer(e.target.value)} /><div className="login-footnote"><span><span className="connection-dot" />服务连接待验证</span><span>安全连接</span></div></div><div className="login-footer">© 2026 题序 Practice Desk</div></section>
  </main>
}

function Shell({ session, onLogout, children }: { session: UserSession; onLogout: () => void; children: React.ReactNode }) {
  const [query, setQuery] = useState('')
  const [showAISettings, setShowAISettings] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer) }, [notice])
  return <div className="app-shell"><aside className="sidebar"><Link to="/practice" className="brand"><div className="brand-mark"><Code2 size={19} /></div><span>题序<small>PRACTICE DESK</small></span></Link>
    <div className="side-section-label">工作区</div><div className="side-nav"><Link className={`nav-item ${location.pathname === '/practice' ? 'active' : ''}`} to="/practice"><BookOpen size={17} /><span>开始练习</span>{location.pathname === '/practice' && <span className="nav-active-dot" />}</Link><Link className={`nav-item ${location.pathname === '/history' ? 'active' : ''}`} to="/history"><Activity size={17} /><span>历史记录</span>{location.pathname === '/history' && <span className="nav-active-dot" />}</Link><Link className={`nav-item ${location.pathname === '/rank' ? 'active' : ''}`} to="/rank"><Trophy size={17} /><span>排行榜</span>{location.pathname === '/rank' && <span className="nav-active-dot" />}</Link><div className="side-section-label secondary">练习模式</div><button className="nav-item" onClick={() => setNotice('实验模块尚未接入')}><FlaskConical size={17} /><span>实验</span></button><button className="nav-item" onClick={() => setNotice('闯关模式可在选题面板切换')}><Gauge size={17} /><span>闯关</span></button></div>
    <div className="sidebar-bottom"><div className="help-row"><CircleHelp size={16} /><span>帮助与反馈</span><span className="shortcut">?</span></div><div className="profile-card"><div className="avatar">{(session.name || session.code || 'U').slice(0, 1).toUpperCase()}</div><div className="profile-meta"><strong>{session.name || '练习者'}</strong><span>{session.code}</span></div><button title="退出登录" className="icon-button logout-button" onClick={onLogout}><LogOut size={16} /></button></div></div>
  </aside><main className="main-area"><header className="topbar"><div className="breadcrumb"><span>工作区</span><span>/</span><strong>{locationLabel()}</strong></div><label className="search-box"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索题目、标签..." /><kbd>⌘ K</kbd></label><button className="icon-button top-settings" title="AI 接口设置" aria-label="AI 接口设置" onClick={() => setShowAISettings(true)}><Settings2 size={17} /></button><div className="top-avatar">{(session.name || session.code || 'U').slice(0, 1).toUpperCase()}</div></header><div className="content-scroll">{children}</div>{showAISettings && <AISettings onClose={() => setShowAISettings(false)} />}{notice && <div className="toast"><span className="toast-dot" />{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}</main></div>
}

function locationLabel() { return window.location.hash.includes('/results/') ? '练习结果' : window.location.hash.includes('/session/') ? '正在练习' : window.location.hash.includes('/history') ? '历史记录' : window.location.hash.includes('/rank') ? '排行榜' : '开始练习' }

function questionBucket(question: Question): keyof AnswerPaper { return question.qType >= 5 ? 'q4' : `q${question.qType}` as keyof AnswerPaper }
function findAnswer(paper: AnswerPaper | null, question: Question): Answer | undefined { return paper?.[questionBucket(question)].find(answer => answer.globalId === question.globalId) }
function answerString(answer: Answer | undefined): string {
  if (!answer) return ''
  if (Array.isArray(answer.answer)) return answer.answer.map(value => typeof value === 'string' ? value : value.content).join('\n')
  return String(answer.answer ?? '')
}
function answerForAI(question: Question, answer: Answer | undefined): string {
  if (question.qType === 1 && Array.isArray(answer?.answer)) return answer.answer.map(value => typeof value === 'string' ? value : value.globalId).join(',')
  return answerString(answer)
}

function Practice() {
  const [type, setType] = useState(4)
  const [mode, setMode] = useState(0)
  const [level, setLevel] = useState(0)
  const [tagId, setTagId] = useState(-1)
  const [tags, setTags] = useState<Tag[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [challenge, setChallenge] = useState<{ currentLevel: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let live = true
    setError('')
    exerciseApi.tags(type, level).then(items => { if (live) { setTags([...items].sort((a, b) => Number(a.available === false) - Number(b.available === false))); setTagId(-1) } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [level, type])
  useEffect(() => {
    exerciseApi.quota().then(setQuota).catch(() => setQuota(null))
    exerciseApi.challenge().then(setChallenge).catch(() => setChallenge(null))
  }, [])

  const available = tags.filter(tag => tag.available !== false)
  const selectedUnavailable = tagId > 0 && tags.some(tag => tag.id === tagId && tag.available === false)
  const blocked = quota ? (quota.weekExhausted && !(mode === 1 && challenge) || (mode === 0 && type === 4 && quota.dayExhausted)) : false

  async function start() {
    if (busy || tagId === -1 || selectedUnavailable || blocked) return
    setBusy(true); setError('')
    try {
      if (mode === 1) { setError('当前客户端已实现随机练习；闯关入口需要接入独立闯关试卷流程。'); return }
      const result = await exerciseApi.choose(type, level, tagId)
      if (result.code === 0) navigate(`/session/${result.sessionId}`)
      else setError(({ 1: '该标签下已完成全部题目', 2: '本周练习额度已用完', 3: '操作过于频繁，请稍后重试', 4: '未作答练习已达上限', 5: '今日编程题额度已用完' } as Record<number, string>)[result.code] || `选题失败 (${result.code})`)
    } catch (e) { setError(e instanceof Error ? e.message : '选题请求失败') }
    finally { setBusy(false) }
  }

  return <div className="practice-page"><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE / PRACTICE</div><h1>开始练习</h1><p>选择题型与难度，开启一轮专注练习。</p></div><div className="heading-date"><span className="live-indicator" />练习服务在线</div></div>
    <div className="workspace-grid"><section className="selection-area"><div className="section-heading"><div><h2>配置练习</h2><span>根据你的目标选择本轮练习内容</span></div><span className="step-index">01 <span>/ 02</span></span></div>
      <div className="selection-block"><div className="block-heading"><span className="block-number">01</span><div><h3>选择题型</h3><span>每轮题量随题型自动调整</span></div></div><div className="type-grid">{questionTypes.map(item => <button key={item.id} className={`type-option ${type === item.id ? 'selected' : ''}`} onClick={() => { setType(item.id); if (mode === 1) setMode(0) }}><span className="type-icon">{item.icon}</span><span className="type-name">{item.label}</span>{type === item.id ? <Check size={15} className="selected-check" /> : null}</button>)}</div><div className="selection-note"><span className="note-dot" /><span>当前设置将抽取 <strong>{type < 4 ? '5' : '1'} 道题目</strong></span><span className="note-divider" /><span>预计用时 <strong>{type < 4 ? '10–15' : '20–30'} 分钟</strong></span></div></div>
      <div className="selection-block"><div className="block-heading"><span className="block-number">02</span><div><h3>练习模式</h3><span>选择适合当前节奏的方式</span></div></div><div className="segmented mode-segment"><button className={mode === 0 ? 'selected' : ''} onClick={() => setMode(0)}><span className="segment-icon">◉</span>随机练习{mode === 0 && <Check size={14} />}</button><button className={mode === 1 ? 'selected' : ''} onClick={() => setMode(1)}><span className="segment-icon">⇧</span>闯关模式{mode === 1 && <Check size={14} />}</button><button className="locked-segment" title="通关模式暂不可用"><span className="segment-icon">⌑</span>通关模式<span className="soon-label">未开放</span></button></div></div>
      {mode === 0 && <div className="selection-block"><div className="block-heading"><span className="block-number">03</span><div><h3>难度等级</h3><span>从随机抽题到逐级挑战</span></div></div><div className="segmented difficulty-segment">{difficulties.map((item, index) => <button key={item} className={level === index ? 'selected' : ''} onClick={() => setLevel(index)}>{item}</button>)}</div></div>}
      <div className="selection-block tag-block"><div className="block-heading"><span className="block-number">{mode === 0 ? '04' : '03'}</span><div><h3>选择标签</h3><span>也可以随机选择一个标签</span></div></div><div className="tag-options">{available.length > 0 ? <><button className={`tag-option ${tagId === 0 ? 'selected' : ''}`} onClick={() => setTagId(0)}><span className="tag-random-icon">✳</span>随机标签{tagId === 0 && <Check size={14} />}</button>{available.map(tag => <button className={`tag-option ${tagId === tag.id ? 'selected' : ''}`} key={tag.id} onClick={() => setTagId(tag.id)}>{tag.content}{tagId === tag.id && <Check size={14} />}</button>)}{tags.filter(tag => tag.available === false).map(tag => <button className="tag-option unavailable" key={tag.id} disabled>{tag.content}<span className="tag-done">已完成</span></button>)}</> : <div className="empty-tags">{error ? <span className="error-inline">{error}</span> : '正在加载标签...'}</div>}</div></div>
      {blocked && <div className="blocked-message">本周期练习额度已用尽，请稍后再来。</div>}{error && tags.length > 0 && <div className="error-inline request-error">{error}</div>}
      <div className="start-row"><button className="primary-button start-button" onClick={start} disabled={busy || tagId === -1 || selectedUnavailable || blocked || tags.length === 0}>{busy ? <span className="spinner" /> : <Play size={17} fill="currentColor" />}{busy ? '正在创建练习' : mode === 1 ? '开始闯关' : '开始练习'}<span className="button-enter">↵</span></button><span className="start-hint">选择标签后即可开始 <ArrowLeft size={13} /></span></div>
    </section><aside className="practice-aside"><section className="quota-panel"><div className="aside-heading"><div><div className="eyebrow">YOUR PROGRESS</div><h2>练习额度</h2></div><span className="quota-ring"><Gauge size={19} /></span></div>{quota ? <><div className="quota-summary"><strong>{quota.weekLimit > 0 ? `${Math.max(0, quota.weekLimit - quota.weekUsed)}` : '∞'}</strong><span>本周剩余题数</span></div><div className="quota-meter"><span style={{ width: `${quota.weekLimit > 0 ? Math.min(100, quota.weekUsed / quota.weekLimit * 100) : 0}%` }} /></div><div className="quota-row"><span>本周已完成</span><strong>{quota.weekUsed}<small> / {quota.weekLimit || '∞'}</small></strong></div><div className="quota-row"><span>今日编程题</span><strong>{quota.dayUsed}<small> / {quota.dayLimit || '不限'}</small></strong></div><div className="quota-row"><span>未作答练习</span><strong>{quota.pendingCount}<small> / {quota.pendingLimit}</small></strong></div><div className="quota-caption"><span className="caption-dot" />额度每周自动刷新</div></> : <div className="quota-loading">正在读取练习额度</div>}</section>
      <section className="focus-panel"><div className="focus-symbol"><BookOpen size={17} /></div><div className="eyebrow">A SMALL REMINDER</div><h3>每次专注一点<br />就已经在进步。</h3><div className="focus-rule" /><span>今日练习 · 成为更好的自己</span><span className="focus-index">Nº 001 / DAILY PRACTICE</span></section>
      {challenge && <div className="challenge-status"><span className="challenge-icon"><Trophy size={15} /></span><span>闯关进行中</span><strong>第 {challenge.currentLevel} 关</strong><ChevronDown size={14} /></div>}
      <div className="aside-foot"><span>LOCAL TIME</span><strong>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}</strong></div>
    </aside></div><div className="page-bottom"><span><span className="bottom-dot" />练习数据已与服务器同步</span><span>KEEP YOUR OWN PACE <span className="bottom-spark">✳</span></span></div>
  </div>
}

function Session() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState<PaperRecord | null>(null)
  const [code, setCode] = useState(starter)
  const [language, setLanguage] = useState(1)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [aiWorking, setAIWorking] = useState(false)
  const [answerRevision, setAnswerRevision] = useState(0)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [submitStep, setSubmitStep] = useState('')
  const submittingRef = useRef(false)
  const answerPaperRef = useRef<AnswerPaper | null>(null)
  const savedSnapshotRef = useRef('')
  const deadlineRef = useRef(0)
  const queueSave = useMemo(() => createSaveQueue(async answerPaper => exerciseApi.save({
    sessionId, answerPaper, verificationCode: await verificationCode(sessionId),
  })), [sessionId])


  useEffect(() => {
    let cancelled = false
    exerciseApi.paper(sessionId).then(paper => {
      if (cancelled) return
      if (paper.state !== 0 || paper.canViewCode === false || paper.buyCode) {
        navigate(`/results/${sessionId}`, { replace: true })
        return
      }
      answerPaperRef.current = structuredClone(paper.answerPaper)
      savedSnapshotRef.current = JSON.stringify(paper.answerPaper)
      deadlineRef.current = Date.now() + paper.timeLeft * 1000
      setRecord(paper); setSeconds(paper.timeLeft)
      const first = paper.paper.questions[0]
      const firstAnswer = findAnswer(paper.answerPaper, first)
      setCode(first && first.qType >= 5 ? answerString(firstAnswer) : '')
      if (first?.language) setLanguage(first.language)
    }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [sessionId, navigate])
  useEffect(() => {
    const timer = setInterval(() => {
      if (deadlineRef.current) setSeconds(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!record || submitting) return
    const timer = setTimeout(() => { void saveAnswer().catch(() => undefined) }, 2500)
    return () => clearTimeout(timer)
  }, [code, answerRevision, record, submitting])

  const question = record?.paper.questions[activeQuestion]
  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const listNumber = activeQuestion + 1

  function updateCode(value: string) {
    const answers = answerPaperRef.current
    if (!answers || !question || submittingRef.current) return
    const current = answers.q4.find(item => item.globalId === question.globalId)
    if (current) current.answer = value
    else answers.q4.push({ globalId: question.globalId, qType: question.qType, answer: value, keySequence: [], inputSequence: [] })
    setCode(value)
    setAnswerRevision(revision => revision + 1)
  }

  function currentAnswer() { return question ? findAnswer(answerPaperRef.current, question) : undefined }
  function setObjectiveAnswer(value: ObjectiveAnswer) {
    if (question) setAnswerForQuestion(question, value)
  }
  function setAnswerForQuestion(target: Question, value: ObjectiveAnswer) {
    if (!answerPaperRef.current || submittingRef.current) return
    const bucket = questionBucket(target)
    const current = answerPaperRef.current[bucket].find(item => item.globalId === target.globalId)
    const answer = current || { globalId: target.globalId, qType: target.qType, answer: value }
    answer.answer = value
    if (!current) answerPaperRef.current[bucket].push(answer)
    if (question?.globalId === target.globalId) setAnswerRevision(revision => revision + 1)
  }
  function selectQuestion(index: number) {
    const next = record?.paper.questions[index]
    if (!next) return
    setActiveQuestion(index); setOutput(''); setError('')
    const answer = findAnswer(answerPaperRef.current, next)
    setCode(next.qType >= 5 ? answerString(answer) : '')
    if (next.language) setLanguage(next.language)
  }

  async function saveAnswer(force = false) {
    if (!record || !answerPaperRef.current) throw new Error('作答尚未加载完成')
    const payload = structuredClone(answerPaperRef.current)
    const snapshot = JSON.stringify(payload)
    if (!force && snapshot === savedSnapshotRef.current) return
    setSaving(true)
    try {
      const response = await queueSave(payload)
      savedSnapshotRef.current = snapshot
      deadlineRef.current = Date.now() + response.timeLeft * 1000
      setSeconds(response.timeLeft)
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      throw e
    } finally { setSaving(false) }
  }

  async function runCode() {
    setBusy(true); setOutput(''); setError('')
    try { const result = await exerciseApi.run(code, language - 1, input); setOutput(result.map(item => item.output).filter(Boolean).join('\n')); const runError = result.map(item => item.error).filter(Boolean).join('\n'); if (runError) setError(runError) }
    catch (e) { setError(e instanceof Error ? e.message : '运行失败') }
    finally { setBusy(false) }
  }

  async function submit() {
    if (submittingRef.current || aiWorking) return
    submittingRef.current = true
    setSubmitting(true); setBusy(true); setError(''); setSubmitStep('正在保存代码…')
    try {
      await submitAfterSave(
        () => saveAnswer(true),
        async () => { setSubmitStep('正在提交作答…'); return exerciseApi.submit(sessionId) },
      )
      navigate(`/results/${sessionId}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
      setSubmitStep('')
    } finally {
      submittingRef.current = false
      setSubmitting(false); setBusy(false)
    }
  }

  if (!record) return <div className="loading-state">{error ? <div className="error-inline">{error}</div> : <><span className="spinner" />正在载入练习</>}</div>
  return <div className={`session-page ${question && question.qType < 5 ? 'objective-session' : ''}`}><div className="session-heading"><button className="back-button" disabled={submitting || aiWorking} onClick={async () => { try { await saveAnswer(); navigate('/practice') } catch { /* Preserve unsaved work. */ } }}><ArrowLeft size={16} />返回选题</button><div><div className="eyebrow">FOCUSED PRACTICE / {String(listNumber).padStart(2, '0')}</div><h1>编程练习</h1></div><div className="timer-pill"><span className="timer-dot" /><span>剩余时间</span><strong>{formattedTime}</strong></div></div>
    <AIHelp key={question?.globalId || sessionId} objective={Boolean(question && question.qType < 5)} context={question && question.qType < 5 ? { question: questionText(question.content || ''), type: questionTypeLabel(question.qType), options: question.options || [], currentAnswer: answerForAI(question, currentAnswer()) } : { question: questionText(question?.content || ''), language: languages.find(item => item.id === language)?.name || 'C', code, input }} allContexts={record.paper.questions.length > 1 ? record.paper.questions.map(item => item.qType < 5 ? { question: questionText(item.content || ''), type: questionTypeLabel(item.qType), options: item.options || [], currentAnswer: answerForAI(item, findAnswer(answerPaperRef.current, item)) } : { question: questionText(item.content || ''), language: languages.find(lang => lang.id === (item.language || 1))?.name || 'C', code: answerString(findAnswer(answerPaperRef.current, item)), input: '' }) : undefined} onApplyAll={values => { values.forEach((value, index) => { const item = record.paper.questions[index]; if (item.qType < 5) setAnswerForQuestion(item, item.qType === 1 ? value.split(/[,\n]+/).map(globalId => globalId.trim()).filter(Boolean).map(globalId => ({ globalId, content: item.options?.find(option => option.globalId === globalId)?.content || '' })) : item.qType === 2 ? Number(value) : item.qType === 3 ? [{ globalId: item.globalId, content: value }] : value); else { const target = answerPaperRef.current?.q4.find(answer => answer.globalId === item.globalId); if (target) target.answer = value; else answerPaperRef.current?.q4.push({ globalId: item.globalId, qType: item.qType, answer: value, keySequence: [], inputSequence: [] }) } }); const active = record.paper.questions[activeQuestion]; if (active.qType >= 5) setCode(answerString(findAnswer(answerPaperRef.current, active))); setAnswerRevision(revision => revision + 1) }} disabled={busy || confirmSubmit || seconds <= 0} onBusyChange={setAIWorking} run={(source, stdin) => exerciseApi.run(source, language - 1, stdin)} onApply={source => {
      if (question && question.qType < 5) { setObjectiveAnswer(question.qType === 1 ? source.split(/[,\n]+/).map(globalId => globalId.trim()).filter(Boolean).map(globalId => ({ globalId, content: question.options?.find(option => option.globalId === globalId)?.content || '' })) : question.qType === 2 ? Number(source) : question.qType === 3 ? [{ globalId: question.globalId, content: source }] : source); return }
      const editor = editorRef.current
      const model = editor?.getModel()
      if (editor && model) {
        editor.pushUndoStop()
        editor.executeEdits('ai-assistant', [{ range: model.getFullModelRange(), text: source, forceMoveMarkers: true }])
        editor.pushUndoStop()
      }
      updateCode(source)
    }} />
    <div className={`problem-layout ${question && question.qType < 5 ? 'objective-layout' : ''}`}><section className="problem-panel"><div className="problem-topline"><span className="problem-number">Q{question?.id || listNumber}</span><span className="problem-dot">·</span><span>{question && question.qType < 5 ? questionTypeLabel(question.qType) : languages.find(item => item.id === language)?.name || 'C'}</span><span className="problem-difficulty">{question && question.qType < 5 ? '客观题' : '编程题'}</span></div><div className="question-navigation">{record.paper.questions.map((item: Question, index: number) => <button key={item.globalId} disabled={submitting || aiWorking} onClick={() => selectQuestion(index)} className={activeQuestion === index ? 'active' : ''}>{String(index + 1).padStart(2, '0')}</button>)}</div><QuestionContent value={question?.content || ''} />{question && question.qType < 5 && <ObjectiveAnswer question={question} answer={currentAnswer()} disabled={submitting || aiWorking} onChange={setObjectiveAnswer} />}<div className="problem-tags"><span className="tag-pill"><Code2 size={13} />{question && question.qType < 5 ? '客观题' : '程序设计'}</span>{question?.point ? <span className="tag-pill">{question.point} 分</span> : null}</div><div className="example-box"><div className="example-label">题目示例</div><pre>{question?.contentEn ? '请根据题目描述完成作答。' : '提交前请检查答案。'}</pre></div><div className="problem-help"><CircleHelp size={15} /><span>遇到困难？可以让 AI 分析当前题目并填写答案。</span></div></section>
      <section className="editor-panel"><div className="editor-toolbar"><div className="editor-title"><span className="editor-live" /><strong>代码编辑器</strong><span className="editor-unsaved">{saving ? '保存中...' : savedAt ? `已保存 ${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '自动保存'}</span></div><div className="editor-controls"><label className="language-select"><Code2 size={14} /><select disabled={submitting || aiWorking} value={language} onChange={e => setLanguage(Number(e.target.value))}>{languages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={13} /></label><button className="icon-button" title="格式化代码" disabled={busy || aiWorking} onClick={async () => { try { const result = await exerciseApi.format(code, language - 1); updateCode(result.data) } catch (e) { setError(e instanceof Error ? e.message : '格式化失败') } }}><span className="format-icon">⟷</span></button></div></div><div className="monaco-wrap"><Editor onMount={editor => { editorRef.current = editor }} height="100%" language={languages.find(item => item.id === language)?.name.toLowerCase()} theme="vs-dark" value={code} onChange={value => updateCode(value || '')} options={{ readOnly: submitting || aiWorking, minimap: { enabled: false }, fontSize: 14, lineHeight: 24, fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace', padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, smoothScrolling: true, cursorBlinking: 'smooth', renderLineHighlight: 'all', bracketPairColorization: { enabled: true } }} /></div><div className="stdin-panel"><div className="stdin-heading"><span><Terminal size={14} />标准输入</span><span>STDIN</span></div><textarea value={input} onChange={e => setInput(e.target.value)} placeholder="需要输入时，在此填写测试数据..." /></div>{(output || error) && <div className="run-result"><div className="result-head"><span><Activity size={14} />运行结果</span><button onClick={() => { setOutput(''); setError('') }}><X size={14} /></button></div>{output && <pre>{output}</pre>}{error && <pre className="run-error">{error}</pre>}</div>}<div className="editor-footer"><span className="editor-footer-state"><span className="footer-green-dot" />{savedAt ? '工作区已同步' : '本地编辑器'}</span><div><button className="secondary-button" onClick={runCode} disabled={busy || aiWorking}><Play size={14} />运行代码</button><button className="primary-button submit-button" onClick={() => setConfirmSubmit(true)} disabled={busy || aiWorking}>{submitting ? <span className="spinner" /> : <Check size={15} />}{submitting ? submitStep : '提交作答'}</button></div></div></section></div><div className="session-bottom"><span><span className="bottom-dot" />{saving ? '正在保存更改' : '答案更改后会自动同步'}</span><span>SESSION / {sessionId.slice(0, 8).toUpperCase()}</span></div>
    {confirmSubmit && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !submitting) setConfirmSubmit(false) }}><div className="confirm-modal"><div className="confirm-icon"><Check size={20} /></div><button className="modal-close" disabled={submitting} onClick={() => setConfirmSubmit(false)}><X size={17} /></button><div className="eyebrow">READY TO FINISH?</div><h2>提交本轮作答？</h2><p>提交后将结束本次练习。当前代码会先保存，再提交评分。</p>{error && <p role="alert" className="error-inline">{error}</p>}<div className="modal-actions"><button className="secondary-button" disabled={submitting} onClick={() => setConfirmSubmit(false)}>继续检查</button><button className="primary-button" onClick={submit} disabled={busy}>{submitting ? <span className="spinner" /> : <Check size={15} />}{submitting ? submitStep : '确认提交'}</button></div></div></div>}
  </div>
}

function questionText(html: string) {
  const container = document.createElement('div')
  container.innerHTML = DOMPurify.sanitize(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|pre|tr)>/gi, '\n'))
  return container.textContent?.trim() || ''
}

function questionTypeLabel(type: number) { return ({ 0: '单选题', 1: '多选题', 2: '判断题', 3: '填空题' } as Record<number, string>)[type] || '客观题' }

function ObjectiveAnswer({ question, answer, disabled, onChange }: { question: Question; answer?: Answer; disabled: boolean; onChange: (value: ObjectiveAnswer) => void }) {
  const selected = answer?.answer
  if (question.qType === 2) return <div className="objective-answer"><div className="objective-label">请选择判断</div><div className="objective-options"><button className={selected === 1 ? 'chosen' : ''} disabled={disabled} onClick={() => onChange(1)}>正确</button><button className={selected === 0 ? 'chosen' : ''} disabled={disabled} onClick={() => onChange(0)}>错误</button></div></div>
  if (question.qType === 3) { const value = Array.isArray(selected) ? selected.map(item => typeof item === 'string' ? item : item.content).join('\n') : String(selected || ''); return <div className="objective-answer"><div className="objective-label">填写答案</div><textarea disabled={disabled} value={value} onChange={event => onChange([{ globalId: question.globalId, content: event.target.value }])} placeholder="输入答案" /></div> }
  const selectedIds = question.qType === 1 && Array.isArray(selected) ? selected.map(item => typeof item === 'string' ? item : item.globalId) : typeof selected === 'string' ? [selected] : []
  return <div className="objective-answer"><div className="objective-label">{question.qType === 1 ? '可选择多个答案' : '请选择一个答案'}</div><div className="objective-options objective-options-list">{(question.options || []).map(option => <button key={option.globalId} className={selectedIds.includes(option.globalId) ? 'chosen' : ''} disabled={disabled} onClick={() => question.qType === 1 ? onChange(selectedIds.includes(option.globalId) ? selectedIds.filter(id => id !== option.globalId).map(globalId => ({ globalId, content: question.options?.find(item => item.globalId === globalId)?.content || '' })) : [...selectedIds, option.globalId].map(globalId => ({ globalId, content: question.options?.find(item => item.globalId === globalId)?.content || '' }))) : onChange(option.globalId)}><strong>{option.globalId}</strong><QuestionContent value={option.content} className="option-content" /></button>)}</div></div>
}
