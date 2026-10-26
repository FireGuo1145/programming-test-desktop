const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const { createHash } = require('node:crypto')
const path = require('node:path')
const isDev = process.argv.includes('--dev')
const config = require('../server.config.json')
const server = new URL(config.apiBase)
if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password) throw new Error('服务地址必须为 HTTP(S) URL')
server.pathname = server.pathname.replace(/\/$/, '') + '/'
const allowed = new Set(['auth', 'logout', 'list-tag', 'quota', 'choose-q', 'post-answer', 'submit', 'run-code', 'format-code', 'challenge/active', 'challenge/start', 'challenge/next', 'challenge/run', 'challenge/score-result'])
function trusted(event) {
  const url = event.senderFrame?.url || ''
  return isDev ? new URL(url).origin === 'http://127.0.0.1:5173' : url === require('node:url').pathToFileURL(path.join(__dirname, '../dist/index.html')).href || url.startsWith(require('node:url').pathToFileURL(path.join(__dirname, '../dist/index.html')).href + '#')
}
ipcMain.handle('student:request', async (event, request) => {
  if (!trusted(event)) throw new Error('不可信的调用来源')
  if (!request || typeof request.path !== 'string' || !['GET', 'POST'].includes(request.method)) throw new Error('无效请求')
  const relative = new URL(request.path, 'http://placeholder/')
  const route = relative.pathname.replace(/^\/api\/student\//, '')
  if (!request.path.startsWith('api/student/') || (!allowed.has(route) && !/^record\/[a-zA-Z0-9-]+$/.test(route) && !/^score-result\/[a-zA-Z0-9-]+$/.test(route) && !/^challenge\/(run|score-result)\/[a-zA-Z0-9-]+$/.test(route))) throw new Error('接口不在允许列表中')
  const url = new URL(request.path, server)
  const response = await fetch(url, { method: request.method, headers: { 'Content-Type': 'application/json' }, body: request.method === 'POST' ? request.body : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' })
  const text = await response.text()
  if (!response.ok) throw new Error(`服务请求失败 (${response.status})`)
  try { return text ? JSON.parse(text) : null } catch { throw new Error('服务返回了非 JSON 数据，请检查服务地址') }
})
ipcMain.handle('student:config', () => ({ apiBase: server.href.replace(/\/$/, '') }))
ipcMain.handle('student:verification', (event, sessionId) => {
  if (!trusted(event) || typeof sessionId !== 'string' || sessionId.length > 200) throw new Error('无效会话')
  const date = new Date()
  const pad = value => String(value).padStart(2, '0')
  return createHash('md5').update(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${sessionId}`).digest('hex')
})
require('./ai.cjs').registerAI({ app, ipcMain, safeStorage, trusted })

function createWindow() {
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 680, backgroundColor: '#f4f5f3', title: '题序 Practice Desk', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (!(isDev && url.startsWith('http://127.0.0.1:5173/'))) event.preventDefault() })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  if (isDev) {
    window.webContents.once('did-finish-load', () => window.webContents.openDevTools({ mode: 'detach' }))
    window.loadURL('http://127.0.0.1:5173')
  }
  else window.loadFile(path.join(__dirname, '../dist/index.html'))
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
