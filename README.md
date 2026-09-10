# RepoRadar

A dependency-free, static GitHub repository directory. Six topics, **up to ten repositories per topic**. The existing radar illustration, blue dark/light palette, monospaced repository names and responsive list are preserved. Interface text is Vietnamese; original GitHub descriptions are preserved alongside optional, clearly labeled Vietnamese editorial profiles.

**Setup does not commit, push, configure remote services or activate scheduled workflows.** The checked-in JSON contains a collected GitHub snapshot and one-time Vietnamese editorial profiles. Trending stays pending until its definition is approved; no 90-day heuristic is implemented.

## Run locally

Requires Node.js **22 or newer** and npm. There are no packages to install and no external fonts, analytics or browser API calls to GitHub.

```sh
npm run verify              # syntax + hygiene + offline tests + static build
npm run preview             # http://127.0.0.1:4173/ (dist)
npm run preview -- root     # preview working source, same public-file allowlist
npm run preview -- dist /reporadar/  # project-base-path check
```

Use `PORT=4174 npm run preview` to choose another local port. The server binds only to loopback, accepts GET/HEAD, and serves an explicit public-file allowlist. It does not expose `.git`, `.env`, test fixtures, scripts, documentation or arbitrary project files. Traversal and escaping symlinks are rejected. Stop with Ctrl+C. Use HTTP, not `file://`, because the frontend fetches JSON and uses ES modules.

Individual gates: `npm run check`, `npm run lint`, `npm test`, `npm run build`. `check` uses native `node --check`, parses JSON and validates config/data/editorial. There is no TypeScript or TypeScript check. `lint` is a small, self-owned whitespace/newline/indentation check, **not semantic lint or ESLint**. Build validates and copies only eight public files (including the editorial JSON and validator module) plus `.nojekyll` and a build ownership marker. It stages before replacing its owned `dist`; it refuses to delete an unrecognized `dist`. No bundler, dependency, network request or remote command runs during these gates.

## Collect real metadata (optional, contacts GitHub)

The site uses the stored snapshot in `data/repositories.json`; offline tests keep their sample fixtures separate. Refresh is **not** part of verify/build/preview or Vercel deployment. Review `config/topics.json` before making real requests.

```sh
npm run refresh
```

An unauthenticated run is supported but has tighter rate limits. For an authenticated run, supply `GITHUB_TOKEN` through your shell or a secure secret manager. For example, in Bash, enter it without putting the value in command history:

```sh
read -rs -p 'GitHub token: ' GITHUB_TOKEN
export GITHUB_TOKEN
npm run refresh
unset GITHUB_TOKEN
```

Use a short-lived, least-privileged token that can read public repository search; no write permission is required for local collection. Never paste credentials into source, JSON, URLs, logs, screenshots or commits. `.env*` is ignored, but no dotenv loading is implemented. The token is consumed by the Node process only, never shipped to the browser. Avoid `set -x` when handling secrets. No token argument is accepted by the refresh CLI.

Exit codes: **0** all active topics succeeded; **2** partial success was persisted, failed selections retained; **1** full failure or local validation/I/O failure. Full collection failure does not rewrite even the timestamps in existing JSON. Safe per-topic error codes and counters are logged; raw GitHub error bodies and credentials are not. Summary includes elapsed milliseconds, requests, candidates and selection counts.

Refresh takes an exclusive `data/.refresh.lock`, validates the previous snapshot, merges, validates and atomically replaces `data/repositories.json` via a synced sibling temporary file. It does not commit anything. A second local refresh fails rather than overwriting newer work. If a process is killed, confirm no refresh is still running before manually removing the stale lock. A crash can leave an ignored `.tmp` file; it is not used as published data. Atomic replacement protects readers; no guarantee is made against all filesystem/power-loss behavior. Do not edit the dataset concurrently with refresh.

## Selection contract

- Five active menus plus pending Trending. Up to three independent queries per topic; **OR by union**, not concatenated AND queries. First page only, up to 100 candidates/query, with GitHub `sort=stars&order=desc`. This is bounded coverage, not the best ten repositories across all GitHub.
- Queries are restricted to exact `topic:…` qualifiers or quoted terms with `in:name,description`. No README, cloning, source execution, AI, star-growth calculation or per-visitor GitHub search.
- Each topic has explicit public/archived/fork policy, minimum stars, exact excluded full names/IDs and metadata keyword exclusions. `policy` documents whether collections, SDKs, tutorials and frameworks are admitted. These are **provisional metadata rules, not manually verified classification**. Short terms such as `sdk` are substring exclusions and may need tuning.
- Deduplicate by stable numeric GitHub ID, rank by stars descending, push timestamp descending (missing last), then ID ascending. Take at most ten; zero is a valid success. Repositories may appear in multiple topics.
- Any required query failure, malformed response or `incomplete_results: true` fails that topic. Its last-success IDs and ordering remain unchanged. Metadata only referenced by retained selections survives. Shared metadata may be updated by a successful topic, so a failed topic's old order can differ from current star counts. Successful selections are sorted again against merged metadata.
- Selection scope describes the **last successful selection** (or first attempted scope when never successful). Current queries/policy live in config; after a config change and failed refresh, the old scope remains visible in JSON.
- REST requests have a 12-second timeout covering response/body, at most two retries, a 30-second maximum wait and a five-minute run budget. Up to 42 requests for current 14-query config including retries. Retry-After and exhausted rate-limit reset headers delay requests; long waits fail safely rather than sleeping unboundedly. Non-rate-limit 4xx errors are not retried. Budgets can leave later topics failed without requests.

`schema_version: 1` includes manifest generation time, repositories keyed by ID, and six selections with status (`never`, `pending`, `success`, `error`), ranked IDs, attempt/success UTC timestamps, safe error code, ranking basis and query scope. Repo metadata has distinct created/pushed/fetched timestamps, raw description, language, topics, GitHub-recognized license and safe URLs. Every reference and successful ranking is validated. Unreferenced metadata is pruned only in a validated merge; editorial is stored separately and never pruned by refresh.

## Optional Vietnamese editorial profiles

`data/editorial.json` has the contract `{ "schema_version": 1, "repositories": { "<positive GitHub numeric ID>": profile } }`. An empty repositories object is valid. Each profile requires `full_name`, `overview`, arrays of strings `capabilities`, `use_cases`, `requirements`, nonempty `sources` containing `{title, url}`, an ISO UTC `reviewed_at`, and `provenance: "ai-assisted-source-review"`. `shared/editorial.js` validates safe numeric IDs, bounded text/arrays, timestamps and HTTP(S) source URLs without credentials. Profiles are joined only by stable ID, not name; departed or renamed repositories remain in this store without changing current topic membership.

Editorial is an approved **one-time AI-assisted explanation in Vietnamese from primary documentation**, not an independent test or endorsement of capabilities, quality, security or suitability. Cards label it “Biên soạn tiếng Việt”; details put purpose first, followed by concrete capabilities, use cases, requirements, cited sources and review date. Original GitHub descriptions remain separately attributed. Empty optional sections are omitted.

`reviewed_at` records when the sources were reviewed, not when the upstream documentation last changed. Source claims may become outdated. Metadata `fetched_at` records the API fetch only and does not refresh editorial or prove source freshness. Daily refresh remains metadata-only: it does not read, generate, translate, prune or overwrite editorial. Any later editorial revision requires a separate source review and deliberate file edit. Check/build validate this file and copy it unchanged; they do not require a nonzero profile count. Browser fetch/JSON/schema failures in this optional file display a nonintrusive notice and fall back to original descriptions without blocking metadata. Search includes the Vietnamese overview and all three content arrays within the published selection only.

## Frontend behavior and safety

Search and language filters affect only the published selection; alternate sorts do not change its membership. The default order is the published ranking. Each row has internal details and a separate GitHub link. Detail routes use `#/topic/mcp-servers/repo/123`; links and assets work below a project base path. Native modal dialog supplies background inertness; keyboard Tab trapping, Escape/cancel, close, browser Back and focus restoration are supported. Direct detail URLs receive a same-topic history entry so Back closes details. In-page topic switches retain filters/sort/scroll; filter persistence across a full reload is not promised. Missing repo IDs get an explicit message; unknown topic hashes normalize to Agent Skills.

The panel presents optional editorial, original metadata and source links, with explicit missing-description/license/feature-content fallbacks. All supplied text is escaped before HTML rendering; external URLs are checked again at rendering. GitHub URLs must match the repo's `https://github.com/owner/name`; homepage and editorial source URLs use HTTP/HTTPS without credentials. A valid URL is **not a safety endorsement**. There are no external embeds. Required data load errors offer retry rather than masquerading as empty results. UTC timestamps display in Vietnam time (UTC+7); metadata stale warnings appear after 48 hours, updated on page visibility and each minute. No artificial numbers or sample repo descriptions ship in production.

## Deploy the static site to Vercel

`vercel.json` sets the framework to Other, runs `npm run build`, and publishes only `dist`. No Docker, Supabase, Vercel Functions or runtime environment variables are required. Prefer Node.js 24.x in Vercel Project Settings to match local verification; the project requires Node.js 22 or newer.

1. Run `npm run verify` locally.
2. Review and commit/push the intended source changes to the GitHub branch Vercel will import, including `vercel.json`, `config/`, `shared/`, `assets/`, `scripts/`, `package.json`, `index.html`, and both `data/repositories.json` and `data/editorial.json`. This is an operator step, not something the build performs. Never include credentials; `dist` remains ignored and is built by Vercel.
3. In Vercel, add/import the GitHub repository. Use preset **Other**, root directory **./** when package.json is at the repository root, build command **npm run build**, and output directory **dist**. The configuration file supplies the last two settings; remove conflicting project overrides. Leave the install command at its default and environment variables empty.
4. Deploy and check the homepage, topic navigation and a detail deep link. Verify `/data/repositories.json`, `/data/editorial.json` and `/shared/editorial.js` return successfully on the deployed domain. Hash routing needs no catch-all rewrite.

Deployment publishes the stored metadata and editorial; it does not collect fresh data or activate the midnight schedule. `GITHUB_TOKEN` is only needed if a separately executed refresh uses authenticated GitHub requests, not for this static build. Do not change the build command to include refresh: an API outage should not block publishing an existing valid snapshot.

For a later approved schedule, adapt collection/persistence to the Vercel deployment path rather than enabling the Pages draft below unchanged. Verify how the selected commit/token or explicit deployment mechanism triggers Vercel; do not assume a bot commit automatically produces a deployment. Scheduling and remote deployment have not been activated by adding this configuration.

## GitHub Pages deployment draft — NOT ACTIVATED

`.github/workflows/refresh.yml.disabled` is deliberately **not a recognized workflow extension**. It is inert locally and would stay inert if uploaded unchanged. It is a design draft, not an executed or production-validated workflow. Nothing here enables GitHub Actions, Pages, billing or a remote repository.

The draft specifies `0 17 * * *` (00:00 Vietnam), `workflow_dispatch`, default-branch-only execution, no PR/push trigger, one publication concurrency group, native checks, bounded collection, same-file persistence with normal non-force push, one static artifact and Pages deploy in the same workflow. Partial success deploys the validated merge and then reports failure; full failure stops before persistence/deploy. Concurrent remote commits reject the normal push, stopping deploy: restart from the latest default branch, never force-push. Build/test failure stops before persistence. Deploy failure leaves the last Pages artifact live; rerun from the persisted data after investigating. The writer job has contents write; only deploy has Pages/OIDC permissions.

**Before any activation, get separate approval** and verify trusted action commit SHAs (draft uses clearly marked version references; no SHA was invented), token/branch protection compatibility, the Pages environment/source, action versions, free-tier eligibility, quotas and billing. The action/persistence/deploy flow has not been exercised remotely. Rename to `.yml` only after review and explicit activation approval. To disable a future activated workflow, use GitHub's disable control or remove its recognized workflow file; to recover, restore a known valid dataset through the approved repository review process, run local gates, then explicitly rerun the single publication workflow. These are future operator instructions, not actions performed by this implementation.

## Verification limits / next acceptance checks

`node:test` covers offline API fixtures, retries/timeouts, filtering/ranking, partial/full failure, atomic persistence and locking, schema guards, build allowlist, preview security, frontend helpers and a DOM-stub navigation lifecycle. **DOM stubs are not browser validation.** No browser packages are installed by this project. Native dialog behavior, visual contrast, mobile layout, actual keyboard handling, project-path loading and assistive technology should be checked in a real browser. Test at 360px and desktop, open/close details after filtering, use Tab/Shift+Tab/Escape/Back/Forward, reload a deep link and exercise load failure/stale data. Production displays the snapshot included in its build, not a live per-visitor API response.

Query relevance needs ongoing review even though an initial live collection succeeded. Deployment conflicts, action pins, Vercel/Pages publication and actual scheduled runs remain operational acceptance work. Trending definition is still unresolved. No SLA, quality/security ranking, exhaustive coverage, free-tier permanence or repository suitability is promised.

During implementation, the local gates were exercised on Node.js v24.14.0 / npm 11.7.0. The `camoufox-browser` command was not available in the environment, so automated real-browser validation could not run; no browser dependencies were installed. A later approved live GitHub refresh populated five topics, and a one-time source review added profiles for the 45 unique repositories in that snapshot. Node.js 22 is the declared minimum but was not separately exercised in this environment.
