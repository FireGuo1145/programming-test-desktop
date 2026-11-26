import type { CaptchaChallenge, CaptchaSubmission, ChooseResult, GateStatus, HistoryOverviewPoint, HistoryPage, HistoryTag, HistoryTagRaw, PaperRecord, Quota, RankPage, ScoreResult, Tag, UserSession } from './types'

import server from '../server.config.json'
const SESSION_KEY = 'practice-desk-session'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function errorMessageFromResponse(status: number, data: unknown): string {
  if (status === 403 && data && typeof data === 'object' && (data as { code?: unknown }).code === -3) {
    return '请使用电脑端作答（移动端不支持答题）'
  }
  if (typeof data === 'string' && data.trim()) return data
  return `服务请求失败 (${status})`
}

function normalizeHistoryTag(item: HistoryTagRaw): HistoryTag | null {
  if (item.tag && typeof item.tag.id === 'number') {
    return { id: item.tag.id, content: item.tag.content, contentEn: item.tag.contentEn, count: item.count }
  }
  if (typeof item.id === 'number' && typeof item.content === 'string') {
    return { id: item.id, content: item.content, contentEn: item.contentEn, count: item.count }
  }
  return null
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window !== 'undefined' ? window[kind] : null
  } catch {
    return null
  }
}

export function getApiBase() { return server.apiBase }

export function getSession(): UserSession | null {
  const persistent = browserStorage('localStorage')
  const legacy = browserStorage('sessionStorage')
  try {
    const raw = persistent?.getItem(SESSION_KEY) || legacy?.getItem(SESSION_KEY)
    const session = JSON.parse(raw || 'null') as UserSession | null
    if (session && typeof session.sid === 'string' && typeof session.id === 'number') {
      if (!persistent?.getItem(SESSION_KEY) && persistent) persistent.setItem(SESSION_KEY, JSON.stringify(session))
      return session
    }
  } catch {
    persistent?.removeItem(SESSION_KEY)
    legacy?.removeItem(SESSION_KEY)
  }
  persistent?.removeItem(SESSION_KEY)
  legacy?.removeItem(SESSION_KEY)
  return null
}

export function saveSession(session: UserSession) {
  const persistent = browserStorage('localStorage')
  if (!persistent) throw new Error('浏览器无法保存登录状态')
  persistent.setItem(SESSION_KEY, JSON.stringify(session))
  browserStorage('sessionStorage')?.removeItem(SESSION_KEY)
}

export function clearSession() {
  browserStorage('localStorage')?.removeItem(SESSION_KEY)
  browserStorage('sessionStorage')?.removeItem(SESSION_KEY)
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession()
  const relative = new URL(path, 'http://placeholder/')
  if (path.startsWith('api/')) relative.searchParams.set('sid', session?.sid || '')
  const requestPath = relative.pathname.slice(1) + relative.search
  if (window.desktop) {
    const result = await window.desktop.request({ path: requestPath, method: options.method || 'GET', body: options.body as string | undefined })
    if (result && typeof result === 'object' && 'ok' in result && 'status' in result) {
      if (!result.ok) throw new ApiError(errorMessageFromResponse(result.status, result.data), result.status, result.data)
      return result.data as T
    }
    return result as T
  }
  const response = await fetch(`/backend/${requestPath}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(30000) })
  const text = response.status === 204 ? '' : await response.text()
  let parsed: unknown = null
  if (text) {
    try { parsed = JSON.parse(text) }
    catch {
      if (response.ok) throw new Error('服务返回了非 JSON 数据')
      parsed = text
    }
  }
  if (!response.ok) {
    throw new ApiError(errorMessageFromResponse(response.status, parsed), response.status, parsed)
  }
  return (text ? parsed : undefined) as T
}

export const authApi = {
  login: (code: string, pwd: string) => request<UserSession>('api/student/auth', { method: 'POST', body: JSON.stringify({ code, pwd }) }),
  logout: () => request<void>('api/student/logout'),
}

export const exerciseApi = {
  tags: (qBaseType: number, level: number) => request<Tag[]>(`api/student/list-tag?qBaseType=${qBaseType}&level=${level}`),
  quota: () => request<Quota>('api/student/quota'),
  gate: () => request<GateStatus | null>('api/student/gate'),
  captcha: (sessionId?: string) => request<CaptchaChallenge>(sessionId ? `api/student/captcha?sessionId=${encodeURIComponent(sessionId)}` : 'api/student/captcha'),
  challenge: () => request<{ currentLevel: number } | null>('api/student/challenge/active'),
  choose: (qBaseType: number, level: number, tagId: number) => request<ChooseResult>('api/student/choose-q', {
    method: 'POST', body: JSON.stringify([{ qBaseType, number: qBaseType < 4 ? 5 : 1, level, tagId }]),
  }),
  paper: (sessionId: string) => request<PaperRecord>(`api/student/record/${encodeURIComponent(sessionId)}`),
  run: (code: string, language: number, input: string) => request<Array<{ output: string; error: string }>>('api/student/run-code', {
    method: 'POST', body: JSON.stringify({ code, language, input: [input] }),
  }),
  save: (body: unknown) => request<{ code: number; timeLeft: number }>('api/student/post-answer', { method: 'POST', body: JSON.stringify(body) }),
  format: (code: string, language: number) => request<{ data: string }>('api/student/format-code', { method: 'POST', body: JSON.stringify({ code, language }) }),
  score: (sessionId: string) => request<ScoreResult[]>(`api/student/score-result/${encodeURIComponent(sessionId)}`),
  rescore: (sessionId: string) => request<number>(`api/student/rescore?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST', body: 'null' }),
  challengeStart: (tagId: number) => request<{ code: number; run?: { sessionId: string; id?: number; runId?: string } }>('api/student/challenge/start', { method: 'POST', body: JSON.stringify({ tagId }) }),
  submit: (sessionId: string, captcha?: CaptchaSubmission | null) => request<boolean | null>(`api/student/submit?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: JSON.stringify(captcha ? { captchaId: captcha.captchaId, captchaTrack: captcha.captchaTrack } : null),
  }),
  history: (index: number, size: number, search = '', tagId = 0) => request<HistoryPage>(`api/student/history?tagId=${tagId}`, { method: 'POST', body: JSON.stringify({ index, size, search }) }),
  historyTags: async () => {
    const items = await request<HistoryTagRaw[]>('api/student/record-tag')
    return (items || []).map(normalizeHistoryTag).filter((item): item is HistoryTag => item !== null)
  },
  historyOverview: async () => {
    const data = await request<HistoryOverviewPoint[] | HistoryOverviewPoint[][]>('api/student/record-year')
    return Array.isArray(data) ? data.flat() : []
  },
  rank: (index: number, size: number, search = '', scope = 0) => request<RankPage>(`api/student/rank?scope=${scope}`, { method: 'POST', body: JSON.stringify({ index, size, search }) }),
}

export async function verificationCode(sessionId: string) {
  if (window.desktop) return window.desktop.verification(sessionId)
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} ${sessionId}`
  const { default: md5 } = await import('blueimp-md5')
  return md5(date)
}
