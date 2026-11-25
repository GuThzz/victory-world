#!/usr/bin/env node
// The `harness build:` line run-world.sh writes at the top of a run log. A lane checkout names its commit; a
// snapshot build (VICTORY_DIR is not a git checkout) names the commit, branch and profile from snapshot.txt beside
// VICTORY_BIN, which snapshot-build.sh writes. usage: node build-line.mjs <victory-dir> [<victory-bin> <profile> <console>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function commitAt(dir) {
  if (!dir) return null;
  const result = spawnSync('git', ['-C', dir, 'log', '-1', '--format=%h'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const sha = (result.stdout || '').trim();
  return /^[0-9a-f]{7,}$/.test(sha) ? sha : null;
}

// snapshot.txt: one `name: value` a line, as snapshot-build.sh writes it.
export function readSnapshot(file) {
  if (!file || !fs.existsSync(file)) return null;
  const fields = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(commit|branch|profile|features|date|lane): (.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields.commit ? fields : null;
}

export function buildLine({ dir, bin, profile, console, gitCommit = commitAt }) {
  const sha = gitCommit(dir);
  if (sha) return `harness build: ${sha} profile=${profile} console=${console}`;
  const snapshot = bin ? readSnapshot(path.join(path.dirname(bin), 'snapshot.txt')) : null;
  if (snapshot) {
    const short = snapshot.commit.slice(0, 7);
    const branch = snapshot.branch ? ` branch=${snapshot.branch}` : '';
    return `harness build: ${short} profile=${snapshot.profile || profile} console=${console}${branch}`;
  }
  // Today's line for a run whose build cannot be named; the experiment table already reads it.
  return `harness build:  profile=${profile} console=${console}`;
}

function main() {
  const [dir, bin = '', profile = 'diag', consoleName = 'series-x'] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node build-line.mjs <victory-dir> [<victory-bin> <profile> <console>]');
    process.exit(2);
  }
  console.log(buildLine({ dir, bin, profile, console: consoleName }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
