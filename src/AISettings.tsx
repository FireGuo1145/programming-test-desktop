import { useEffect, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { aiBridge } from './ai-client'
import type { AISettings as Settings } from './ai-types'

export default function AISettings({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    try { void aiBridge().getSettings().then(value => { if (live) setSettings(value) }).catch(e => { if (live) setError(e.message) }) }
    catch (e) { setError(e instanceof Error ? e.message : '读取设置失败') }
    return () => { live = false }
  }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!settings || busy) return
    setBusy(true); setError('')
    try {
      await aiBridge().saveSettings({ baseUrl: settings.baseUrl, model: settings.model, protocol: settings.protocol, timeoutSeconds: settings.timeoutSeconds, apiKey, rememberKey: settings.rememberKey, clearKey })
      setApiKey(''); onSaved?.(); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : '保存配置失败') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="confirm-modal ai-settings" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title"><button className="modal-close" aria-label="关闭 AI 设置" disabled={busy} onClick={onClose}><X size={17} /></button><div className="confirm-icon"><Settings2 size={20} /></div><div className="eyebrow">AI ASSISTANT / CONNECTION</div><h2 id="ai-settings-title">AI 接口设置</h2><p>配置支持工具调用的模型，在题目页点击“AI帮忙”自动解题并填入代码。</p>
      {settings ? <form onSubmit={save}><label className="field-label" htmlFor="ai-base">接口地址</label><input id="ai-base" type="url" required value={settings.baseUrl} placeholder="https://api.example.com/v1" onChange={e => setSettings({ ...settings, baseUrl: e.target.value })} /><span className="ai-field-hint">填写 Base URL，也可填写完整的 completions 或 responses 地址。</span>
        <div className="ai-settings-grid"><div><label className="field-label" htmlFor="ai-protocol">接口协议</label><select id="ai-protocol" value={settings.protocol} onChange={e => setSettings({ ...settings, protocol: e.target.value as Settings['protocol'] })}><option value="chat-completions">Chat Completions</option><option value="responses">Responses</option></select></div><div><label className="field-label" htmlFor="ai-timeout">单次请求超时 / 秒</label><input id="ai-timeout" type="number" required min="15" max="300" value={settings.timeoutSeconds} onChange={e => setSettings({ ...settings, timeoutSeconds: Number(e.target.value) })} /></div></div>
        <label className="field-label" htmlFor="ai-model">模型 ID</label><input id="ai-model" required value={settings.model} placeholder="填写服务商提供的模型 ID" onChange={e => setSettings({ ...settings, model: e.target.value })} />
        <label className="field-label" htmlFor="ai-key">API Key {settings.hasKey && !clearKey && <span className="ai-key-state">已配置</span>}</label><input id="ai-key" type="password" autoComplete="off" value={apiKey} placeholder={settings.hasKey && !clearKey ? '留空保留已有密钥；更换接口需重新填写' : '本地服务无需密钥时可留空'} onChange={e => { setApiKey(e.target.value); setClearKey(false) }} />
        <label className="ai-checkbox"><input type="checkbox" checked={settings.rememberKey} disabled={!settings.canRememberKey} onChange={e => setSettings({ ...settings, rememberKey: e.target.checked })} />通过系统密钥环记住 API Key</label><span className="ai-field-hint">{settings.canRememberKey ? '未勾选时，密钥只在本次应用启动期间使用。' : '系统密钥环不可用，密钥仅在本次启动期间使用。'}</span>
        {settings.hasKey && <label className="ai-checkbox"><input type="checkbox" checked={clearKey} onChange={e => { setClearKey(e.target.checked); if (e.target.checked) setApiKey('') }} />清除已有密钥</label>}
        <p className="ai-sharing-note">“AI帮忙”会向以上接口发送当前题目、代码与测试结果。接口和模型须支持 tools/function calling。</p>
        {error && <p className="error-inline" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy || !settings.baseUrl.trim() || !settings.model.trim()}>{busy ? '正在保存…' : '保存配置'}</button></div>
      </form> : error ? <p className="error-inline" role="alert">{error}</p> : <p>正在加载配置…</p>}
    </section>
  </div>
}
