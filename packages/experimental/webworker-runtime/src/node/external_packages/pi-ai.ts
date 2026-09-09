/**
 * `@earendil-works/pi-ai` stub, including its `/providers/all` and `/api/*.lazy`
 * subpaths. The package is Node-only (no `require`/`browser` conditions, Node
 * builtins plus five cloud SDKs in its transport layer) and `llm-pi-ai` imports it
 * statically at module scope, so the row cannot mount without it.
 *
 * Every symbol `llm-pi-ai` imports by name is present: a missing CommonJS symbol
 * would surface as `undefined` at call time instead of a link error. Structural
 * factories answer far enough for the row and its configured provider directory
 * to activate; every model request and authentication operation fails loud.
 */
import { notAvailableError, notImplementedFail } from '../notImplementedFail.ts'

const MODULE = '@earendil-works/pi-ai'

interface WorkerModel {
  readonly id: string
  readonly provider: string
  readonly api?: string
  readonly reasoning?: boolean
  readonly thinkingLevelMap?: Readonly<Partial<Record<WorkerThinkingLevel, string | null>>>
}

type WorkerThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

interface WorkerStreams {
  stream(...args: unknown[]): unknown
  streamSimple(...args: unknown[]): unknown
}

interface WorkerProvider {
  readonly id: string
  readonly name: string
  readonly baseUrl?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly auth: unknown
  getModels(): readonly WorkerModel[]
  stream(...args: unknown[]): unknown
  streamSimple(...args: unknown[]): unknown
}

interface WorkerProviderInput {
  readonly id: string
  readonly name?: string
  readonly baseUrl?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly auth: unknown
  readonly models: readonly WorkerModel[]
  readonly api: WorkerStreams
}

/**
 * Build the static provider record needed during adapter activation.
 * @param input - configured provider metadata, models, and request methods.
 * @returns a provider that answers catalog reads and delegates request methods.
 */
export function createProvider(input: WorkerProviderInput): WorkerProvider {
  return {
    id: input.id,
    name: input.name ?? input.id,
    ...input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl },
    ...input.headers === undefined ? {} : { headers: input.headers },
    auth: input.auth,
    getModels: () => input.models,
    stream: (...args: unknown[]) => input.api.stream(...args),
    streamSimple: (...args: unknown[]) => input.api.streamSimple(...args),
  }
}

/**
 * Build the in-memory provider collection needed by model catalog reads.
 * @returns a mutable provider catalog whose request path reaches the refusing protocol binding.
 */
export function createModels(): {
  setProvider(provider: WorkerProvider): void
  deleteProvider(id: string): void
  clearProviders(): void
  getProviders(): readonly WorkerProvider[]
  getProvider(id: string): WorkerProvider | undefined
  getModels(provider?: string): readonly WorkerModel[]
  getModel(provider: string, id: string): WorkerModel | undefined
  streamSimple(model: WorkerModel, ...args: unknown[]): unknown
  login(...args: unknown[]): never
} {
  const providers = new Map<string, WorkerProvider>()
  return {
    setProvider(provider) { providers.set(provider.id, provider) },
    deleteProvider(id) { providers.delete(id) },
    clearProviders() { providers.clear() },
    getProviders: () => [...providers.values()],
    getProvider: id => providers.get(id),
    getModels: provider => provider === undefined
      ? [...providers.values()].flatMap(entry => entry.getModels())
      : providers.get(provider)?.getModels() ?? [],
    getModel: (provider, id) => providers.get(provider)?.getModels().find(model => model.id === id),
    streamSimple(model, ...args) {
      const provider = providers.get(model.provider)
      if (provider === undefined) throw notAvailableError(MODULE, 'Models.streamSimple')
      return provider.streamSimple(model, ...args)
    },
    login: notImplementedFail(MODULE, 'Models.login'),
  }
}

const THINKING_LEVELS: readonly WorkerThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
]

/**
 * Describe the reasoning levels encoded in a static model record.
 * @param model - model metadata from the configured provider catalog.
 * @returns reasoning levels supported by the model.
 */
export function getSupportedThinkingLevels(model: WorkerModel): WorkerThinkingLevel[] {
  if (!model.reasoning) return ['off']
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}

/** Context-overflow predicate (unavailable). */
export const isContextOverflow = notImplementedFail(MODULE, 'isContextOverflow')

/** Builtin provider ids of pi-ai 0.84.2, in catalog order. */
const BUILTIN_PROVIDER_IDS: readonly string[] = [
  'amazon-bedrock', 'ant-ling', 'anthropic', 'azure-openai-responses', 'baseten', 'cerebras',
  'cloudflare-ai-gateway', 'cloudflare-workers-ai', 'deepseek', 'fireworks', 'github-copilot',
  'google', 'google-vertex', 'groq', 'huggingface', 'kimi-coding', 'minimax', 'minimax-cn',
  'mistral', 'moonshotai', 'moonshotai-cn', 'nvidia', 'openai', 'openai-codex', 'opencode',
  'opencode-go', 'openrouter', 'qwen-token-plan', 'qwen-token-plan-cn',
  'qwen-token-plan-individual', 'together',
  'vercel-ai-gateway', 'xai', 'xiaomi', 'xiaomi-token-plan-ams', 'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp', 'zai', 'zai-coding-cn',
]

/**
 * Installed catalog providers, read while `llm-pi-ai` activates. Each carries the
 * api-key auth marker the adapter filters on, and no models: the provider
 * directory therefore matches the served deployment while every request path
 * lands on a loud symbol above.
 * @returns one entry per builtin provider.
 */
export function builtinProviders(): unknown[] {
  return BUILTIN_PROVIDER_IDS.map(id => ({
    id,
    name: id,
    auth: { apiKey: { type: 'api-key' } },
    models: [],
  }))
}

/**
 * Provider route ids of the installed catalog. `llm-pi-ai` registers the whole
 * catalog as configurable the moment it mounts and rejects an empty
 * registration, so these are pi-ai's real ids rather than an empty list.
 * @returns the builtin provider ids.
 */
export function getBuiltinProviders(): string[] {
  return [...BUILTIN_PROVIDER_IDS]
}

/**
 * Models of one installed catalog provider.
 * @returns no models.
 */
export function getBuiltinModels(): unknown[] {
  return []
}

/** Build one protocol binding whose request methods name the unavailable transport. */
function unavailableApi(symbol: string): WorkerStreams {
  return {
    stream: notImplementedFail(MODULE, `${symbol}.stream`),
    streamSimple: notImplementedFail(MODULE, `${symbol}.streamSimple`),
  }
}

/**
 * Build an Anthropic messages binding with request-time refusal.
 * @returns a refusing protocol binding.
 */
export const anthropicMessagesApi = (): WorkerStreams => unavailableApi('anthropicMessagesApi')

/**
 * Build an OpenAI completions binding with request-time refusal.
 * @returns a refusing protocol binding.
 */
export const openAICompletionsApi = (): WorkerStreams => unavailableApi('openAICompletionsApi')

/**
 * Build an OpenAI responses binding with request-time refusal.
 * @returns a refusing protocol binding.
 */
export const openAIResponsesApi = (): WorkerStreams => unavailableApi('openAIResponsesApi')

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: the members `require()` hands a caller of this module. */
export default {
  createProvider, createModels, getSupportedThinkingLevels, isContextOverflow, builtinProviders,
  getBuiltinModels, getBuiltinProviders, anthropicMessagesApi, openAICompletionsApi,
  openAIResponsesApi,
}
