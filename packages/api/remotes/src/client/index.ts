/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@daoai/cordis'
import agentPresetsRemote from '@daoai/dao-agent-presets/remote'
import commandsRemote from '@daoai/dao-commands/remote'
import settingsControllerRemote from '@daoai/dao-api-settings-controller/remote'
import goalsRemote from '@daoai/dao-goal/remote'
import llmRemote from '@daoai/dao-llm/remote'
import dynamicRemote from '@daoai/dao-cordis-host-runner/remote'
import pluginInventoryRemote from '@daoai/dao-host-plugin-inventory/remote'
import messageFeedbackRemote from '@daoai/dao-message-feedback/remote'
import sessionReferencesRemote from '@daoai/dao-session-reference/remote'
import subagentsRemote from '@daoai/dao-subagent/remote'
import sessionRemote from '@daoai/dao-api-session-controller/remote'
import workspaceRemote from '@daoai/dao-api-workspace-controller/remote'
import type { ClientRemote } from '@daoai/dao-api-gateway/client'

export type { ClientRemote } from '@daoai/dao-api-gateway/client'
export type { PluginInventorySnapshot } from '@daoai/dao-host-plugin-inventory/types'
export type {} from '@daoai/dao-agent-presets/remote'
export type {} from '@daoai/dao-commands/remote'
export type {} from '@daoai/dao-api-settings-controller/remote'
export type {} from '@daoai/dao-goal/remote'
export type {} from '@daoai/dao-llm/remote'
export type {} from '@daoai/dao-host-plugin-inventory/remote'
export type {} from '@daoai/dao-message-feedback/remote'
export type {} from '@daoai/dao-session-reference/remote'
export type {} from '@daoai/dao-subagent/remote'
export type * from '@daoai/dao-subagent/client'
export type {} from '@daoai/dao-api-session-controller/remote'
export type * from '@daoai/dao-api-session-controller/types'
export type {} from '@daoai/dao-api-workspace-controller/remote'
export type * from '@daoai/dao-api-workspace-controller/types'
export type { SessionJob as JobView } from '@daoai/dao-api-session-controller/types'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@daoai/dao-commands/types'
export type {} from '@daoai/dao-cordis-host-runner/types'
export type {} from '@daoai/dao-credentials/types'
export type {} from '@daoai/dao-llm/types'
export type {} from '@daoai/dao-agent-presets/types'
export type {} from '@daoai/dao-settings/types'
export type {} from '@daoai/dao-user-approval/types'
export type {} from '@daoai/dao-user-questions/types'
export type {} from '@daoai/dao-api-session-controller/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ConnectionHandle, ConnectionSinks, ContentBlock,
  MessageId,
  RpcError, RpcId, RpcRequest, RpcResponse, RpcResult, SessionId,
  StreamChunk,
} from '@daoai/dao-client-connection/client'
export type {} from '@daoai/dao-api-gateway/client'
export type {} from '@daoai/dao-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@daoai/dao-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@daoai/dao-session/types'
// Credential state vocabulary for the credentials namespace (values never ride it).
export type { CredentialInfo } from '@daoai/dao-credentials/types'
// Redacted namespace vocabulary for the settings namespace (secrets never ride
// it). It travels with its seam, whose `./types` the Client face already reads.
export type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView,
} from '@daoai/dao-settings/types'
// Provider registry and discovery vocabulary for the llm namespace.
export type {
  LlmConfigurableProvider, LlmDiscoveredModel, LlmModelDiscoveryError,
  LlmModelDiscoveryRequest, LlmProviderInfo,
} from '@daoai/dao-llm/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@daoai/dao-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@daoai/dao-session-reference/types'

/** Failure vocabulary exposed by the assembled Client data layer. */
export type ClientFailure =
  | import('@daoai/dao-client-connection/client').RpcError
  | import('@daoai/dao-agent-presets/types').AgentPresetError
  | import('@daoai/dao-api-session-controller/types').SessionError
  | import('@daoai/dao-api-settings-controller/types').CredentialError
  | import('@daoai/dao-api-settings-controller/types').SettingsError
  | import('@daoai/dao-llm/types').LlmModelDiscoveryError
  | import('@daoai/dao-subagent/client').SubagentControlError
  | import('@daoai/dao-api-workspace-controller/types').WorkspaceError

/** Success or failure returned by Client operations spanning both API families. */
export type ClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClientFailure }

declare module '@daoai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      agentPresetsRemote, commandsRemote, settingsControllerRemote, goalsRemote, llmRemote, dynamicRemote,
      pluginInventoryRemote, messageFeedbackRemote, sessionReferencesRemote,
      subagentsRemote, sessionRemote, workspaceRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
