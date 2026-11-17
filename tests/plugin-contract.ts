import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

export const PLUGIN_NAME = 'plugin-template'
export const DEFAULT_GREETING = 'hello from dsh-plugin-template'

type PatchRow = {
  id?: string
  name?: string
  config?: { greeting?: unknown }
  insert?: PatchRow[]
}

export function patchRows(patches: readonly PatchRow[]): PatchRow[] {
  const rows: PatchRow[] = []
  for (const patch of patches) {
    if (Array.isArray(patch?.insert)) rows.push(...patch.insert)
  }
  return rows
}

export function registersSelf(
  patches: readonly PatchRow[],
  pluginName: string,
  packageName: string,
): boolean {
  return patchRows(patches).some((row) => row?.id === pluginName && row?.name === packageName)
}

export function loadPatch(text: string): PatchRow[] {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-patch-'))
  const file = join(dir, 'cordis.patch.yml')
  try {
    writeFileSync(file, text)
    return loadOverlayPatches('dsh', file) as PatchRow[]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function observeMount(
  plugin: Parameters<Context['plugin']>[0],
  config?: unknown,
): Promise<{
  logs?: { type: string, args: unknown[] }[]
  effective?: unknown
  error?: Error
}> {
  const ctx = new Context()
  const logs: { type: string, args: unknown[] }[] = []
  ctx.logger.exporter({
    export(message) {
      logs.push({ type: message.type, args: message.args })
    },
  })
  try {
    const fiber = arguments.length < 2
      ? await ctx.plugin(plugin)
      : await ctx.plugin(plugin, config)
    const effective = fiber.effectiveConfig
    await fiber.dispose()
    return { logs, effective }
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}
