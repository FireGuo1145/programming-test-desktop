import { describe, expect, it, vi } from 'vitest'
import { solveWithTools } from './ai-agent'
import type { AIMessage } from './ai-types'
const context = { question: '输入整数，输出两倍。', language: 'C', code: 'old', input: '2' }
const call = (name: string, args: unknown, id = name): AIMessage => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
const finish: AIMessage = { role: 'assistant', content: '完成' }
const solution = { code: 'int main(void) { return 0; }', explanation: '说明' }
function options(complete: ReturnType<typeof vi.fn>, controller = new AbortController()) {
  return { context, complete, signal: controller.signal, run: vi.fn().mockResolvedValue([{ output: '4', error: '' }]), onEvent: vi.fn() }
}
describe('AI tools workflow', () => {
  it('reads, tests, fills and returns a tool-produced solution with call IDs preserved', async () => {
    const complete = vi.fn().mockResolvedValueOnce(call('get_question', {})).mockResolvedValueOnce(call('run_code', { code: solution.code, input: '2' })).mockResolvedValueOnce(call('set_editor_code', solution)).mockResolvedValueOnce(finish)
    const config = options(complete)
    expect(await solveWithTools(config)).toEqual(solution)
    expect(config.run).toHaveBeenCalledWith(solution.code, '2')
    const messages = complete.mock.calls[3][0] as AIMessage[]
    expect(messages.find(message => message.role === 'tool' && message.tool_call_id === 'get_question')?.content).toContain('输入整数')
    expect(messages.filter(message => message.role === 'tool')).toHaveLength(3)
  })
  it('rejects unknown tools without executing them and lets the model recover', async () => {
    const complete = vi.fn().mockResolvedValueOnce(call('submit', {})).mockResolvedValueOnce(call('get_question', {})).mockResolvedValueOnce(call('set_editor_code', solution)).mockResolvedValueOnce(finish)
    const config = options(complete)
    await expect(solveWithTools(config)).resolves.toEqual(solution)
    const messages = complete.mock.calls[1][0] as AIMessage[]
    expect(messages.find(message => message.role === 'tool')?.content).toContain('不支持的工具')
    expect(config.run).not.toHaveBeenCalled()
  })
  it('does not accept prose or fenced code as a completed editor write', async () => {
    const complete = vi.fn().mockResolvedValueOnce(call('get_question', {})).mockResolvedValue(call('set_editor_code', { code: '```c\nint main(){}\n```', explanation: 'x' }))
    await expect(solveWithTools(options(complete))).rejects.toThrow('未调用填写代码工具')
  })
  it('stops before subsequent tools if cancelled during a model response', async () => {
    const controller = new AbortController()
    const complete = vi.fn().mockImplementation(async () => { controller.abort(); return call('run_code', { code: 'x', input: '' }) })
    const config = options(complete, controller)
    await expect(solveWithTools(config)).rejects.toThrow()
    expect(config.run).not.toHaveBeenCalled()
  })
  it('does not send another completion after cancellation during code execution', async () => {
    const controller = new AbortController()
    const complete = vi.fn().mockResolvedValueOnce(call('get_question', {})).mockResolvedValueOnce(call('run_code', { code: 'x', input: '' }))
    const config = options(complete, controller)
    config.run.mockImplementation(async () => { controller.abort(); return [] })
    await expect(solveWithTools(config)).rejects.toThrow()
    expect(complete).toHaveBeenCalledTimes(2)
  })
})
