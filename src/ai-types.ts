export interface AISettings {
  baseUrl: string
  model: string
  protocol: 'chat-completions' | 'responses'
  timeoutSeconds: number
  hasKey: boolean
  rememberKey: boolean
  canRememberKey: boolean
}
export type AISettingsInput = Pick<AISettings, 'baseUrl' | 'model' | 'protocol' | 'timeoutSeconds'> & { apiKey?: string; rememberKey: boolean; clearKey?: boolean }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
  providerItems?: unknown[]
  reasoning_content?: string
}
export interface AITool { type: 'function'; function: { name: string; description: string; strict: boolean; parameters: Record<string, unknown> } }
export interface AICompletionRequest { requestId: string; messages: AIMessage[]; tools: AITool[]; toolChoice: 'auto' | 'required' }
export interface AIBridge {
  getSettings: () => Promise<AISettings>
  saveSettings: (settings: AISettingsInput) => Promise<AISettings>
  complete: (request: AICompletionRequest) => Promise<AIMessage>
  cancel: (requestId: string) => Promise<void>
}
export interface AIEvent { type: 'status' | 'tool' | 'message' | 'error'; text: string }
