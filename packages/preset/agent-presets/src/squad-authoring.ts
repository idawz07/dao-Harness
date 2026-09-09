/** Bounded squad-member persistence over preset and user-shadow directories. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { entryListSchema } from '@daoai/cordis-plugin-include'
import { writeFileAtomic } from '@daoai/dao-atomic-write'
import yaml from 'js-yaml'
import { COMPOSITION_FILE } from './discovery.ts'
import { METADATA_FILE, readPresetMetadata, renderPresetMetadata } from './metadata.ts'
import { PRESET_ID, type AgentPreset, type PresetRoot } from './preset.ts'
import { InvalidPresetIdError, PresetExistsError, PresetNotWritableError, writableRoot } from './authoring.ts'
import {
  SQUAD_AUTHORING_LIMITS,
  type CreateSquadMemberInput, type SquadAvatar, type SquadWriteResult,
} from './types.ts'

/** Managed state beside a preset composition or a shipped preset's user shadow. */
export const PERSONA_OVERRIDE_FILE = 'persona.override.yml'

/** Maximum UTF-8 persona size accepted by a user-facing write. */
export const MAX_PERSONA_BYTES = SQUAD_AUTHORING_LIMITS.personaBytes

/** Maximum decoded avatar size accepted by a user-facing write. */
export const MAX_AVATAR_BYTES = SQUAD_AUTHORING_LIMITS.avatarBytes

const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const RESERVED_MEMBER_IDS = new Set(['codex', 'fork'])
const MANAGED_AVATAR_FILE = /^avatar-[0-9a-f-]+\.(?:png|jpg|webp|gif)$/
const AVATAR_EXTENSION_BY_MEDIA_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
} as const satisfies Record<SquadAvatar['mediaType'], string>

/** A conditional member write observed a different revision. */
export class SquadRevisionConflictError extends Error {
  constructor(
    /** Member whose persisted state changed. */
    readonly presetId: string,
    /** Revision supplied by the caller. */
    readonly expectedRevision: string | null,
    /** Current revision, or null before the first managed write. */
    readonly actualRevision: string | null,
  ) {
    super(`squad: member "${presetId}" changed (expected revision ${JSON.stringify(expectedRevision)}, current ${JSON.stringify(actualRevision)})`)
  }
}

/** A user-facing member field failed bounded validation. */
export class InvalidSquadMemberError extends Error {
  constructor(
    /** Member whose field was rejected. */
    readonly presetId: string,
    reason: string,
  ) {
    super(`squad: member "${presetId}" is invalid: ${reason}`)
  }
}

/** On-disk managed state. Persona is present only for a shipped override. */
interface ManagedState {
  readonly version: 1
  readonly revision: string
  readonly persona?: string
  readonly toolsDeny: readonly string[]
  readonly avatar?: string
}

/** Effective member fields derived from its composition and optional sidecar. */
export interface EffectiveMemberState {
  readonly persona?: string
  readonly personaOverridden: boolean
  readonly revision?: string
  readonly toolsDeny: readonly string[]
  readonly avatar?: string
  readonly avatarPath?: string
}

/** Validate and normalize persona text without changing accepted bytes. */
function validatePersona(id: string, persona: string): string {
  if (persona.trim() === '') throw new InvalidSquadMemberError(id, 'persona must contain non-whitespace text')
  if (Buffer.byteLength(persona, 'utf8') > MAX_PERSONA_BYTES) {
    throw new InvalidSquadMemberError(id, `persona exceeds the ${String(MAX_PERSONA_BYTES)}-byte limit`)
  }
  return persona
}

/** Validate a restrict-only deny list and return a detached stable value. */
function validateTools(id: string, tools: readonly string[] | undefined): string[] {
  if ((tools?.length ?? 0) > SQUAD_AUTHORING_LIMITS.toolDenyEntries) {
    throw new InvalidSquadMemberError(
      id,
      `tool deny list exceeds the ${String(SQUAD_AUTHORING_LIMITS.toolDenyEntries)}-entry limit`,
    )
  }
  const result = [...new Set(tools ?? [])].sort((left, right) => left.localeCompare(right))
  const oversized = result.find(tool => tool.length > SQUAD_AUTHORING_LIMITS.toolNameCharacters)
  if (oversized !== undefined) {
    throw new InvalidSquadMemberError(
      id,
      `tool deny entry exceeds the ${String(SQUAD_AUTHORING_LIMITS.toolNameCharacters)}-character limit`,
    )
  }
  const invalid = result.find(tool => !TOOL_NAME.test(tool))
  if (invalid !== undefined) {
    throw new InvalidSquadMemberError(id, `tool deny entry ${JSON.stringify(invalid)} must match ${String(TOOL_NAME)}`)
  }
  return result
}

/** Validate one required display field without changing its accepted bytes. */
function validateRequiredText(id: string, field: string, value: string, maxBytes: number): string {
  if (value.trim() === '') throw new InvalidSquadMemberError(id, `${field} must contain non-whitespace text`)
  if (/[\r\n]/u.test(value)) throw new InvalidSquadMemberError(id, `${field} must be one line`)
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new InvalidSquadMemberError(id, `${field} exceeds the ${String(maxBytes)}-byte limit`)
  }
  return value
}

/** Validate one optional display field without changing its accepted bytes. */
function validateOptionalText(id: string, field: string, value: string | undefined, maxBytes: number): string | undefined {
  if (value === undefined) return undefined
  return validateRequiredText(id, field, value, maxBytes)
}

/**
 * Resolve the absolute directory reserved under the first writable root.
 * @param roots - Configured preset roots.
 * @param id - Validated member id.
 * @returns Absolute user-member directory.
 */
export function userMemberDirectory(roots: readonly PresetRoot[], id: string): string {
  if (!PRESET_ID.test(id)) throw new InvalidPresetIdError(id)
  return join(writableRoot(roots), id)
}

/** Read one optional managed-state document, rejecting malformed capability state. */
async function readManagedState(directory: string, id: string): Promise<ManagedState | undefined> {
  let raw: string
  try {
    raw = await readFile(join(directory, PERSONA_OVERRIDE_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let value: unknown
  try {
    value = yaml.load(raw)
  } catch (error) {
    throw new InvalidSquadMemberError(id, `cannot parse ${PERSONA_OVERRIDE_FILE}: ${String(error)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidSquadMemberError(id, `${PERSONA_OVERRIDE_FILE} must contain a map`)
  }
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.revision !== 'string' || record.revision === '') {
    throw new InvalidSquadMemberError(id, `${PERSONA_OVERRIDE_FILE} requires version 1 and a non-empty revision`)
  }
  const persona = record.persona
  if (persona !== undefined && typeof persona !== 'string') {
    throw new InvalidSquadMemberError(id, `${PERSONA_OVERRIDE_FILE} persona must be a string`)
  }
  if (record.toolsDeny !== undefined
    && (!Array.isArray(record.toolsDeny) || record.toolsDeny.some(tool => typeof tool !== 'string'))) {
    throw new InvalidSquadMemberError(id, `${PERSONA_OVERRIDE_FILE} toolsDeny must be a string list`)
  }
  const avatar = record.avatar
  if (avatar !== undefined && (typeof avatar !== 'string' || !MANAGED_AVATAR_FILE.test(avatar))) {
    throw new InvalidSquadMemberError(id, `${PERSONA_OVERRIDE_FILE} avatar must name a managed avatar file`)
  }
  return {
    version: 1,
    revision: record.revision,
    ...persona === undefined ? {} : { persona: validatePersona(id, persona) },
    toolsDeny: validateTools(id, record.toolsDeny as string[] | undefined),
    ...avatar === undefined ? {} : { avatar },
  }
}

/** Render managed state deterministically for atomic persistence. */
function renderManagedState(state: ManagedState): string {
  return yaml.dump({
    version: state.version,
    revision: state.revision,
    ...state.persona === undefined ? {} : { persona: state.persona },
    toolsDeny: [...state.toolsDeny],
    ...state.avatar === undefined ? {} : { avatar: state.avatar },
  }, { lineWidth: -1, noRefs: true })
}

/** Find the one persona row in a composition, including nested groups. */
function personaRow(rows: unknown[]): Record<string, unknown> | undefined {
  for (const value of rows) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const row = value as Record<string, unknown>
    if (row.name === '@daoai/dao-persona') return row
    if (row.group === true && Array.isArray(row.config)) {
      const nested = personaRow(row.config)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** Parse a composition with the Loader's YAML dialect. */
async function readCompositionRows(preset: AgentPreset): Promise<unknown[]> {
  const raw = await readFile(preset.path, 'utf8')
  const parsed: unknown = yaml.load(raw, { schema: entryListSchema })
  if (!Array.isArray(parsed)) {
    throw new InvalidSquadMemberError(preset.id, `${COMPOSITION_FILE} must contain a top-level list`)
  }
  return parsed as unknown[]
}

/**
 * Read the persona owned by a preset composition.
 * @param preset - Preset whose composition supplies the base persona.
 * @returns Persona text, or undefined when no persona row exists.
 */
export async function readCompositionPersona(preset: AgentPreset): Promise<string | undefined> {
  const row = personaRow(await readCompositionRows(preset))
  if (row === undefined || typeof row.config !== 'object' || row.config === null || Array.isArray(row.config)) return undefined
  const text = (row.config as Record<string, unknown>).text
  return typeof text === 'string' ? text : undefined
}

/**
 * Read effective squad fields without exposing any Host path.
 * @param roots - Configured preset roots.
 * @param preset - Discovered base preset.
 * @returns Effective persona, restriction, revision, and avatar state.
 */
export async function effectiveMemberState(
  roots: readonly PresetRoot[],
  preset: AgentPreset,
): Promise<EffectiveMemberState> {
  const directory = userMemberDirectory(roots, preset.id)
  const managed = await readManagedState(directory, preset.id)
  let basePersona: string | undefined
  try {
    basePersona = await readCompositionPersona(preset)
  } catch {
    // Discovery already reports the composition failure on `broken`; the
    // optional roster persona cannot hide that more precise diagnosis.
  }
  const userMetadata = await readPresetMetadata(directory)
  const avatar = managed?.avatar ?? userMetadata.avatar ?? preset.avatar
  const avatarDirectory = managed?.avatar !== undefined || userMetadata.avatar !== undefined
    ? directory
    : dirname(preset.path)
  const persona = managed?.persona ?? basePersona
  return {
    ...persona === undefined ? {} : { persona },
    personaOverridden: managed?.persona !== undefined,
    ...managed === undefined ? {} : { revision: managed.revision },
    toolsDeny: managed?.toolsDeny ?? [],
    ...avatar === undefined ? {} : { avatar, avatarPath: join(avatarDirectory, avatar) },
  }
}

/** Assert a conditional write still addresses the state the caller reviewed. */
function assertRevision(id: string, state: ManagedState | undefined, expected: string | null): void {
  const actual = state?.revision ?? null
  if (actual !== expected) throw new SquadRevisionConflictError(id, expected, actual)
}

/** Create the next sidecar state, preserving fields this operation does not own. */
function nextState(
  previous: ManagedState | undefined,
  patch: Partial<Pick<ManagedState, 'persona' | 'toolsDeny' | 'avatar'>>,
): ManagedState {
  return {
    version: 1,
    revision: randomUUID(),
    ...previous?.persona === undefined ? {} : { persona: previous.persona },
    toolsDeny: previous?.toolsDeny ?? [],
    ...previous?.avatar === undefined ? {} : { avatar: previous.avatar },
    ...patch,
  }
}

/** Atomically persist one managed state under the writable root. */
async function writeManagedState(directory: string, state: ManagedState): Promise<void> {
  await writeFileAtomic(join(directory, PERSONA_OVERRIDE_FILE), renderManagedState(state), {
    mode: 0o600,
    dirMode: 0o700,
  })
}

/**
 * Replace a member persona while preserving shipped composition bytes.
 * @param roots - Configured preset roots.
 * @param preset - Discovered member preset.
 * @param persona - Persona text stored verbatim.
 * @param toolsDeny - Restrict-only tool names.
 * @param expectedRevision - Revision read by the editor.
 * @returns The committed revision.
 */
export async function saveManagedPersona(
  roots: readonly PresetRoot[],
  preset: AgentPreset,
  persona: string,
  toolsDeny: readonly string[],
  expectedRevision: string | null,
): Promise<SquadWriteResult> {
  const directory = userMemberDirectory(roots, preset.id)
  const previous = await readManagedState(directory, preset.id)
  assertRevision(preset.id, previous, expectedRevision)
  const text = validatePersona(preset.id, persona)
  const tools = validateTools(preset.id, toolsDeny)
  const state = nextState(previous, { persona: text, toolsDeny: tools })
  await writeManagedState(directory, state)
  return { revision: state.revision }
}

/**
 * Remove a shipped member's persona and tool override while retaining its avatar.
 * @param roots - Configured preset roots.
 * @param preset - Shipped member preset.
 * @param expectedRevision - Revision read by the editor.
 */
export async function resetManagedPersona(
  roots: readonly PresetRoot[],
  preset: AgentPreset,
  expectedRevision: string,
): Promise<void> {
  if (preset.trust !== 'system') {
    throw new PresetNotWritableError(preset.id, 'only a shipped member has a shipped persona to restore')
  }
  const directory = userMemberDirectory(roots, preset.id)
  const previous = await readManagedState(directory, preset.id)
  assertRevision(preset.id, previous, expectedRevision)
  if (previous?.avatar === undefined) {
    await rm(join(directory, PERSONA_OVERRIDE_FILE), { force: true })
    return
  }
  await writeManagedState(directory, {
    version: 1,
    revision: randomUUID(),
    toolsDeny: [],
    avatar: previous.avatar,
  })
}

/** Minimal composition for a user-created squad member. */
function memberComposition(persona: string): string {
  return yaml.dump([{
    id: 'persona',
    name: '@daoai/dao-persona',
    config: { text: persona, complete: false },
  }], { lineWidth: -1, noRefs: true })
}

/**
 * Create a user-owned managed member without accepting arbitrary composition text.
 * @param roots - Configured preset roots.
 * @param id - New member id.
 * @param input - Reviewed bounded member fields.
 * @param occupiedToolNames - Tool names already claimed in the authoring service's scope.
 * @returns The committed revision.
 */
export async function createManagedMember(
  roots: readonly PresetRoot[],
  id: string,
  input: CreateSquadMemberInput,
  occupiedToolNames: ReadonlySet<string> = new Set(),
): Promise<SquadWriteResult> {
  const directory = userMemberDirectory(roots, id)
  const toolName = `subagent_${id}`
  if (RESERVED_MEMBER_IDS.has(id) || occupiedToolNames.has(toolName)) {
    throw new InvalidSquadMemberError(id, `generated tool name ${JSON.stringify(toolName)} is already reserved`)
  }
  try {
    await stat(directory)
    throw new PresetExistsError(id)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const persona = validatePersona(id, input.persona)
  const toolsDeny = validateTools(id, input.toolsDeny)
  const name = validateRequiredText(id, 'name', input.name, SQUAD_AUTHORING_LIMITS.nameBytes)
  const description = validateOptionalText(
    id,
    'description',
    input.description,
    SQUAD_AUTHORING_LIMITS.descriptionBytes,
  )
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 })
  const staging = `${directory}.${randomUUID()}.tmp`
  await mkdir(staging, { mode: 0o700 })
  const state = nextState(undefined, { toolsDeny })
  try {
    await writeFileAtomic(join(staging, COMPOSITION_FILE), memberComposition(persona), { mode: 0o600, dirMode: 0o700 })
    const metadata = renderPresetMetadata({
      name,
      ...description === undefined ? {} : { description },
      squadMember: true,
    })
    if (metadata !== undefined) {
      await writeFileAtomic(join(staging, METADATA_FILE), metadata, { mode: 0o600, dirMode: 0o700 })
    }
    await writeManagedState(staging, state)
    await rename(staging, directory)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    if (['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw new PresetExistsError(id)
    }
    throw error
  }
  return { revision: state.revision }
}

/** Validate decoded avatar content against its declared media type. */
function avatarBytes(id: string, mediaType: SquadAvatar['mediaType'], base64: string): Buffer {
  if (!Object.hasOwn(AVATAR_EXTENSION_BY_MEDIA_TYPE, mediaType)) {
    throw new InvalidSquadMemberError(id, `unsupported avatar media type ${JSON.stringify(mediaType)}`)
  }
  const maxEncodedCharacters = Math.ceil(MAX_AVATAR_BYTES / 3) * 4
  if (base64.length === 0 || base64.length > maxEncodedCharacters || base64.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new InvalidSquadMemberError(id, 'avatar must be canonical base64 within the encoded upload limit')
  }
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
    throw new InvalidSquadMemberError(id, `avatar must contain 1 to ${String(MAX_AVATAR_BYTES)} decoded bytes`)
  }
  const valid = mediaType === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mediaType === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
      : mediaType === 'image/gif'
        ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
        : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!valid) throw new InvalidSquadMemberError(id, `avatar bytes do not match ${mediaType}`)
  return bytes
}

/** Atomically replace a binary file with owner-only permissions. */
async function writeBinaryAtomic(filename: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const temp = `${filename}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, bytes, { mode: 0o600, flag: 'wx' })
    await rename(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/**
 * Replace one UI-only avatar under the writable root.
 * @param roots - Configured preset roots.
 * @param preset - Discovered member preset.
 * @param mediaType - Allowlisted image media type.
 * @param base64 - Base64-encoded image bytes.
 * @param expectedRevision - Revision read by the editor.
 * @returns The committed revision.
 */
export async function saveManagedAvatar(
  roots: readonly PresetRoot[],
  preset: AgentPreset,
  mediaType: SquadAvatar['mediaType'],
  base64: string,
  expectedRevision: string | null,
): Promise<SquadWriteResult> {
  const directory = userMemberDirectory(roots, preset.id)
  const previous = await readManagedState(directory, preset.id)
  assertRevision(preset.id, previous, expectedRevision)
  const bytes = avatarBytes(preset.id, mediaType, base64)
  const state = nextState(previous, {})
  const filename = `avatar-${state.revision}${AVATAR_EXTENSION_BY_MEDIA_TYPE[mediaType]}`
  const committed = { ...state, avatar: filename }
  await writeBinaryAtomic(join(directory, filename), bytes)
  try {
    await writeManagedState(directory, committed)
  } catch (error) {
    try {
      await rm(join(directory, filename), { force: true })
    } catch {
      // Swallows only cleanup of an unreferenced avatar after the authoritative state write failed.
    }
    throw error
  }
  if (previous?.avatar !== undefined && previous.avatar !== filename) {
    try {
      await rm(join(directory, previous.avatar), { force: true })
    } catch {
      // Swallows only cleanup of an obsolete avatar after the authoritative state committed.
    }
  }
  return { revision: committed.revision }
}

/**
 * Read validated UI-only avatar bytes from one effective member.
 * @param member - Effective member with resolved internal avatar path.
 * @returns The path-free image payload, or undefined when unavailable.
 */
export async function readManagedAvatar(member: AgentPreset): Promise<SquadAvatar | undefined> {
  if (member.avatar === undefined || member.avatarPath === undefined) return undefined
  const mediaType = Object.entries(AVATAR_EXTENSION_BY_MEDIA_TYPE)
    .find(([, extension]) => member.avatar?.endsWith(extension))?.[0] as SquadAvatar['mediaType'] | undefined
  if (mediaType === undefined) return undefined
  try {
    const bytes = await readFile(member.avatarPath)
    return { mediaType, base64: bytes.toString('base64') }
  } catch {
    return undefined
  }
}
