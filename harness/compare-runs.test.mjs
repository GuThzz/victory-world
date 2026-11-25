import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'compare-runs.mjs');

function runCompare(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

// Markdown tables, header + rows, exactly as the script prints them.
function tables(stdout) {
  const found = [];
  let current = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('|')) {
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
      if (!current) {
        current = { header: cells, rows: [] };
        found.push(current);
      } else if (cells.every((cell) => /^-+$/.test(cell))) {
        continue;
      } else {
        current.rows.push(cells);
      }
    } else {
      current = null;
    }
  }
  return found;
}

function objects(table) {
  return table.rows.map((row) => Object.fromEntries(table.header.map((name, i) => [name, row[i]])));
}

function frameLine(ts, frame) {
  const {
    ms = 33.3,
    draws = 10,
    dropped = 0,
    making = 0,
    indirect = 0,
    preparing = 0,
    copiesMs = 0,
    copiesMb = 0,
    gpuMs = 0,
  } = frame;
  return `${ts}  INFO victory_gpu::host: 1.0 fps, ${ms} ms/frame (${preparing} preparing: copies ${copiesMs} ms ${copiesMb} MB, textures 0.0 ms 0.0 MB; ${gpuMs} on the GPU; 0.0 copying back 0.0 MB), ${draws} draws/frame, dropped ${dropped} without a host pipeline (${making} being made) and ${indirect} indirect`;
}

const dropLine = (ts, perFrame, reason) =>
  `${ts}  INFO victory_gpu::host: dropped ${perFrame}/frame without a host pipeline: ${reason}`;
const copystatLine = (ts, submissions) =>
  `${ts}  INFO victory_gpu::copystat: copies per frame: ${submissions} submissions; 1 title copies 0.1 MB; 10 refreshes 1.0 MB, 0 skipped 0.0 MB; 0 runs 0.0 ms`;
const translatedLine = (ts, stage, hash) =>
  `${ts}  INFO victory_gpu::pipeline: shader translated stage="${stage}" hash=${hash} user_data=0 samplers=0`;
const failureLine = (ts, stage, hash, reason) =>
  `${ts}  WARN victory_gpu::pipeline: shader does not translate; its pipelines' draws are dropped stage="${stage}" hash=${hash} error=GFX10 code at 0x288: ${reason} cached=false ms=9`;
const refusedLine = (ts, mesh, shaders) =>
  `${ts}  WARN victory_gpu::pipeline::host: host ${mesh ? 'mesh ' : ''}pipeline refused error=The parameter is incorrect. (0x80070057) shaders=[${shaders}]`;

const REASON_X = 'made-up reason one';
const REASON_Y = 'made-up reason two';
const REASON_Z = 'made-up reason three';
const DISPATCH = 'dispatch: its root view\'s address lies in no title buffer copy';

function logA(capture) {
  return [
    'harness build: abc profile=diag console=series-x',
    `capture: ${capture}`,
    frameLine('2026-11-24T12:00:00.000000Z', { draws: 10 }),
    frameLine('2026-11-24T12:00:10.000000Z', {
      ms: 100, draws: 1000, dropped: 100, making: 5, indirect: 10,
      preparing: 10, copiesMs: 20, copiesMb: 30, gpuMs: 40,
    }),
    copystatLine('2026-11-24T12:00:10.100000Z', '4.0'),
    dropLine('2026-11-24T12:00:10.200000Z', '2.0', 'being made'),
    dropLine('2026-11-24T12:00:10.300000Z', '3.0', 'compute aaaaaaaaaaaaaaaa'),
    frameLine('2026-11-24T12:00:15.000000Z', {
      ms: 300, draws: 2000, dropped: 300, making: 15, indirect: 30,
      preparing: 30, copiesMs: 40, copiesMb: 50, gpuMs: 60,
    }),
    copystatLine('2026-11-24T12:00:15.100000Z', '6.0'),
    dropLine('2026-11-24T12:00:15.200000Z', '4.0', 'being made'),
    dropLine('2026-11-24T12:00:15.300000Z', '1.0', DISPATCH),
    translatedLine('2026-11-24T12:00:16.000000Z', 'compute', 'aaaaaaaaaaaaaaaa'),
    translatedLine('2026-11-24T12:00:16.100000Z', 'compute', 'bbbbbbbbbbbbbbbb'),
    failureLine('2026-11-24T12:00:17.000000Z', 'compute', 'aaaaaaaaaaaaaaaa', REASON_X),
    failureLine('2026-11-24T12:00:17.100000Z', 'pixel', 'cccccccccccccccc', REASON_Y),
    refusedLine('2026-11-24T12:00:18.000000Z', false, 'compute aaaaaaaaaaaaaaaa'),
    refusedLine('2026-11-24T12:00:18.100000Z', true, 'mesh 1111222233334444, pixel 5555666677778888'),
    'harness: ended by --heavy-seconds after 10 s of heavy scene',
    '',
  ].join('\n');
}

function logB(capture) {
  return [
    'harness build: abc profile=diag console=series-x',
    `capture: ${capture}`,
    frameLine('2026-11-24T12:01:00.000000Z', { draws: 20 }),
    frameLine('2026-11-24T12:01:10.000000Z', {
      ms: 200, draws: 1500, dropped: 200, making: 0, indirect: 5,
      preparing: 20, copiesMs: 10, copiesMb: 30, gpuMs: 50,
    }),
    copystatLine('2026-11-24T12:01:10.100000Z', '5.0'),
    dropLine('2026-11-24T12:01:10.200000Z', '1.0', 'being made'),
    frameLine('2026-11-24T12:01:15.000000Z', {
      ms: 400, draws: 2500, dropped: 400, making: 0, indirect: 15,
      preparing: 40, copiesMs: 30, copiesMb: 40, gpuMs: 70,
    }),
    copystatLine('2026-11-24T12:01:15.100000Z', '7.0'),
    dropLine('2026-11-24T12:01:15.200000Z', '3.0', DISPATCH),
    translatedLine('2026-11-24T12:01:16.000000Z', 'pixel', 'dddddddddddddddd'),
    translatedLine('2026-11-24T12:01:16.100000Z', 'mesh', 'eeeeeeeeeeeeeeee'),
    failureLine('2026-11-24T12:01:17.000000Z', 'compute', 'ffffffffffffffff', REASON_X),
    failureLine('2026-11-24T12:01:17.100000Z', 'compute', '1111111111111111', REASON_X),
    failureLine('2026-11-24T12:01:17.200000Z', 'vertex', '2222222222222222', REASON_Z),
    'title exited with 0',
    '',
  ].join('\n');
}

test('compare runs: heavy-scene table, endings, drops, failures and pipelines', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-runs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const aPath = path.join(dir, '20261124-120000-alpha.log');
  const bPath = path.join(dir, '20261124-120100-beta.log');
  fs.writeFileSync(aPath, logA(path.join(dir, 'capture-a')));
  fs.writeFileSync(bPath, logB(path.join(dir, 'capture-b')));

  const result = runCompare([aPath, bPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');

  const all = tables(result.stdout);
  assert.equal(all.length, 4, 'heavy scene, drops, translation failures, pipelines');

  const aName = '20261124-120000-alpha';
  const bName = '20261124-120100-beta';
  assert.deepEqual(all[0].header, ['metric', aName, bName]);
  const heavyRows = objects(all[0]);
  const heavyRow = (label) => {
    const row = heavyRows.find((entry) => entry.metric === label);
    return [row[aName], row[bName]];
  };

  assert.deepEqual(heavyRow('Heavy frames'), ['2', '2']);
  assert.deepEqual(heavyRow('Frame ms median'), ['200.0', '300.0']);
  assert.deepEqual(heavyRow('Frame ms p95'), ['300.0', '400.0']);
  assert.deepEqual(heavyRow('GPU ms median'), ['50.0', '60.0']);
  assert.deepEqual(heavyRow('GPU ms p95'), ['60.0', '70.0']);
  assert.deepEqual(heavyRow('Preparing ms median'), ['20.0', '30.0']);
  assert.deepEqual(heavyRow('Copies ms median'), ['30.0', '20.0']);
  assert.deepEqual(heavyRow('Copies MB median'), ['40.0', '35.0']);
  assert.deepEqual(heavyRow('Draws a frame median'), ['1500.0', '2000.0']);
  assert.deepEqual(heavyRow('Dropped a frame median'), ['200.0', '300.0']);
  assert.deepEqual(heavyRow('Indirect executions dropped median'), ['20.0', '10.0']);
  assert.deepEqual(heavyRow('Being made median'), ['10.0', '0.0']);
  assert.deepEqual(heavyRow('Submissions a frame median'), ['5.0', '6.0']);
  assert.equal(
    heavyRows.some((entry) => 'PresentMon frames' in entry),
    false,
    'no CSV, no PresentMon rows',
  );

  assert.match(result.stdout, /- \*\*A\*\* ended: ended by the harness after 10 s of heavy scene/);
  assert.match(result.stdout, /- \*\*B\*\* ended: clean exit/);
  assert.match(result.stdout, /- \*\*A\*\* driver events: none/);

  const drops = objects(all[1]);
  assert.deepEqual(
    drops.map((row) => row.reason),
    [DISPATCH, 'compute aaaaaaaaaaaaaaaa', 'being made'],
    'sorted by the change, largest increase first',
  );
  assert.deepEqual(drops[0], { reason: DISPATCH, 'A / frame': '0.5', 'B / frame': '1.5', change: '+1.0' });
  assert.deepEqual(drops[1], {
    reason: 'compute aaaaaaaaaaaaaaaa',
    'A / frame': '1.5',
    'B / frame': '0.0',
    change: '-1.5',
  });
  assert.deepEqual(drops[2], { reason: 'being made', 'A / frame': '3.0', 'B / frame': '0.5', change: '-2.5' });

  const failures = objects(all[2]);
  const failure = (reason) => failures.find((row) => row.reason === reason);
  assert.deepEqual(failure(REASON_X), { reason: REASON_X, A: '1', B: '2' });
  assert.deepEqual(failure(REASON_Y), { reason: REASON_Y, A: '1', B: '0' });
  assert.deepEqual(failure(REASON_Z), { reason: REASON_Z, A: '0', B: '1' });
  assert.ok(result.stdout.includes(`- only in A: ${REASON_Y} (1)`), result.stdout);
  assert.ok(result.stdout.includes(`- only in B: ${REASON_Z} (1)`), result.stdout);

  const pipelines = objects(all[3]);
  const pipeline = (name) => [pipelines.find((row) => row.pipeline === name)[aName], pipelines.find((row) => row.pipeline === name)[bName]];
  assert.deepEqual(pipeline('translated total'), ['2', '2']);
  assert.deepEqual(pipeline('translated compute'), ['2', '0']);
  assert.deepEqual(pipeline('translated mesh'), ['0', '1']);
  assert.deepEqual(pipeline('translated pixel'), ['0', '1']);
  assert.deepEqual(pipeline('refused'), ['2', '0'], 'plain and mesh refusals both count');
});

test('four heavy frame lines: the median is the mean of the middle two, not the lower one', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-median-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, '20261124-230000-median.log');
  fs.writeFileSync(
    log,
    [
      'harness build: abc profile=diag console=series-x',
      frameLine('2026-11-24T12:00:00.000000Z', { ms: 33.3, draws: 10 }),
      frameLine('2026-11-24T12:00:10.000000Z', { ms: 100, draws: 800, dropped: 300 }),
      frameLine('2026-11-24T12:00:15.000000Z', { ms: 200, draws: 800, dropped: 400 }),
      frameLine('2026-11-24T12:00:20.000000Z', { ms: 300, draws: 900, dropped: 300 }),
      frameLine('2026-11-24T12:00:25.000000Z', { ms: 600, draws: 900, dropped: 300 }),
      'harness: victory exit=0',
      '',
    ].join('\n'),
  );
  const result = runCompare([log, log]);
  assert.equal(result.status, 0, result.stderr);
  const heavy = objects(tables(result.stdout).find((table) => table.header[0] === 'metric'));
  const name = '20261124-230000-median';
  assert.equal(heavy.find((row) => row.metric === 'Heavy frames')[name], '4');
  // 100, 200, 300, 600 sorted: the middle two are 200 and 300. The lower middle (200) is not the median.
  assert.equal(heavy.find((row) => row.metric === 'Frame ms median')[name], '250.0');
});
