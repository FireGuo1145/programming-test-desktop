import { useEffect, useRef, useState } from 'react'
import { RefreshCw, ShieldCheck, X } from 'lucide-react'
import { ApiError, exerciseApi } from './api'
import type { CaptchaChallenge, CaptchaSubmission, CaptchaTrackPoint } from './types'

const DISPLAY_WIDTH = 300
const THUMB_WIDTH = 44
const MAX_THUMB_X = DISPLAY_WIDTH - THUMB_WIDTH

const SHA256_K = new Uint32Array([
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
  3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
  3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
  2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
  666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
  2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
  430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
  1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298,
])

function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

export function sha256Bytes(input: string): Uint8Array {
  const bytes = utf8Bytes(input)
  const bitLen = bytes.length * 8
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64
  const buf = new Uint8Array(paddedLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 4294967296), false)
  view.setUint32(paddedLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3)
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false); outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false); outView.setUint32(28, h7, false)
  return out
}

export function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
  if (bits <= 0) return true
  if (bits > digest.length * 8) return false
  const fullBytes = Math.floor(bits / 8)
  for (let i = 0; i < fullBytes; i++) {
    if (digest[i] !== 0) return false
  }
  const rem = bits % 8
  if (rem > 0) {
    const mask = (0xff << (8 - rem)) & 0xff
    if ((digest[fullBytes] & mask) !== 0) return false
  }
  return true
}

export async function computePowNonce(salt: string, bits: number, batchSize = 500): Promise<string> {
  if (!salt || bits <= 0) return '0'
  let n = 0
  for (;;) {
    const end = n + batchSize
    for (; n < end; n++) {
      const candidate = String(n)
      if (hasLeadingZeroBits(sha256Bytes(`${salt}:${candidate}`), bits)) return candidate
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

interface CaptchaModalProps {
  challenge: CaptchaChallenge
  sessionId: string
  notice?: string
  onSubmit: (submission: CaptchaSubmission) => void
  onClose: () => void
}

export default function CaptchaModal({ challenge: initialChallenge, sessionId, notice, onSubmit, onClose }: CaptchaModalProps) {
  const [challenge, setChallenge] = useState<CaptchaChallenge>(initialChallenge)
  const [thumbX, setThumbX] = useState(0)
  const [pieceX, setPieceX] = useState(0)
  const [rotateDeg, setRotateDeg] = useState(0)
  const [verifying, setVerifying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(notice || '')

  const draggingRef = useRef(false)
  const startClientXRef = useRef(0)
  const startClientYRef = useRef(0)
  const startTimeRef = useRef(0)
  const trackListRef = useRef<CaptchaTrackPoint[]>([])

  useEffect(() => {
    setChallenge(initialChallenge)
    resetDrag()
    setError(notice || '')
  }, [initialChallenge, notice])

  const isRotate = (challenge.type ?? '').toUpperCase() === 'ROTATE'
  const bgWidth = challenge.bgWidth || 600
  const bgHeight = challenge.bgHeight || 360
  const sliderWidth = challenge.sliderWidth || 110
  const displayHeight = Math.round(DISPLAY_WIDTH * (bgHeight / bgWidth))
  const displaySliderWidth = Math.round(sliderWidth * (DISPLAY_WIDTH / bgWidth))
  const sliderMaxX = Math.max(1, DISPLAY_WIDTH - displaySliderWidth)

  function resetDrag() {
    draggingRef.current = false
    setThumbX(0)
    setPieceX(0)
    setRotateDeg(0)
    trackListRef.current = []
  }

  async function refresh() {
    if (refreshing || verifying) return
    setRefreshing(true)
    setError('')
    resetDrag()
    try {
      const next = await exerciseApi.captcha(sessionId)
      setChallenge(next)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setError('刷新过于频繁，请稍后再试')
      } else {
        setError('验证码加载失败，请点击换一张重试')
      }
    } finally {
      setRefreshing(false)
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (verifying || refreshing) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    setError('')
    draggingRef.current = true
    startClientXRef.current = event.clientX
    startClientYRef.current = event.clientY
    startTimeRef.current = Date.now()
    setThumbX(0)
    setPieceX(0)
    setRotateDeg(0)
    trackListRef.current = [{ x: 0, y: 0, t: 0, type: 'down' }]
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    const nextThumbX = Math.max(0, Math.min(MAX_THUMB_X, event.clientX - startClientXRef.current))
    setThumbX(nextThumbX)
    const ratio = nextThumbX / MAX_THUMB_X
    let trackX: number
    if (isRotate) {
      setRotateDeg(ratio * 360)
      trackX = ratio * DISPLAY_WIDTH
    } else {
      const nextPieceX = ratio * sliderMaxX
      setPieceX(nextPieceX)
      trackX = nextPieceX
    }
    const list = trackListRef.current
    const prevT = list.length ? list[list.length - 1].t : 0
    const nextT = Math.max(prevT, Date.now() - startTimeRef.current)
    list.push({
      x: Math.round(trackX * 10) / 10,
      y: Math.round(event.clientY - startClientYRef.current),
      t: nextT,
      type: 'move',
    })
  }

  async function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    event.preventDefault()
    draggingRef.current = false
    const nextThumbX = Math.max(0, Math.min(MAX_THUMB_X, event.clientX - startClientXRef.current))
    if (nextThumbX < 5) {
      resetDrag()
      return
    }
    setThumbX(nextThumbX)
    const ratio = nextThumbX / MAX_THUMB_X
    let trackX: number
    if (isRotate) {
      setRotateDeg(ratio * 360)
      trackX = ratio * DISPLAY_WIDTH
    } else {
      const nextPieceX = ratio * sliderMaxX
      setPieceX(nextPieceX)
      trackX = nextPieceX
    }
    const stopTime = Date.now()
    const list = trackListRef.current
    const prevT = list.length ? list[list.length - 1].t : 0
    const nextT = Math.max(prevT, stopTime - startTimeRef.current)
    list.push({
      x: Math.round(trackX * 10) / 10,
      y: Math.round(event.clientY - startClientYRef.current),
      t: nextT,
      type: 'up',
    })

    setVerifying(true)
    try {
      const powNonce = await computePowNonce(challenge.powSalt ?? '', challenge.powBits ?? 0)
      onSubmit({
        captchaId: challenge.captchaId,
        captchaTrack: {
          bgImageWidth: DISPLAY_WIDTH,
          bgImageHeight: displayHeight,
          sliderImageWidth: displaySliderWidth,
          sliderImageHeight: displayHeight,
          startTime: startTimeRef.current,
          stopTime,
          trackList: [...list],
          powNonce,
        },
      })
    } finally {
      setVerifying(false)
    }
  }

  function onPointerCancel() {
    if (draggingRef.current) resetDrag()
  }

  return (
    <div className="modal-backdrop">
      <div className="confirm-modal captcha-modal" role="dialog" aria-modal="true" aria-labelledby="captcha-title">
        <div className="confirm-icon"><ShieldCheck size={20} /></div>
        <button className="modal-close" disabled={verifying} onClick={onClose} aria-label="关闭"><X size={17} /></button>
        <div className="eyebrow">HUMAN VERIFICATION</div>
        <h2 id="captcha-title">本次提交需要人机验证</h2>
        <div
          className={`captcha-stage ${isRotate ? 'is-rotate' : ''}`}
          style={{ width: `${DISPLAY_WIDTH}px`, height: `${displayHeight}px` }}
        >
          <img className="captcha-bg" src={challenge.bgImage} alt="验证背景图" draggable={false} />
          {isRotate ? (
            <img
              className="captcha-rotate-piece"
              src={challenge.sliderImage}
              alt="旋转验证图"
              draggable={false}
              style={{ transform: `translateX(-50%) rotate(${rotateDeg}deg)` }}
            />
          ) : (
            <img
              className="captcha-slider-piece"
              src={challenge.sliderImage}
              alt="拼图滑块"
              draggable={false}
              style={{ width: `${displaySliderWidth}px`, transform: `translateX(${pieceX}px)` }}
            />
          )}
        </div>
        <div className="slider-track" style={{ width: `${DISPLAY_WIDTH}px` }}>
          <div className="slider-fill" style={{ width: `${thumbX + THUMB_WIDTH / 2}px` }} />
          <span className="slider-hint">
            {verifying ? '正在校验…' : isRotate ? '向右拖动滑块旋转图片至正位' : '向右拖动滑块完成拼图'}
          </span>
          <div
            role="slider"
            aria-label={isRotate ? '向右拖动滑块旋转图片至正位' : '向右拖动滑块完成拼图'}
            aria-valuemin={0}
            aria-valuemax={MAX_THUMB_X}
            aria-valuenow={Math.round(thumbX)}
            tabIndex={0}
            className="slider-thumb"
            style={{ transform: `translateX(${thumbX}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            →
          </div>
        </div>
        {error && <p role="alert" className="error-inline captcha-error">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" disabled={refreshing || verifying} onClick={() => void refresh()}>
            <RefreshCw size={14} />换一张
          </button>
          <button className="secondary-button" type="button" disabled={verifying} onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}
