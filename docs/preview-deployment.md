# Digest preview deployment

This procedure prepares a one-page, self-contained copy of `GET /digest/2026-10-28`. The manual workflow is a publication tool; committing it or running its local export does not publish anything. The expected project Pages URL, derived from GitHub's project-site URL rule and this repository name, is <https://szyman1337.github.io/mega-dev-s01e04-before-i-looked/>. It has not been verified as live.

In the course checkout, the workflow file is nested at `challenges/s01e04-before-i-looked/rig/.github/workflows/`. The coordinator integrates the `rig/` contents into the dedicated challenge repository, where `.github/workflows/` and `.private/preview/` are at the repository root; workflow paths are relative to that root.

## Local export

Run these commands from `challenges/s01e04-before-i-looked/rig`:

```sh
cp .env.example .env
# Set LANE_MARKER in .env to the marker issued for this lane.
pnpm preview:export:marked
```

The command starts its own service on a temporary local port, fetches the digest over HTTP, checks the golden rows and self-contained HTML, writes `.private/preview/index.html`, and stops only the service it started. It loads `.env` the same way as `pnpm start`. Keep `.env` and `.private/` out of Git.

To create the cleanup copy, run the explicit clean command:

```sh
pnpm preview:export:clean
```

Clean mode starts a new service process with `LANE_MARKER` set to an empty string in its environment. Node's `.env` loader does not override an already-set environment value, so the rendered banner reads `no marker set` even if `.env` contains a marker. Inspect the generated file locally before any separately approved upload. Both commands overwrite the same local file.

## One-time Pages setup

After the required approval to publish:

1. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Confirm that the repository is eligible for Pages and that the `github-pages` environment exists.
2. Add the lane marker as the repository Actions secret `PREVIEW_LANE_MARKER`. Do not put it in a workflow input, source file, or workflow log. Marked mode fails if this secret is empty.
3. Keep the Actions token permissions at the workflow's stated minimum: read repository contents, deploy Pages (`pages: write`, `id-token: write`), and delete its own uploaded workflow artifact (`actions: write`). Do not enable any push or pull-request trigger for this workflow.

The workflow uses official `actions/configure-pages@v5`, `actions/upload-pages-artifact@v5`, and `actions/deploy-pages@v4` contracts. It packages only the contents of the generated preview directory, which contains only `index.html`. The Pages artifact upload has a one-day retention period, and the workflow deletes that upload artifact after deployment using the artifact ID output and the Actions artifacts REST endpoint. If the cleanup step cannot run (for example, the run is force-cancelled), GitHub's retention policy is the fallback; an artifact already deleted cannot be recovered. Deleting the upload artifact does not remove the deployed Pages site.

## First publication and replacement

These steps require the coordinator's separate approval and are not part of local validation:

1. Confirm the approved repository and secret settings, and review the candidate export locally.
2. In **Actions → Deploy digest preview → Run workflow**, choose `marked`. Wait for deployment and verify the output at the expected URL shows the lane banner and the five jobs. Do not copy the marker into a comment or log.
3. Only after review and separate cleanup approval, run the same manual workflow with `clean`. This replaces the same project URL with the new static page. Verify its response has the five jobs and `no marker set`.
4. If a publication is wrong, rerun the workflow with the corrected mode after approval. To unpublish, use **Settings → Pages** to disable/remove the Pages site, then verify the URL no longer serves the preview. Preserve any approval and review evidence outside the published page; do not commit exports, `.env`, logs, or marker values.

Issue [SzyMan1337/mega-dev-s01e04-before-i-looked#6](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/6) remains open until the link and issue tracker are actually submitted to the reviewer. The clean overwrite and plan archival belong to [SzyMan1337/mega-dev-s01e04-before-i-looked#7](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/7).
