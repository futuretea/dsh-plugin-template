import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import {
  DEFAULT_GREETING,
  PLUGIN_NAME,
  loadPatch,
  observeMount,
  patchRows,
  registersSelf,
} from './plugin-contract.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
}

function row(name = `'${pkg.name}'`, extra = ''): string {
  return `- insert:\n    - id: ${plugin.name}\n      name: ${name}${extra}\n`
}

describe('plugin-template exports', () => {
  it('exports the plugin name', () => {
    expect(plugin.name).toBe(PLUGIN_NAME)
  })

  it('exports the config schema', () => {
    expect(plugin.Config).toBeDefined()
  })
})

describe('plugin-template mount', () => {
  it('logs the default greeting when config is omitted', async () => {
    const observed = await observeMount(plugin)
    expect(observed.error).toBeUndefined()
    expect(observed.logs).toEqual([{ type: 'info', args: ['%s', DEFAULT_GREETING] }])
  })

  it('logs an explicit greeting', async () => {
    const observed = await observeMount(plugin, { greeting: 'custom greeting' })
    expect(observed.error).toBeUndefined()
    expect(observed.logs).toEqual([{ type: 'info', args: ['%s', 'custom greeting'] }])
  })

  it('logs a space greeting', async () => {
    const observed = await observeMount(plugin, { greeting: ' ' })
    expect(observed.error).toBeUndefined()
    expect(observed.logs).toEqual([{ type: 'info', args: ['%s', ' '] }])
  })

  it('uses the default greeting when greeting is null', async () => {
    const observed = await observeMount(plugin, { greeting: null })
    expect(observed.error).toBeUndefined()
    expect(observed.logs).toEqual([{ type: 'info', args: ['%s', DEFAULT_GREETING] }])
  })

  it('rejects an empty greeting', async () => {
    const observed = await observeMount(plugin, { greeting: '' })
    expect(observed.error).toBeInstanceOf(Error)
    expect(observed.error?.name).toBe('ValidationError')
  })
})

describe('host patch registration', () => {
  it('accepts a single-quoted package name', () => {
    const parsed = loadPatch(row())
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('accepts a double-quoted package name', () => {
    const parsed = loadPatch(row(`"${pkg.name}"`))
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('accepts an unquoted package name', () => {
    const parsed = loadPatch(row(pkg.name))
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('accepts a folded package name', () => {
    const parsed = loadPatch(`- insert:\n    - id: ${plugin.name}\n      name: >-\n        ${pkg.name}\n`)
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('accepts a host !!js config on the registered row', () => {
    const parsed = loadPatch(row(pkg.name, '\n      config:\n        greeting: !!js hello'))
    expect(patchRows(parsed)[0]?.config?.greeting).toEqual({ __jsExpr: 'hello' })
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('accepts an extra insert beside this plugin', () => {
    const parsed = loadPatch(`${row().trimEnd()}\n    - id: tool-extra\n      name: other-pkg\n`)
    expect(patchRows(parsed)).toHaveLength(2)
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(true)
  })

  it('parses an empty list without registering this plugin', () => {
    const parsed = loadPatch('[]\n')
    expect(parsed).toEqual([])
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(false)
  })

  it('does not treat another package insert as this plugin', () => {
    const parsed = loadPatch(`- insert:\n    - id: tool-extra\n      name: '${pkg.name}'\n`)
    expect(parsed).toHaveLength(1)
    expect(registersSelf(parsed, plugin.name, pkg.name)).toBe(false)
  })

  it('surfaces a patch that is not a list', () => {
    expect(() => loadPatch('')).toThrow(/array/)
  })
})
