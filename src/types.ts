import type { AIBridge } from './ai-types'

export interface UserSession {
  id: number
  name: string
  code: string
  expire: number
  sid: string
}

export interface Tag {
  id: number
  content: string
  contentEn?: string
  available?: boolean
}

export interface Quota {
  weekUsed: number
  weekLimit: number
  weekExhausted: boolean
  dayUsed: number
  dayLimit: number
  dayExhausted: boolean
  pendingCount: number
  pendingLimit: number
  pendingExhausted: boolean
}

export interface Question {
  id: number
  globalId: string
  content: string
  contentEn?: string
  qType: number
  language?: number
  options?: { globalId: string; content: string }[]
  point?: number
}

export interface Answer {
  globalId: string
  qType: number
  answer: string | number | string[] | { globalId: string; content: string }[]
  keySequence?: number[]
  inputSequence?: number[]
}

export type ObjectiveAnswer = string | number | { globalId: string; content: string }[]

export type AnswerPaper = Record<`q${0 | 1 | 2 | 3 | 4 | 5}`, Answer[]>

export interface PaperRecord {
  score?: number
  fullScore?: number
  state: number
  canViewCode?: boolean
  buyCode?: boolean
  sessionId: string
  timeLeft: number
  totalTime: number
  paper: { questions: Question[] }
  answerPaper: AnswerPaper
}

export interface DesktopRequestResult {
  ok: boolean
  status: number
  data: unknown
}

export interface GateStatus {
  until?: string | null
}

export interface CaptchaChallenge {
  captchaId: string
  type?: string
  bgImage: string
  sliderImage: string
  bgWidth?: number
  bgHeight?: number
  sliderWidth?: number
  powSalt?: string
  powBits?: number
}

export interface CaptchaTrackPoint {
  x: number
  y: number
  t: number
  type: 'down' | 'move' | 'up'
}

export interface CaptchaTrack {
  bgImageWidth: number
  bgImageHeight: number
  sliderImageWidth: number
  sliderImageHeight: number
  startTime: number
  stopTime: number
  trackList: CaptchaTrackPoint[]
  powNonce: string
}

export interface CaptchaSubmission {
  captchaId: string
  captchaTrack: CaptchaTrack
}

export interface ChooseResult {
  code: number
  sessionId: string
  waitSeconds?: number
}

declare global {
  interface Window {
    desktop?: { ai: AIBridge; platform: string; isElectron: boolean; request: (request: { path: string; method: string; body?: string }) => Promise<DesktopRequestResult>; config: () => Promise<{ apiBase: string }>; verification: (sessionId: string) => Promise<string> }
  }
}

export interface ScoreResult {
  globalId: string
  score: number
  qType: number
  scoreResult?: unknown
}

export interface HistoryRecord {
  sessionId: string
  state: number
  score?: number
  fullScore?: number
  startTime?: string
  endTime?: string
  qBaseType?: number
  types?: number[]
  held?: boolean
  questionCount?: number
  tag?: { content?: string; contentEn?: string }
  tagName?: string
  commentCount?: number
  unreadCommentCount?: number
}

export interface HistoryTag {
  id: number
  content: string
  contentEn?: string
  count?: number
}
export interface HistoryTagRaw {
  id?: number
  content?: string
  contentEn?: string
  tag?: { id: number; content: string; contentEn?: string }
  count?: number
}
export interface HistoryPage { total: number; data: HistoryRecord[] }
export interface HistoryOverviewPoint { date: string; count: number; score: number }
export interface RankEntry { rank?: number; code: string; name: string; totalScore: number; gold: number }
export interface RankPage { total: number; data: RankEntry[] }
