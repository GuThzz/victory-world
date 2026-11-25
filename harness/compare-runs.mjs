#!/usr/bin/env node
// Compare two VIctory world runs in the heavy 3D scene and print a Markdown report.
// usage: node compare-runs.mjs <log A> <log B>
import path from 'node:path';

import { COST_RE, FRAME_RE, median, parseRunFile, percentile } from './parse-run.mjs';
import { findTrigger, presentMonCsvForLog, readPresentMon } from './presentmon.mjs';

const DASH = '—';
const SUBMISSIONS_RE = /copies per frame: ([\d.]+) submissions/;
const DROP_REASON_RE = /dropped ([\d.]+)\/frame without a host pipeline: (.+?)\s*$/;

// The heavy scene is the frame lines from findTrigger on (draws + dropped >= 1000),
// the same line PresentMon and --heavy-seconds start on. Each frame line opens a
// block: the copystat and drop-reason lines after it describe that frame report.
function analyze(logPath) {
  const { summary, extras, translationFailures, lines } = parseRunFile(logPath);
  const trigger = findTrigger(lines);
  const frames = [];
  if (trigger) {
    let block = null;
    for (let i = trigger.index; i < lines.length; i += 1) {
      const line = lines[i];
      const m = line.match(FRAME_RE);
      if (m) {
        const costs = line.match(COST_RE);
        block = {
          ms: Number(m[3]),
          draws: Number(m[5]),
          dropped: Number(m[6]),
          making: Number(m[7]),
          indirect: Number(m[8]),
          preparing: costs ? Number(costs[1]) : null,
          copiesMs: costs ? Number(costs[2]) : null,
          copiesMb: costs ? Number(costs[3]) : null,
          gpuMs: costs ? Number(costs[6]) : null,
          submissions: null,
          drops: [],
        };
        frames.push(block);
        continue;
      }
      if (!block) continue;
      let r = line.match(SUBMISSIONS_RE);
      if (r && block.submissions === null) block.submissions = Number(r[1]);
      r = line.match(DROP_REASON_RE);
      if (r) block.drops.push({ reason: r[2].trim(), perFrame: Number(r[1]) });
    }
  }
  return {
    name: path.basename(logPath).replace(/\.log$/i, ''),
    path: logPath,
    summary,
    extras,
    translationFailures,
    trigger,
    frames,
    presentmon: readPresentMon(presentMonCsvForLog(lines, logPath)),
  };
}

const finite = (x) => x !== null && x !== undefined && Number.isFinite(x);
const fmt = (x, digits = 1) => (finite(x) ? Number(x).toFixed(digits) : DASH);
const PIPE = String.fromCharCode(92) + '|';
const mdCell = (value) => {
  if (value === null || value === undefined || value === '') return DASH;
  return String(value).split('|').join(PIPE).replace(/\r?\n/g, ' ');
};
const mdRow = (cells) => `| ${cells.map(mdCell).join(' | ')} |`;

function column(run, key) {
  return run.frames.map((frame) => frame[key]).filter(finite);
}
const med = (run, key) => median(column(run, key));
const p95 = (run, key) => percentile(column(run, key), 0.95);

function metricRows(a, b) {
  const rows = [
    ['Heavy frames', a.frames.length, b.frames.length, 0],
    ['Frame ms median', med(a, 'ms'), med(b, 'ms')],
    ['Frame ms p95', p95(a, 'ms'), p95(b, 'ms')],
    ['GPU ms median', med(a, 'gpuMs'), med(b, 'gpuMs')],
    ['GPU ms p95', p95(a, 'gpuMs'), p95(b, 'gpuMs')],
    ['Preparing ms median', med(a, 'preparing'), med(b, 'preparing')],
    ['Copies ms median', med(a, 'copiesMs'), med(b, 'copiesMs')],
    ['Copies MB median', med(a, 'copiesMb'), med(b, 'copiesMb')],
    ['Draws a frame median', med(a, 'draws'), med(b, 'draws')],
    ['Dropped a frame median', med(a, 'dropped'), med(b, 'dropped')],
    ['Indirect executions dropped median', med(a, 'indirect'), med(b, 'indirect')],
    ['Being made median', med(a, 'making'), med(b, 'making')],
    ['Submissions a frame median', med(a, 'submissions'), med(b, 'submissions')],
  ];
  if (a.presentmon || b.presentmon) {
    rows.push(
      [
        'PresentMon frames',
        a.presentmon ? a.presentmon.frames : null,
        b.presentmon ? b.presentmon.frames : null,
        0,
      ],
      [
        'PresentMon frame ms median',
        a.presentmon ? a.presentmon.medianMs : null,
        b.presentmon ? b.presentmon.medianMs : null,
      ],
      [
        'PresentMon frame ms p95',
        a.presentmon ? a.presentmon.p95Ms : null,
        b.presentmon ? b.presentmon.p95Ms : null,
      ],
      [
        'PresentMon GPU ms median',
        a.presentmon ? a.presentmon.gpuMedianMs : null,
        b.presentmon ? b.presentmon.gpuMedianMs : null,
      ],
    );
  }
  return rows;
}

function driverEventText(events) {
  if (!events.total) return 'none';
  const parts = [];
  if (events.counts.mmuFault) parts.push(`MMU Fault ${events.counts.mmuFault}`);
  if (events.counts.multipleWarpErrors)
    parts.push(`Multiple Warp Errors ${events.counts.multipleWarpErrors}`);
  if (events.counts.otherId13) parts.push(`other id 13 ${events.counts.otherId13}`);
  if (events.counts.id153) parts.push(`id 153 ${events.counts.id153}`);
  const esr = events.esrValueSets.map((set) => `${set.values.join(' ')} x${set.count}`);
  return `${parts.join(', ')}${esr.length ? `; ESR ${esr.join('; ')}` : ''}`;
}

// Each "dropped N/frame" line is already an average over its frame report. A
// reason missing from a report dropped none of that kind there, so it counts as
// 0 and the run's figure is the mean over all heavy-scene frame reports.
function dropAverages(run) {
  const sums = new Map();
  for (const frame of run.frames)
    for (const drop of frame.drops)
      sums.set(drop.reason, (sums.get(drop.reason) || 0) + drop.perFrame);
  const averages = new Map();
  if (run.frames.length)
    for (const [reason, sum] of sums) averages.set(reason, sum / run.frames.length);
  return averages;
}

function failureCounts(failures) {
  const counts = new Map();
  for (const failure of failures)
    counts.set(failure.reason, (counts.get(failure.reason) || 0) + 1);
  return counts;
}

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath || process.argv.length > 4) {
  console.error('usage: node compare-runs.mjs <log A> <log B>');
  process.exit(2);
}

const a = analyze(aPath);
const b = analyze(bPath);

console.log('# Compare runs');
console.log('');
console.log(`- A: \`${a.name}\``);
console.log(`- B: \`${b.name}\``);
if (!a.trigger || !b.trigger) {
  const missing = [!a.trigger ? 'A' : null, !b.trigger ? 'B' : null].filter(Boolean).join(' and ');
  console.log(`- no heavy scene found in ${missing}: is the threshold reached in that log?`);
}
console.log('');

console.log('## Heavy scene');
console.log('');
console.log(mdRow(['metric', a.name, b.name]));
console.log(`| ${['metric', a.name, b.name].map(() => '---').join(' | ')} |`);
for (const [label, av, bv, digits = 1] of metricRows(a, b)) {
  console.log(mdRow([label, fmt(av, digits), fmt(bv, digits)]));
}
console.log('');
console.log('## Ending and driver events');
console.log('');
for (const [label, run] of [
  ['A', a],
  ['B', b],
]) {
  console.log(`- **${label}** ended: ${run.extras.ending.text}`);
  console.log(`- **${label}** driver events: ${driverEventText(run.summary.driverEvents)}`);
}
console.log('');

console.log('## Drops by reason');
console.log('');
const dropA = dropAverages(a);
const dropB = dropAverages(b);
const dropReasons = [...new Set([...dropA.keys(), ...dropB.keys()])]
  .map((reason) => ({ reason, a: dropA.get(reason) || 0, b: dropB.get(reason) || 0 }))
  .sort(
    (x, y) =>
      y.b - y.a - (x.b - x.a) ||
      (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0),
  );
if (!dropReasons.length) {
  console.log('- none in either run');
} else {
  const headers = ['reason', 'A / frame', 'B / frame', 'change'];
  console.log(mdRow(headers));
  console.log(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of dropReasons) {
    const change = row.b - row.a;
    console.log(mdRow([row.reason, fmt(row.a), fmt(row.b), `${change > 0 ? '+' : ''}${fmt(change)}`]));
  }
}
console.log('');

console.log('## Translation failures by reason');
console.log('');
const failA = failureCounts(a.translationFailures);
const failB = failureCounts(b.translationFailures);
const failReasons = [...new Set([...failA.keys(), ...failB.keys()])].sort(
  (x, y) =>
    (failB.get(y) || 0) + (failA.get(y) || 0) - ((failB.get(x) || 0) + (failA.get(x) || 0)) ||
    (x < y ? -1 : x > y ? 1 : 0),
);
if (!failReasons.length) {
  console.log('- none in either run');
} else {
  const headers = ['reason', 'A', 'B'];
  console.log(mdRow(headers));
  console.log(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const reason of failReasons)
    console.log(mdRow([reason, failA.get(reason) || 0, failB.get(reason) || 0]));
}
const onlyA = failReasons.filter((reason) => (failA.get(reason) || 0) > 0 && !(failB.get(reason) > 0));
const onlyB = failReasons.filter((reason) => (failB.get(reason) || 0) > 0 && !(failA.get(reason) > 0));
console.log('');
console.log(
  `- only in A: ${onlyA.length ? onlyA.map((r) => `${r} (${failA.get(r)})`).join('; ') : 'none'}`,
);
console.log(
  `- only in B: ${onlyB.length ? onlyB.map((r) => `${r} (${failB.get(r)})`).join('; ') : 'none'}`,
);
console.log('');

console.log('## Pipelines');
console.log('');
const stages = [
  ...new Set([
    ...Object.keys(a.summary.translated.byStage),
    ...Object.keys(b.summary.translated.byStage),
  ]),
].sort();
const pipelineRows = [
  ['translated total', a.summary.translated.total, b.summary.translated.total],
  ...stages.map((stage) => [
    `translated ${stage}`,
    a.summary.translated.byStage[stage] || 0,
    b.summary.translated.byStage[stage] || 0,
  ]),
  ['refused', a.summary.refusedPipelines.count, b.summary.refusedPipelines.count],
];
const pipelineHeaders = ['pipeline', a.name, b.name];
console.log(mdRow(pipelineHeaders));
console.log(`| ${pipelineHeaders.map(() => '---').join(' | ')} |`);
for (const row of pipelineRows) console.log(mdRow(row));
