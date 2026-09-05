import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@daoai/cordis'
import LlmRuntime, { createUserMessage, ToolCallId, ReasoningEffortId } from '@daoai/dao-llm'
import type { Message, ToolSchema } from '@daoai/dao-llm'
import CredentialsLocal from '@daoai/dao-credentials-local'
import * as LlmPiAi from '@daoai/dao-llm-pi-ai'
import type { PiAiProviderProfile } from '@daoai/dao-llm-pi-ai'
import { assemble, type AssembledResult } from './assemble.ts'

/**
 * Real-farm e2e for the pi-ai-backed adapter: the resident llama-router
 * card's default preset at the route's `high` default, at explicit `off`
 * and `high`, plus a replayed tool follow-up. The key resolves through the
 * credential store's live process environment (the e2e config loads the
 * gitignored root `.env`). Self-skips when the farm is unreachable — the
 * `DAO_FARM_REACHABLE` marker the e2e config sets after probing the router.
 */

const ROUTE = 'llama-router'
const MODEL = 'Qwen3.8-27B-Q6_K_XL-128K'
const contexts: Context[] = []

const farmProfile: PiAiProviderProfile = {
  displayName: 'Local Llama Router',
  apiKeyEnv: 'LLAMA_ROUTER_API_KEY',
  api: 'openai-completions',
  baseURL: 'http://100.110.212.93:8081/v1',
  reasoning: 'high',
  compat: { thinkingFormat: 'qwen-chat-template' },
  models: [{
    id: MODEL,
    contextWindow: 131072,
    maxTokens: 65536,
    reasoningEfforts: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  }],
}

function ask(prompt: string): Message[] {
  return [createUserMessage({
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'user' },
  })]
}

function textOf(result: AssembledResult): string {
  return result.message.content
    .filter(block => block.type === 'text')
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
}

const weatherTool: ToolSchema = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
    additionalProperties: false,
  },
}

async function harness(config: Partial<PiAiProviderProfile> = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(CredentialsLocal)
  await ctx.plugin(LlmPiAi, {
    providers: { [ROUTE]: { ...farmProfile, ...config } },
  })
  return ctx
}

describe.skipIf(!process.env.DAO_FARM_REACHABLE)('llm-pi-ai e2e (local farm)', () => {
  afterEach(async () => {
    await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  })

  it('route-default reasoning high: reasoning block plus plain text', async () => {
    const ctx = await harness()
    const result = await assemble(ctx, {
      provider: ROUTE,
      model: MODEL,
      messages: ask('Reply with exactly the word: pong'),
      maxTokens: 2000,
    })
    expect(result.finish.kind).toBe('stop')
    expect(result.message.content.some(block => block.type === 'reasoning')).toBe(true)
    expect(textOf(result).toLowerCase()).toContain('pong')
  })

  it('reasoning off: plain text without reasoning blocks', async () => {
    const ctx = await harness()
    const result = await assemble(ctx, {
      provider: ROUTE,
      model: MODEL,
      reasoningEffort: ReasoningEffortId('off'),
      messages: ask('Reply with exactly the word: pong'),
      maxTokens: 2000,
    })
    expect(result.finish.kind).toBe('stop')
    expect(result.message.content.some(block => block.type === 'reasoning')).toBe(false)
    expect(textOf(result).toLowerCase()).toContain('pong')
  })

  it('reasoning high: reasoning blocks present', async () => {
    const ctx = await harness()
    const result = await assemble(ctx, {
      provider: ROUTE,
      model: MODEL,
      reasoningEffort: ReasoningEffortId('high'),
      messages: ask('Which is larger, 9.11 or 9.8? Answer with just the number.'),
      maxTokens: 2000,
    })
    expect(result.finish.kind).toBe('stop')
    expect(result.message.content.some(block => block.type === 'reasoning')).toBe(true)
    expect(textOf(result)).toContain('9.8')
  })

  it('reasoning high: tool-call round trip', async () => {
    const ctx = await harness()

    const first = await assemble(ctx, {
      provider: ROUTE,
      model: MODEL,
      reasoningEffort: ReasoningEffortId('high'),
      messages: ask('What is the weather in Paris right now? Use the get_weather tool.'),
      tools: [weatherTool],
      maxTokens: 2000,
    })
    expect(first.finish.kind).toBe('tool-calls')
    const call = first.message.content.find(block => block.type === 'tool-call')
    expect(call).toBeDefined()
    expect(call!.name).toBe('get_weather')
    expect(JSON.parse(call!.arguments)).toMatchObject({ city: expect.stringMatching(/paris/i) as string })

    const second = await assemble(ctx, {
      provider: ROUTE,
      model: MODEL,
      reasoningEffort: ReasoningEffortId('high'),
      messages: [
        ...ask('What is the weather in Paris right now? Use the get_weather tool.'),
        first.message,
        createUserMessage({
          content: [{
            type: 'tool-result',
            toolCallId: ToolCallId(call!.id),
            content: [{ type: 'text', text: 'Sunny, 22°C' }],
          }],
          source: { kind: 'plugin', plugin: 'test' },
        }),
      ],
      tools: [weatherTool],
      maxTokens: 2000,
    })
    expect(second.finish.kind).toBe('stop')
    expect(textOf(second).toLowerCase()).toMatch(/sunny|22/)
  })
})
