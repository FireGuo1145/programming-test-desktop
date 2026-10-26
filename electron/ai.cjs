const fs = require('node:fs/promises')
const path = require('node:path')

const DEFAULTS = { baseUrl: '', model: '', protocol: 'chat-completions', timeoutSeconds: 120 }

function normalizeConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('AI 配置无效')
  let url
  try { url = new URL(value.baseUrl) } catch { throw new Error('请输入完整的 AI 接口地址') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址须为 HTTP(S)，不能包含密码、查询参数或片段')
  url.pathname = url.pathname.replace(/\/(chat\/completions|responses)\/?$/, '').replace(/\/$/, '')
  if (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 200) throw new Error('请输入模型 ID')
  if (!['chat-completions', 'responses'].includes(value.protocol)) throw new Error('接口协议无效')
  const timeoutSeconds = Number(value.timeoutSeconds)
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 15 || timeoutSeconds > 300) throw new Error('超时须为 15–300 秒')
  return { baseUrl: url.href.replace(/\/$/, ''), model: value.model.trim(), protocol: value.protocol, timeoutSeconds }
}

function responsesInput(messages) {
  return messages.flatMap(message => {
    if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }]
    if (message.role === 'assistant') {
      if (Array.isArray(message.providerItems)) return message.providerItems
      const items = []
      if (message.content) items.push({ role: 'assistant', content: message.content })
      for (const call of message.tool_calls || []) items.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments })
      return items
    }
    return [{ role: message.role, content: message.content }]
  })
}

async function completion(config, key, input, signal, fetchImpl = fetch) {
  const valid = normalizeConfig(config)
  if (!Array.isArray(input.messages) || !Array.isArray(input.tools) || JSON.stringify(input).length > 1500000) throw new Error('AI 请求格式无效或上下文过大')
  const isResponses = valid.protocol === 'responses'
  const body = isResponses ? {
    model: valid.model,
    input: responsesInput(input.messages),
    tools: input.tools.map(tool => ({ type: 'function', ...tool.function })),
    tool_choice: input.toolChoice || 'auto',
    store: false,
    include: ['reasoning.encrypted_content'],
  } : {
    model: valid.model,
    messages: input.messages.map(({ providerItems: _unused, ...message }) => message),
    tools: input.tools,
    tool_choice: input.toolChoice || 'auto',
    stream: false,
  }
  const endpoint = `${valid.baseUrl}/${isResponses ? 'responses' : 'chat/completions'}`
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(valid.timeoutSeconds * 1000)]),
      redirect: 'error',
    })
  } catch (error) {
    if (signal.aborted) throw new Error('已停止 AI 帮忙')
    if (error.name === 'TimeoutError') throw new Error('AI 请求超时，请重试或调高超时设置')
    throw new Error('无法连接 AI 接口，请检查地址和网络')
  }
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`AI 接口返回非 JSON 数据 (${response.status})`) }
  if (!response.ok || data.error) {
    const raw = typeof data.error?.message === 'string' ? data.error.message : `HTTP ${response.status}`
    const message = key ? raw.split(key).join('[已隐藏密钥]') : raw
    throw new Error(`AI 请求失败 (${response.status})：${message.slice(0, 400)}`)
  }
  if (isResponses) {
    if (data.status === 'incomplete' || data.status === 'failed') throw new Error('模型输出未完成，请重试或调整模型设置')
    if (!Array.isArray(data.output)) throw new Error('Responses 返回格式无效')
    const calls = data.output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } }))
    const content = data.output.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n')
    return { role: 'assistant', content: content || null, tool_calls: calls, providerItems: data.output }
  }
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') throw new Error('模型输出达到长度限制，请重试或调整模型设置')
  if (!choice?.message) throw new Error('Chat Completions 返回格式无效')
  const message = choice.message
  if (message.refusal) throw new Error(`模型未能完成请求：${String(message.refusal).slice(0, 300)}`)
  return { role: 'assistant', content: message.content || null, ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}), tool_calls: message.tool_calls || [] }
}

function registerAI({ app, ipcMain, safeStorage, trusted }) {
  let current = { ...DEFAULTS }
  let apiKey = ''
  let remembered = false
  const inflight = new Map()
  const configPath = () => path.join(app.getPath('userData'), 'ai-settings.json')
  const canRemember = () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  const ready = app.whenReady().then(async () => {
    try {
      const stored = JSON.parse(await fs.readFile(configPath(), 'utf8'))
      current = normalizeConfig(stored)
      if (stored.encryptedKey && canRemember()) {
        apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedKey, 'base64'))
        remembered = true
      }
    } catch { /* A missing or obsolete configuration starts with empty defaults. */ }
  })
  const guard = event => { if (!trusted(event)) throw new Error('不可信的调用来源') }
  const publicConfig = () => ({ ...current, hasKey: Boolean(apiKey), rememberKey: remembered, canRememberKey: canRemember() })
  ipcMain.handle('ai:settings:get', async event => { guard(event); await ready; return publicConfig() })
  ipcMain.handle('ai:settings:save', async (event, value) => {
    guard(event); await ready
    if (inflight.size) throw new Error('请先停止正在进行的 AI 请求')
    const next = normalizeConfig(value)
    if (value.apiKey !== undefined && (typeof value.apiKey !== 'string' || value.apiKey.length > 8192 || /[\r\n]/.test(value.apiKey))) throw new Error('API Key 格式无效')
    const nextKey = value.clearKey ? '' : value.apiKey?.trim() || (next.baseUrl === current.baseUrl ? apiKey : '')
    if (value.rememberKey && !canRemember()) throw new Error('系统密钥环暂不可用，可取消记住密钥，仅在本次启动中使用')
    const persist = { ...next, ...(value.rememberKey && nextKey ? { encryptedKey: safeStorage.encryptString(nextKey).toString('base64') } : {}) }
    await fs.mkdir(path.dirname(configPath()), { recursive: true })
    await fs.writeFile(`${configPath()}.tmp`, JSON.stringify(persist, null, 2), { mode: 0o600 })
    await fs.rename(`${configPath()}.tmp`, configPath())
    current = next; apiKey = nextKey; remembered = Boolean(value.rememberKey && nextKey)
    return publicConfig()
  })
  ipcMain.handle('ai:complete', async (event, input) => {
    guard(event); await ready
    if (typeof input?.requestId !== 'string' || input.requestId.length > 100) throw new Error('请求标识无效')
    const owner = event.sender.id
    const id = `${owner}:${input.requestId}`
    if ([...inflight.keys()].some(key => key.startsWith(`${owner}:`))) throw new Error('已有 AI 请求正在进行')
    const controller = new AbortController()
    inflight.set(id, controller)
    const stop = () => controller.abort()
    event.sender.once('destroyed', stop)
    try { return await completion(current, apiKey, input, controller.signal) }
    finally { inflight.delete(id); event.sender.removeListener('destroyed', stop) }
  })
  ipcMain.handle('ai:cancel', (event, id) => { guard(event); inflight.get(`${event.sender.id}:${id}`)?.abort() })
}

module.exports = { registerAI, completion, normalizeConfig, responsesInput }
