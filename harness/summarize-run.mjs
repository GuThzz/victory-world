#!/usr/bin/env node
// Condense a VIctory run log into one page.
// usage: node summarize-run.mjs <log> [--json]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import nodePath from 'node:path';
import { parseExtras, parseLogLines, readLogLines } from './parse-run.mjs';
import { presentMonCsvForLog, readPresentMon } from './presentmon.mjs';
import { annotate, defaultNamesFile, loadNames } from './name-hashes.mjs';
import {
  clock,
  formatStretch,
  frameSamples,
  joinLog,
  recordingStart,
  sampleLuma,
  timeline,
  totals,
} from './screen-timeline.mjs';

// The run's own screen recording and contact sheets, from the capture line run-world.sh writes.
function screenRecord(lines) {
  const capture = lines.map((line) => line.match(/^capture: (.+)$/)).find(Boolean);
  if (!capture) return { file: null, frames: 0, sheets: 0 };
  const file = nodePath.join(capture[1].trim(), 'screen.mp4');
  if (!fs.existsSync(file)) return { file: null, frames: 0, sheets: 0 };
  const sheetsDir = nodePath.join(nodePath.dirname(file), 'sheets');
  const sheets = fs.existsSync(sheetsDir)
    ? fs.readdirSync(sheetsDir).filter((name) => /^sheet-\d+\.jpg$/i.test(name)).length
    : 0;
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' },
  );
  const frames = Number((probe.stdout || '').trim());
  return { file, frames: Number.isFinite(frames) && frames > 0 ? frames : null, sheets };
}

const path = process.argv[2];
if (!path) {
  console.error('usage: node summarize-run.mjs <log> [--json]');
  process.exit(2);
}
const asJson = process.argv.includes('--json');

const lines = readLogLines(path);
const { summary: out, details, firstTs, lastTs } = parseLogLines(lines, path);
out.ending = parseExtras(lines, firstTs, lastTs).ending;
const presentmon = readPresentMon(presentMonCsvForLog(lines, path));
if (presentmon) out.presentmon = presentmon;

const duration = out.durationSeconds;
const last = out.lastFrameLine;
const worst = out.worstFrames;
const refused = out.refusedPipelines.hashes;
const refusedCount = out.refusedPipelines.count;
const translated = out.translated;
const slow = out.slowSubmissions;
const missingBy = out.missingTextures;
const driverEvents = out.driverEvents;
const failures = out.failures;
const { slowLists, slowCmds, hangs } = details;

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// When a shader-name table exists, every hash in the readable output gains its shader's name. JSON keeps its
// exact hash strings (it exits above).
const names = loadNames(defaultNamesFile());
if (names.size) {
  const write = console.log;
  console.log = (...args) =>
    write(...args.map((arg) => (typeof arg === 'string' ? annotate(arg, names) : arg)));
}

const f = (x, d = 1) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
console.log(`# Run summary — ${path}`);
console.log(
  `Range: ${duration === null ? '—' : duration + ' s'}; last presented frame: ${out.lastFrame ? out.lastFrame.frame : '—'}`,
);
console.log(`Ending: ${out.ending.text}`);
const record = screenRecord(lines);
console.log(
  `Screen record: ${
    record.file
      ? `${record.file} (${record.frames === null ? '?' : record.frames} frames, ${record.sheets} sheets)`
      : 'none'
  }`,
);
console.log(
  `FPS: ${out.fps.samples} samples, median ${f(out.fps.median)}, min ${f(out.fps.min)}, max ${f(out.fps.max)}, last ${f(out.fps.last)}`,
);
if (presentmon) {
  console.log(
    `PresentMon: ${presentmon.frames} frames — median ${f(presentmon.medianMs)} ms, p95 ${f(presentmon.p95Ms)} ms, GPU busy median ${f(presentmon.gpuMedianMs)} ms`,
  );
}
if (out.costs) {
  console.log(
    `Last frame: ${f(last.ms)} ms — preparing ${f(last.preparing)} (copies ${f(last.copiesMs)} ms / ${f(last.copiesMb)} MB, textures ${f(last.texturesMs)} ms / ${f(last.texturesMb)} MB), GPU ${f(last.gpuMs)} ms, readback ${f(last.backMs)} ms / ${f(last.backMb)} MB; draws ${last.draws}, dropped ${last.dropped} (${last.making} being made), indirect ${last.indirect}`,
  );
}
// The picture first (a gotcha): what the recording shows, stretch by stretch, with the log's figures for the same
// wall-clock time. A heavy scene that is black can no longer pass as "world reached".
if (record.file) {
  console.log('\n## What was on screen');
  try {
    const samples = sampleLuma(record.file);
    const stretches = joinLog(timeline(samples), { start: recordingStart(lines), frames: frameSamples(lines) });
    const all = totals(stretches);
    const black = all.longestBlack
      ? `; longest black ${clock(all.longestBlack.start)}-${clock(all.longestBlack.end)}`
      : '';
    console.log(
      `- ${samples.length} s: black ${all.seconds.black} s, near-black ${all.seconds.nearBlack} s, picture ${all.seconds.picture} s${black}`,
    );
    for (const stretch of stretches) console.log(`- ${formatStretch(stretch)}`);
  } catch (error) {
    console.log(`- unavailable: ${error.message}`);
  }
}
console.log('\n## Worst frames');
for (const w of worst) {
  console.log(
    `- ${w.ts} ${f(w.fps)} fps / ${f(w.ms)} ms: copies ${f(w.copiesMs)} ms ${f(w.copiesMb)} MB, GPU ${f(w.gpuMs)} ms, draws ${w.draws}, dropped ${w.dropped}`,
  );
}
console.log('\n## Pipeline health');
console.log(`- refused: ${refusedCount}${refusedCount ? ' — ' + refused.slice(0, 8).join('; ') : ''}`);
console.log(
  `- translated this run: ${translated.total}${Object.keys(translated.byStage).length ? ' (' + Object.entries(translated.byStage).map(([k, v]) => `${k} ${v}`).join(', ') + ')' : ''}`,
);
if (slow.length) {
  const top = [...slow].sort((a, b) => b.ms - a.ms);
  console.log(`- slow submissions: ${slow.length} over 250 ms; worst:`);
  for (const s of top.slice(0, 8))
    console.log(`  - ${s.ms} ms, ${s.lists} lists, ${s.entries} pipelines`);
  if (top.length > 8) console.log(`  - … and ${top.length - 8} more`);
}
if (slowLists.length) {
  const top = [...slowLists].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log('- slow host lists:');
  for (const s of top) console.log(`  - ${s.ms} ms, ${s.commands} commands`);
}
if (slowCmds.length) {
  const top = [...slowCmds].sort((a, b) => b.ms - a.ms).slice(0, 8);
  console.log('- slowest commands:');
  for (const c of top) console.log(`  - ${c.ms} ms: ${c.desc.slice(0, 150)}`);
}
if (Object.keys(missingBy).length) {
  console.log('\n## Textures with no host copy');
  for (const [k, v] of Object.entries(missingBy)) console.log(`- ${k} x${v}`);
}
if (hangs.length) {
  console.log('\n## Hung commands');
  for (const h of hangs) {
    const pipeline = h.pipelineUnknown
      ? `pipeline unknown (${h.pipelineUnknown})`
      : h.command;
    console.log(`- stopped at command ${h.at}/${h.of} (op ${h.op}): ${pipeline}`);
  }
}
console.log('\n## Driver events');
if (!driverEvents.total) {
  console.log('- none');
} else {
  console.log(`- MMU Fault: ${driverEvents.counts.mmuFault}`);
  console.log(`- Multiple Warp Errors: ${driverEvents.counts.multipleWarpErrors}`);
  console.log(`- other id 13 texts: ${driverEvents.counts.otherId13}`);
  console.log(`- id 153: ${driverEvents.counts.id153}`);
  for (const set of driverEvents.esrValueSets)
    console.log(`- ESR values: ${set.values.join(' ')} x${set.count}`);
}
if (failures.length) {
  console.log('\n## Failures');
  for (const x of failures) console.log(`- ${x}${x.length >= 300 ? '…' : ''}`);
}
