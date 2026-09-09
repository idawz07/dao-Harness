/** Client-safe payloads and event declarations owned by the agent-preset domain. */
import type { SessionId } from '@daoai/dao-session/types'
import type { PresetTrust } from './preset.ts'

export type { PresetTrust } from './preset.ts'

/** Fixed wire and persistence limits for user-authored squad fields. */
export const SQUAD_AUTHORING_LIMITS = {
  memberIdCharacters: 64,
  nameBytes: 256,
  descriptionBytes: 1024,
  personaBytes: 16 * 1024,
  toolDenyEntries: 64,
  toolNameCharacters: 128,
  avatarBytes: 2 * 1024 * 1024,
} as const

/**
 * One roster row as a client reads it. Path-free: a preset is addressed by id
 * everywhere off the Host, and the composition's location is the Host's own.
 */
export interface AgentPresetRow {
  /** Stable identifier; also the label's fallback. */
  readonly id: string
  /** Trust of the root this preset was discovered under. */
  readonly trust: PresetTrust
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Declared roster position; absent sorts after explicitly ordered members. */
  readonly order?: number
  /** UI-only avatar filename, absent when the client should render an initial. */
  readonly avatar?: string
  /** Whether this preset participates in roster-driven delegation. */
  readonly squadMember: boolean
  /** Effective persona text for this member. */
  readonly persona?: string
  /** Whether a user-owned sidecar replaces the preset's persona. */
  readonly personaOverridden: boolean
  /** Opaque revision required by the next persona or restriction write. */
  readonly revision: string | null
  /** Tool names removed from children delegated as this member. */
  readonly tools: readonly string[]
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** User-reviewed fields accepted when creating a managed squad member. */
export interface CreateSquadMemberInput {
  /** Human-facing member name. */
  readonly name: string
  /** One-sentence role description. */
  readonly description?: string
  /** Persona text stored verbatim after validation. */
  readonly persona: string
  /** Tools removed from a child delegated as this member. */
  readonly toolsDeny?: readonly string[]
}

/** Result of a committed managed-member write. */
export interface SquadWriteResult {
  /** New opaque revision for subsequent conditional writes. */
  readonly revision: string
}

/** Avatar payload returned only to UI clients. */
export interface SquadAvatar {
  /** Browser media type for the stored bytes. */
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  /** Base64-encoded bytes. */
  readonly base64: string
}

/** One effective delegation member frozen into a session log. */
export interface SquadSessionMember {
  readonly id: string
  readonly trust: PresetTrust
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly persona: string
  readonly tools: readonly string[]
}

/** Effective roster version a session's composition was built against. */
export interface SquadSessionSnapshot {
  /** Digest of the canonical member data, used to share identical standing mounts. */
  readonly revision: string
  /** Every usable member in deterministic roster order. */
  readonly members: readonly SquadSessionMember[]
}

/** Host capability for bounded squad-member authoring. */
export interface SquadService {
  /**
   * Read effective squad members and authoring availability.
   * @returns The current effective member roster.
   */
  roster(): Promise<AgentPresetRoster>
  /**
   * Replace one member's managed persona and restrictions conditionally.
   * @param id - Member preset id.
   * @param persona - Persona text stored verbatim.
   * @param toolsDeny - Restrict-only tool names.
   * @param expectedRevision - Revision read by the editor, or null for an unshadowed shipped member.
   * @returns The committed revision and effective member.
   */
  savePersona(id: string, persona: string, toolsDeny: readonly string[], expectedRevision: string | null): Promise<SquadWriteResult>
  /**
   * Remove a shipped member's managed override.
   * @param id - Shipped member preset id.
   * @param expectedRevision - Revision read by the editor.
   */
  resetPersona(id: string, expectedRevision: string): Promise<void>
  /**
   * Create one user-owned managed member.
   * @param id - New member preset id.
   * @param input - Reviewed bounded member fields.
   * @returns The committed revision and effective member.
   */
  createMember(id: string, input: CreateSquadMemberInput): Promise<SquadWriteResult>
  /**
   * Delete one user-owned member.
   * @param id - User-owned member preset id.
   */
  deleteMember(id: string): Promise<void>
  /**
   * Replace one member's UI-only avatar.
   * @param id - Member preset id.
   * @param mediaType - Allowlisted browser image media type.
   * @param base64 - Base64-encoded image bytes.
   * @param expectedRevision - Revision read by the editor, or null for an unshadowed shipped member.
   * @returns The committed revision and effective member.
   */
  saveAvatar(id: string, mediaType: SquadAvatar['mediaType'], base64: string, expectedRevision: string | null): Promise<SquadWriteResult>
  /**
   * Read one member's UI-only avatar.
   * @param id - Member preset id.
   * @returns The image payload, or undefined when none is stored.
   */
  readAvatar(id: string): Promise<SquadAvatar | undefined>
}

/** The roster one deployment currently supplies, with its authoring capability. */
export interface AgentPresetRoster {
  /** Every preset the configured roots supply, first-root-wins per id. */
  readonly presets: readonly AgentPresetRow[]
  /** Whether this deployment has a root locally authored presets go to. */
  readonly authorable: boolean
  /** Maximum decoded avatar bytes accepted by this deployment. */
  readonly maxAvatarBytes: number
}

/** Stable details for agent-preset failures returned by the Remote namespace. */
export interface AgentPresetErrorDetailsMap {
  /** A required preset id is empty. */
  'bad-request': Record<never, never>
  /** No configured root supplies the requested id. */
  'agent-preset-not-found': { readonly agentPreset: string; readonly available: readonly string[] }
  /** The id is unusable, already taken, or its composition cannot be installed. */
  'agent-preset-invalid': { readonly agentPreset: string; readonly reason: string }
  /** The preset ships with the deployment and is not the user's to change. */
  'agent-preset-read-only': { readonly agentPreset: string; readonly reason: string }
  /** The session's conversation has started, so its composition is fixed. */
  'agent-preset-locked': { readonly sessionId: SessionId; readonly agentPreset: string }
  /** A conditional squad write used a stale revision. */
  'squad-revision-conflict': {
    readonly agentPreset: string
    readonly expectedRevision: string | null
    readonly actualRevision: string | null
  }
  /** A bounded squad-member field failed validation. */
  'squad-member-invalid': { readonly agentPreset: string; readonly reason: string }
  /** The preset operation failed without a caller-actionable classification. */
  internal: Record<never, never>
}

/** One agent-preset refusal as a client reads it. */
export type AgentPresetError = {
  [Code in keyof AgentPresetErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: AgentPresetErrorDetailsMap[Code]
  }
}[keyof AgentPresetErrorDetailsMap]

/** One preset's composition text beside the row it belongs to. */
export interface AgentPresetDocument {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** Trust of the root this preset was discovered under. */
  readonly trust: PresetTrust
  /** The composition exactly as stored. */
  readonly content: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
}

declare module '@daoai/dao-session-projection/types' {
  interface SessionProjectionStateMap {
    agentPreset: string | null
  }
  interface SessionProjectionMap {
    /** Preset the Session runs, or null when the deployment composes none. */
    agentPreset: string | null
  }
}

declare module '@daoai/cordis' {
  interface Context {
    squad: SquadService
  }
  interface Events {
    /**
     * The effective squad roster changed after a committed user-root write.
     * @mode emit
     */
    'squad/change'(): void
    /**
     * One session committed a different agent preset to its durable log.
     * Consumers invalidate only state derived from that session's composition.
     * @mode emit
     * @param sessionId - the session whose composition changed.
     * @param agentPreset - the preset recorded by the committed selection.
     */
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
  }
}

export {}
