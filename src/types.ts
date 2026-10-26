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

declare global {
  interface Window {
    desktop?: { platform: string; isElectron: boolean; request: (request: { path: string; method: string; body?: string }) => Promise<unknown>; config: () => Promise<{ apiBase: string }>; verification: (sessionId: string) => Promise<string> }
  }
}

export interface ScoreResult {
  globalId: string
  score: number
  qType: number
  scoreResult?: unknown
}
