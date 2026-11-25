# Contributing and claiming work

A job moves in one direction: claim, branch, gate, review, merge. The claim is what keeps two people out of the
same files; the gate and the review are what keep `world` sound.

## Claiming and releasing

- One issue is one job. Comment on it with your name and the branch you will push, assign yourself, and open a
  draft pull request before you change code (`gh issue edit <n> --add-assignee @me`).
- A claim with no push for 24 hours is free again. The next claimant comments why and takes it; the previous
  claimant's branch stays for reference.
- To hand a job over: unassign yourself and comment the branch head, what is done and what is left.
- A job that turns out to be wrong or larger than its issue: comment what you found and ask for the issue to be
  changed before you widen it.

## One lane per pull request

Each issue names exactly one lane. Two lanes never own the same file.

| Lane | Owns |
|---|---|
| Room and portal decision (the missing walls) | what the title reads back from us: view guards, read-backs |
| Mesh geometry (stray triangles) | the mesh shader path |
| Texture layout (scrambled patches) | staging and detiling |
| 64-lane shaders on 32-lane hosts | the wave lowering, one effect per issue |
| Host-refused pipelines | pipeline creation |
| Cutscene white-out and screen-filling triangles | to be located: the first issue is diagnosis only |
| Speed | copies, read-back, texture refresh waits |
| Harness and tools | `harness/` |

An issue whose files are not yet certain says "files to be confirmed by the lead". Ask on the issue before you edit
outside what it lists. Keep a pull request to one lane even when two changes are ready: split it.

## Results from another GPU

A run is evidence only if it can be compared with someone else's.

- Paste the whole `summarize-run.mjs` summary. It already carries the build, the settings and "what was on screen".
- Add a `harness machine:` line at the top of your log paste: a self-chosen machine id, the GPU and its driver
  version, RAM, and the Windows build. The same id on later runs is what makes them comparable.
- Run the key script and settings the issue names. Say whether the cache was cold or warm.
- For an intermittent fault, report how many runs showed it out of how many, and what differed.
- Captures stay on your machine. Describe what you saw; post counts and times.

## What a reviewer checks

- The issue's "done when" is met, and a test fails before the change and passes after it.
- The gate in [AGENTS.md](AGENTS.md) is green for the crates touched.
- The diff keeps parts of the game out (assets, executable bytes, shader dumps, decompiled or disassembled code,
  captures) and holds no bulk extracted table. A shader may be named beside its 16-hex id; each contributor's own
  names index comes from their own copy with `victory shader-names`.
- The change stays in one lane and touches no file another lane owns.
- Run evidence, where the issue asks for it: the summary whole, with the machine line and a run tag.
- The commits say what changed and why, in one or two paragraphs. Formatting-only churn is split out.
