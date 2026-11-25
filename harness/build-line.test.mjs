import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildLine } from './build-line.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'build-line.mjs');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-line-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a lane checkout names its commit', () => {
  const line = buildLine({
    dir: '<drive>/lane',
    bin: '<drive>/builds/x/victory.exe',
    profile: 'diag',
    console: 'series-x',
    gitCommit: () => 'abc1234',
  });
  assert.equal(line, 'harness build: abc1234 profile=diag console=series-x');
});

test('a snapshot build names the commit, branch and profile from snapshot.txt beside the binary', (t) => {
  const dir = tempDir(t);
  const bin = path.join(dir, 'victory.exe');
  fs.writeFileSync(bin, '');
  fs.writeFileSync(
    path.join(dir, 'snapshot.txt'),
    [
      'commit: 0123456789abcdef0123456789abcdef01234567',
      'branch: job/fork',
      'profile: release',
      'features: diagnostics',
      'date: 2026-11-25T02:00:00Z',
      'lane: <drive>/lane',
      '',
    ].join('\n'),
  );
  const line = buildLine({
    dir: '<drive>/builds/x',
    bin,
    profile: 'diag',
    console: 'series-x',
    gitCommit: () => null,
  });
  assert.equal(line, 'harness build: 0123456 profile=release console=series-x branch=job/fork');
});

test('with neither, the line keeps the blank commit the experiment table already reads', () => {
  const line = buildLine({
    dir: '<drive>/not/there',
    bin: '<drive>/not/there/victory.exe',
    profile: 'release',
    console: 'series-s',
    gitCommit: () => null,
  });
  assert.equal(line, 'harness build:  profile=release console=series-s');
});

test('the CLI prints the line run-world.sh writes into the log', (t) => {
  const dir = tempDir(t);
  const bin = path.join(dir, 'victory.exe');
  fs.writeFileSync(bin, '');
  fs.writeFileSync(
    path.join(dir, 'snapshot.txt'),
    'commit: 89abcdef0123456789abcdef0123456789abcdef\nbranch: job/laptop\nprofile: diag\n',
  );
  const result = spawnSync(process.execPath, [script, '<drive>/not/a/checkout', bin, 'diag', 'series-x'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    'harness build: 89abcde profile=diag console=series-x branch=job/laptop',
  );
});
