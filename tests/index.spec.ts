import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

describe('plugin-template', () => {
  it('mounts into a cordis context with the default config', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(plugin)
    await fiber.dispose()
  })

  it('accepts an explicit config', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(plugin, { greeting: 'custom greeting' })
    await fiber.dispose()
  })

  it('exposes a plugin name and config schema', () => {
    expect(plugin.name).toBe('plugin-template')
    expect(plugin.Config).toBeDefined()
  })
})

describe('cordis.patch.yml', () => {
  it('registers this plugin under the npm package name', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
    const pkg = JSON.parse(read('../package.json')) as { name: string }
    const entries = [...read('../cordis.patch.yml').matchAll(/- id:\s*(\S+)[\s\S]*?name:\s*'([^']+)'/g)]
    const entry = entries.find(([, id]) => id === plugin.name)
    expect(entry, `no cordis.patch.yml entry with id "${plugin.name}"`).toBeDefined()
    expect(entry?.[2]).toBe(pkg.name)
  })
})

