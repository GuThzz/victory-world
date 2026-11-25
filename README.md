# victory-world

A community project that runs a console title on Windows. victory-world coordinates the work: the agent
instructions, the known-faults page, the rules for claiming jobs and the source of the issue board under `issues/`. The runtime itself is VIctory, an open-source recompilation layer and
Direct3D 12 back end kept in its own repository. Everything here is about running the title from a copy you own,
and fixing what it draws.

## What you need

- Your own copy of the title, on your own disk. Nothing from it is stored here.
- Windows 10 or 11, with a Direct3D 12 GPU (shader model 6.6, and mesh shaders for the world).
- Rust (the pinned toolchain installs itself on the first build), Node 18 or later, and ffmpeg with the run
  recorder's capture filter, for the harness.
- Git for Windows, for the harness's shell scripts.

## How to start

1. Clone victory-world, then clone the runtime into `victory/` inside it:
   `git clone -b next https://github.com/ZSlayerHQ/victory-world-runtime victory`.
   The runtime has two branches. `next` is the line that draws whole rooms today: both public forks merged, plus
   this project's fixes; it is not yet reviewed as a whole. `world` takes only reviewed work. Work from `next`
   and open pull requests against `next`; reviewed changes move to `world`.
2. Set `game_dir` in `victory/victory.toml` to your own copy.
3. Build the runtime: `cargo build --profile diag -p victory --features diagnostics`.
4. Run it once through the harness, which records the window and writes a summary:
   `harness/run-world.sh --tag first --heavy-seconds 60`. Set `VICTORY_DIR` and `GAME_EXE` in your environment when
   your layout differs from the script's defaults; this copy's defaults are placeholders.

## Where the work is

- `AGENTS.md` — the first file any coding agent reads: the start-of-session routine, the hard rules and the gate.
- `KNOWN-FAULTS.md` — what is already diagnosed, with the evidence. Read it before you diagnose anything.
- `CONTRIBUTING.md` — how a job is claimed, released and reviewed, and which lane owns which files.
- `issues/` — the first board, one file per job; the issues are filed from it on the day the repository opens.

## The hard rules, in five lines

1. Nothing from the game is committed: no assets, executable parts, dumps, decompiled code or captures.
2. Names and pointers are fine; a bulk extracted table is not — build your own index from your own copy.
3. Work offline, and leave the console's protections alone.
4. Change no registry keys.
5. Write "the title", not its name, and keep that name out of file and folder names.

## Where the picture stands today

Rooms draw with their walls, ceilings and floors, and clothing textures are clean; the missing-walls fault is fixed
on the project's own line, confirmed in three runs of three. The opening cutscene still holds tens of seconds of
white-out, and a black face appears in one shot. Character lighting is wrong for seconds at a time at the dormitory
exit. Speed is about 2 to 4 frames a second in the playable scene. `KNOWN-FAULTS.md` has the details and the
evidence behind each line.
