# dsh-plugin-template

Development template for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins. It carries the engineering baseline validated on [dsh-forge-gitlab](https://github.com/futuretea/dsh-forge-gitlab) and [dsh-subagent-qoder](https://github.com/futuretea/dsh-subagent-qoder): a minimal cordis plugin skeleton, oxlint, typecheck, vitest, PR checks, and tag-triggered npm publishing via trusted publishing (no tokens in the repo).

## What's inside

| Path | Purpose |
|---|---|
| `src/index.ts` | Plugin skeleton: `name`, typed `Config` (schemastery), `apply` |
| `tests/index.spec.ts` | Mounts the plugin into a real cordis `Context` |
| `cordis.patch.yml` | Profile bundle patch that registers the plugin in a dsh profile |
| `tsdown.config.ts` / `tsconfig.json` | ESM build with declarations; strict typecheck |
| `.oxlintrc.json` | Lint baseline (tests get `no-non-null-assertion` / `require-yield` relaxed) |
| `.github/workflows/pr-checks.yml` | install → build → lint → typecheck → test on `main` pushes and PRs |
| `.github/workflows/release.yml` | On `vX.Y.Z` tag: dsh-plugin-checker → same chain → tag/version match → `npm publish` (OIDC) |

## Start a plugin from this template

1. Create a repo from this template (or copy the directory), then rename everywhere:
   - `package.json`: `name`, `description`, `repository`, `homepage`, `bugs`, `keywords`
   - `src/index.ts`: `export const name`, the `Config` shape, the `apply` body, and the `@module` tag / default `greeting`
   - `cordis.patch.yml`: the `id` (match `export const name`) and `name` (npm package name); add config keys as needed
   - `tests/index.spec.ts`: the `describe` label and the name assertion
   - `README.md` and `LICENSE`: rewrite for your plugin; copyright holder, if not you
2. Add the dsh services your plugin needs: list service names in `export const inject` (for example `['subagents']` or `['forge']`), add the corresponding `@deepseek-ai/dsh-*` packages to `peerDependencies` (and `devDependencies`, registry versions — `link:` paths break CI), and extend `tests/` to cover your behavior.
3. Develop:

```sh
pnpm install
pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build
```

CI runs the same chain on pushes to `main` and on pull requests.

## Releasing

The first release of a new npm name cannot use trusted publishing — the npm settings page only exists after the package exists:

1. **Publish 0.1.0 manually**: `npm login`, `pnpm run build`, `npm publish`. From a non-interactive terminal, plain `npm publish` fails with `EOTP`; pass your authenticator code via `npm publish --otp=123456`. Right after publishing, `npm view <name>` may briefly show a `0.0.0-stage` placeholder — that is npm's publish-time scanning, it resolves on its own within minutes.
2. **Register the trusted publisher once**: on npmjs.com open `https://www.npmjs.com/package/<name>/access` → Trusted Publisher → GitHub Actions. Fill in your GitHub user/org, the repository name, the workflow filename `release.yml` (filename only, no path), leave environment empty, and **enable direct `npm publish`** (stage-only is the default and would reject the release workflow).
3. **Release from then on**: bump `version` in `package.json`, commit, push, then `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow checks the plugin loads into the latest dsh, runs the full chain, verifies the tag matches the version, and publishes — no tokens stored anywhere.

Version rules of thumb: the tag must equal `v` + `package.json` version exactly, and a version, once published, can never be republished.
