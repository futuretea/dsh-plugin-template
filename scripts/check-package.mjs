import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundlePatchPaths, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { DEFAULT_GREETING, PLUGIN_NAME, registersSelf } from '../tests/plugin-contract.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []

function check(name, fn) {
  try {
    fn()
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function checkAsync(name, fn) {
  try {
    await fn()
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parsePackOutput(stdout) {
  const lines = stdout.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trimStart().startsWith('[')) {
      return JSON.parse(lines.slice(index).join('\n'))
    }
  }
  throw new Error('npm pack did not return a JSON file list')
}

const build = spawnSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
if (build.status !== 0) {
  process.stderr.write('package check: build failed\n')
  process.exit(build.status ?? 1)
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-package-check-'))
try {
  const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], {
    cwd: root,
    encoding: 'utf8',
  })
  if (pack.status !== 0) {
    process.stderr.write(pack.stderr ?? '')
    process.stderr.write('package check: npm pack failed\n')
    process.exit(pack.status ?? 1)
  }
  const packed = parsePackOutput(pack.stdout)
  const tarball = join(scratch, packed[0].filename)
  const memberPaths = packed[0].files.map((file) => file.path)
  const consumer = join(scratch, 'consumer')
  const nodeModules = join(consumer, 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  spawnSync('tar', ['-xzf', tarball, '-C', nodeModules], { stdio: 'inherit' })
  const packageDir = join(nodeModules, 'package')
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const installed = join(nodeModules, manifest.name)
  spawnSync('mv', [packageDir, installed], { stdio: 'inherit' })

  symlinkSync(join(root, 'node_modules', '@deepseek-ai'), join(nodeModules, '@deepseek-ai'))
  writeFileSync(join(consumer, 'package.json'), '{ "private": true, "type": "module" }\n')

  const contractUrl = new URL('../tests/plugin-contract.ts', import.meta.url).href
  const runner = `
import { observeMount } from ${JSON.stringify(contractUrl)}
import * as plugin from ${JSON.stringify(manifest.name)}
function pack(observed) {
  if (!observed.error) return { logs: observed.logs, effective: observed.effective }
  return { error: { name: observed.error.name, message: observed.error.message } }
}
const result = {
  keys: Object.keys(plugin),
  name: plugin.name,
  config: plugin.Config != null,
  apply: typeof plugin.apply,
  omitted: pack(await observeMount(plugin)),
  explicit: pack(await observeMount(plugin, { greeting: 'custom greeting' })),
  empty: pack(await observeMount(plugin, { greeting: '' })),
}
console.log(JSON.stringify(result))
`
  const run = spawnSync(process.execPath, ['--input-type=module', '--eval', runner], {
    cwd: consumer,
    encoding: 'utf8',
  })
  let observed = null
  if (run.status !== 0) {
    failures.push(`package import: ${(run.stderr || run.stdout || 'import failed').trim()}`)
  } else {
    const line = run.stdout.trim().split('\n').findLast((item) => item.startsWith('{'))
    observed = JSON.parse(line ?? '')
  }

  check('packed name export', () => {
    assert(observed, 'package import did not run')
    assert(observed.keys.includes('name'), 'packed module does not export name')
    assert(observed.name === PLUGIN_NAME, `packed name was ${JSON.stringify(observed.name)}`)
  })
  check('packed Config export', () => {
    assert(observed, 'package import did not run')
    assert(observed.config === true, 'packed module does not export Config')
  })
  check('packed apply export', () => {
    assert(observed, 'package import did not run')
    assert(observed.apply === 'function', 'packed module does not export apply')
  })
  check('packed default greeting', () => {
    assert(observed, 'package import did not run')
    assert(!observed.omitted.error, observed.omitted.error?.message ?? 'default mount failed')
    assert(
      JSON.stringify(observed.omitted.logs) === JSON.stringify([{ type: 'info', args: ['%s', DEFAULT_GREETING] }]),
      `default log was ${JSON.stringify(observed.omitted.logs)}`,
    )
  })
  check('packed explicit greeting', () => {
    assert(observed, 'package import did not run')
    assert(!observed.explicit.error, observed.explicit.error?.message ?? 'explicit mount failed')
    assert(
      JSON.stringify(observed.explicit.logs) === JSON.stringify([{ type: 'info', args: ['%s', 'custom greeting'] }]),
      `explicit log was ${JSON.stringify(observed.explicit.logs)}`,
    )
  })
  check('packed empty greeting', () => {
    assert(observed, 'package import did not run')
    assert(observed.empty.error?.name === 'ValidationError', `empty greeting result was ${JSON.stringify(observed.empty)}`)
  })
  check('tarball contains the declared patch', () => {
    const bundle = manifest.dsh?.bundle
    assert(bundle, 'packed package.json has no dsh.bundle')
    const files = bundlePatchPaths(installed, bundle)
    assert(files.length > 0, 'dsh.bundle.patch declared no files')
    for (const file of files) {
      assert(existsSync(file), `packed patch is missing: ${file}`)
      const relative = file.slice(installed.length + 1)
      assert(memberPaths.includes(relative), `tarball file list omits ${relative}`)
    }
  })
  await checkAsync('packed patch registers this plugin', async () => {
    const files = bundlePatchPaths(installed, manifest.dsh.bundle)
    const parsed = files.flatMap((file) => loadOverlayPatches('dsh', file))
    assert(
      registersSelf(parsed, observed?.name, manifest.name),
      `no insert row with id ${JSON.stringify(observed?.name)} and name ${JSON.stringify(manifest.name)}`,
    )
  })
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`package check failed: ${failure}\n`)
  process.exit(1)
}
process.stdout.write('package check passed\n')
