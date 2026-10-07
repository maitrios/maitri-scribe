# Releasing

Releases are built and published by `.github/workflows/release.yml`. The workflow attaches a prebuilt bundle so people can install the extension without a Node toolchain.

## Cut a release

1. Bump `version` in `package.json` and move the `Unreleased` notes in `CHANGELOG.md` under the new version.
2. Commit as `chore(release): x.y.z`.
3. Tag and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

## What the workflow produces

On a `v*` tag push, CI runs `npm ci`, `npm run typecheck`, `npm test` and `npx vici build -o dist`, then packages `dist/` and attaches it to the GitHub release:

| Asset | Description |
| --- | --- |
| `maitri-scribe.tar.gz` | The built extension (`package.json`, `*.js`, `assets/`) with contents at the archive root. |
| `maitri-scribe.tar.gz.sha256` | SHA-256 checksum of the tarball. |

Because the contents sit at the archive root, the tarball unpacks directly into a target directory:

```bash
sha256sum -c maitri-scribe.tar.gz.sha256
mkdir -p ~/.local/share/vicinae/extensions/scribe
tar -xzf maitri-scribe.tar.gz -C ~/.local/share/vicinae/extensions/scribe
```

## Vicinae store

The store is a monorepo, so a store release is a pull request rather than a tag:

1. Fork [vicinaehq/extensions](https://github.com/vicinaehq/extensions) and add this repo's contents under `extensions/scribe`.
2. Make sure `package-lock.json` is committed. The store build needs it.
3. `author` in `package.json` must be a GitHub username. It is `maitrios`.
4. Open the pull request.
