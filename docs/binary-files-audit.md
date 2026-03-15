# Binary file audit

This audit documents files that appeared as binary and could block or degrade PR diff review tools.

## Previously added in the import commit

- `archives/zettel-canvas-mind-main.zip` (ZIP archive; binary and non-diffable).
- `imports/zettel-canvas-mind-main/bun.lockb` (Bun binary lockfile).
- `imports/zettel-canvas-mind-main/public/favicon.ico` (ICO binary image).

## Remaining tracked binary in repository

- `VIBO_ROADMAP_V7.docx` (existing Office document from earlier history; not part of this import adjustment).

## Mitigation applied

- Removed the ZIP archive from tracking.
- Removed `bun.lockb` from tracking and ignored it in `imports/zettel-canvas-mind-main/.gitignore`.
- Removed binary `favicon.ico` from tracking.
