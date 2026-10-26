import type { PaperRecord, Quota, ScoreResult, Tag, UserSession } from './types'

import server from '../server.config.json'
const SESSION_KEY = 'practice-desk-session'

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
  if (window.desktop) return window.desktop.request({ path: requestPath, method: options.method || 'GET', body: options.body as string | undefined }) as Promise<T>
  const response = await fetch(`/backend/${requestPath}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(30000) })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `请求失败 (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  try { return text ? JSON.parse(text) as T : undefined as T } catch { throw new Error('服务返回了非 JSON 数据') }
}

export const authApi = {
  login: (code: string, pwd: string) => request<UserSession>('api/student/auth', { method: 'POST', body: JSON.stringify({ code, pwd }) }),
  logout: () => request<void>('api/student/logout'),
}

export const exerciseApi = {
  tags: (qBaseType: number, level: number) => request<Tag[]>(`api/student/list-tag?qBaseType=${qBaseType}&level=${level}`),
  quota: () => request<Quota>('api/student/quota'),
  challenge: () => request<{ currentLevel: number } | null>('api/student/challenge/active'),
  choose: (qBaseType: number, level: number, tagId: number) => request<{ code: number; sessionId: string }>('api/student/choose-q', {
    method: 'POST', body: JSON.stringify([{ qBaseType, number: qBaseType < 4 ? 5 : 1, level, tagId }]),
  }),
  paper: (sessionId: string) => request<PaperRecord>(`api/student/record/${encodeURIComponent(sessionId)}`),
  run: (code: string, language: number, input: string) => request<Array<{ output: string; error: string }>>('api/student/run-code', {
    method: 'POST', body: JSON.stringify({ code, language, input: [input] }),
  }),
  save: (body: unknown) => request<{ code: number; timeLeft: number }>('api/student/post-answer', { method: 'POST', body: JSON.stringify(body) }),
  format: (code: string, language: number) => request<{ data: string }>('api/student/format-code', { method: 'POST', body: JSON.stringify({ code, language }) }),
  score: (sessionId: string) => request<ScoreResult[]>(`api/student/score-result/${encodeURIComponent(sessionId)}`),
  challengeStart: (tagId: number) => request<{ code: number; run?: { sessionId: string; id?: number; runId?: string } }>('api/student/challenge/start', { method: 'POST', body: JSON.stringify({ tagId }) }),
  submit: (sessionId: string) => request<boolean | null>(`api/student/submit?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST', body: 'null' }),
}

export async function verificationCode(sessionId: string) {
  if (window.desktop) return window.desktop.verification(sessionId)
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} ${sessionId}`
  const { default: md5 } = await import('blueimp-md5')
  return md5(date)
}
