import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { completion, normalizeConfig } = require('../electron/ai.cjs')
const config = { baseUrl: 'https://example.com/v1', model: 'configured-model', protocol: 'chat-completions', timeoutSeconds: 30 }
const signal = () => new AbortController().signal
const input = { messages: [{ role: 'user', content: '题目' }], tools: [{ type: 'function', function: { name: 'get_question', description: 'get', parameters: { type: 'object', properties: {} }, strict: true } }] }
describe('AI completion transport', () => {
  it('sends configured model, authentication and real function tool definitions', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'get_question', arguments: '{}' } }] } }] })))
    const result = await completion(config, 'test-secret', input, signal(), fetch)
    expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions')
    const options = fetch.mock.calls[0][1]
    expect(options.headers.Authorization).toBe('Bearer test-secret')
    expect(JSON.parse(options.body)).toMatchObject({ model: 'configured-model', tools: input.tools })
    expect(result.tool_calls[0].id).toBe('a')
  })
  it('keeps response reasoning items and matches function outputs by call ID', async () => {
    const reasoning = { type: 'reasoning', id: 'r', encrypted_content: 'encrypted' }
    const fn = { type: 'function_call', call_id: 'call-1', name: 'get_question', arguments: '{}' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [reasoning, fn] })))
    const first = await completion({ ...config, protocol: 'responses' }, '', input, signal(), fetch)
    expect(first.providerItems).toEqual([reasoning, fn])
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [] })))
    await completion({ ...config, protocol: 'responses' }, '', { ...input, messages: [...input.messages, first, { role: 'tool', tool_call_id: 'call-1', content: '题目' }] }, signal(), fetch)
    const body = JSON.parse(fetch.mock.calls[1][1].body)
    expect(body.input).toContainEqual(reasoning)
    expect(body.input).toContainEqual({ type: 'function_call_output', call_id: 'call-1', output: '题目' })
    expect(body.store).toBe(false)
  })
  it('redacts credentials echoed by provider errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad test-secret' } }), { status: 401 }))
    await expect(completion(config, 'test-secret', input, signal(), fetch)).rejects.toThrow('已隐藏密钥')
  })
  it('normalizes full endpoints and rejects unsafe URL components', () => {
    expect(normalizeConfig({ ...config, baseUrl: 'https://example.com/v1/chat/completions' }).baseUrl).toBe(config.baseUrl)
    expect(() => normalizeConfig({ ...config, baseUrl: 'https://user:password@example.com/v1' })).toThrow()
    expect(() => normalizeConfig({ ...config, baseUrl: 'file:///tmp/a' })).toThrow()
  })
  it('reports context truncation as failure instead of writing incomplete code', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'incomplete' } }] })))
    await expect(completion(config, '', input, signal(), fetch)).rejects.toThrow('长度限制')
  })
})
