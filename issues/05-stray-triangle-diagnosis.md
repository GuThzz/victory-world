# 05 — Diagnose the yard shard and the sky spikes

- **Title:** Diagnose the yard shard and the sky spikes
- **Lane:** Mesh geometry (stray triangles)
- **Files owned:** to be confirmed by the lead
- **Symptom:** a dark stretched shard runs from the watchtower across the yard for several seconds, then spikes appear in the sky.
- **Evidence:** run `fork-caption` at 7:51 and 10:26; the suspect is the missing 9-bit primitive-index mask (issue 04).
- **Ruled out:** —
- **Done when:** either issue 04 removes both, or the draw and vertex range that produce them are named with a capture and a fix follows.
- **Size:** M
