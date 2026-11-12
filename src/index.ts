/**
 * Minimal DeepSeek Harness plugin skeleton: one cordis plugin entry with a
 * typed, defaulted config. Replace the body of `apply` with real behavior
 * and add service names to `inject` when the plugin needs dsh services.
 *
 * @module dsh-plugin-template
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'plugin-template'

/** Options this plugin accepts in the dsh profile. */
export interface Config {
  /** Message logged once at startup; replace with real options. */
  greeting: string
}

export const Config: z<Config> = z.object({
  greeting: z.string().min(1).default('hello from dsh-plugin-template'),
})

/**
 * Plugin entry point.
 * @param ctx - cordis context the plugin is mounted into.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.logger.info('%s', config.greeting)
}
