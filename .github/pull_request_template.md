## What this closes

Closes #<issue>

## What changed, and why

## The lane

- Lane:
- Files this lane owns:

## Gate

- [ ] A test fails before the change and passes after it, or the issue says why none can exist.
- [ ] `cargo test -p <crate>` passes for every crate touched.
- [ ] `cargo clippy --all-targets -- -D warnings` is clean for those crates.
- [ ] `cargo xtask policy` passes.
- [ ] Harness changes: `node --test harness/` passes and `bash -n` accepts every changed script.
- [ ] The diff keeps parts of the game out: no captures, assets, executable bytes, shader dumps, decompiled or
      disassembled code, and no bulk extracted table. A shader is named beside its 16-hex id where that helps.
- [ ] Where the issue asks for a run: its summary is pasted whole with the machine line and a run tag.

## Review

- [ ] Reviewed by someone other than the author.
