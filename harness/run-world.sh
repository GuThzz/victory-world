#!/usr/bin/env bash
# One VIctory world run, with the diagnostics that matter, condensed at exit.
# usage: run-world.sh [--timing] [--volume N|off] [--no-record] [--presentmon] [--aftermath] [--warm] [--frames 2400,2600] [--keys '55:Enter,...']
#                     [--console series-x|series-s] [--profile diag|release]
#                     [--copy-mode plain|none] [--heavy-seconds N] [--tag name]
# VICTORY_BIN overrides the binary (default $VICTORY_DIR/target/$PROFILE/victory.exe).
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
VICTORY_DIR=${VICTORY_DIR:-$HERE/../victory}
GAME_EXE=${GAME_EXE:-"<game executable>"}
PROFILE=diag
TIMING=0
PRESENTMON=0
AFTERMATH=0
WARM=0
FRAMES=""
KEYS=""
CONSOLE=series-x
COPY_MODE=""
LOOP_LIMIT=""
SKIP=""
DUMP_TARGETS=""
HEAVY_SECONDS=""
TAG="run"
RECORD=1
VOLUME=4

while [ $# -gt 0 ]; do
  case "$1" in
    --timing) TIMING=1; shift ;;
    --presentmon) PRESENTMON=1; shift ;;
    --aftermath) AFTERMATH=1; shift ;;
    --warm) WARM=1; shift ;;
    --frames) FRAMES=$2; shift 2 ;;
    --keys) KEYS=$2; shift 2 ;;
    --console) CONSOLE=$2; shift 2 ;;
    --profile) PROFILE=$2; shift 2 ;;
    --copy-mode) COPY_MODE=$2; shift 2 ;;
    --loop-limit) LOOP_LIMIT=$2; shift 2 ;;
    --skip) SKIP=$2; shift 2 ;;
    --dump-targets) DUMP_TARGETS=1; shift ;;
    --heavy-seconds) HEAVY_SECONDS=$2; shift 2 ;;
    --tag) TAG=$2; shift 2 ;;
    --no-record) RECORD=0; shift ;;
    --volume) VOLUME=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

STAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR=$HERE/logs
LOG=$LOG_DIR/$STAMP-$TAG.log
CAPTURE=${CAPTURE:-/captures/$STAMP-$TAG}
mkdir -p "$LOG_DIR" "$CAPTURE"

BIN=${VICTORY_BIN:-$VICTORY_DIR/target/$PROFILE/victory.exe}
if [ ! -x "$BIN" ]; then
  echo "no $BIN — build it: (cd '$VICTORY_DIR' && cargo build --profile $PROFILE -p victory --features diagnostics)" >&2
  exit 2
fi

if [ -n "$HEAVY_SECONDS" ] && ! [[ "$HEAVY_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "--heavy-seconds needs a number, not '$HEAVY_SECONDS'" >&2
  exit 2
fi

ENV_ARGS=(VICTORY_LOG=info "VICTORY_WAVE64_EMULATE=emulate" "VICTORY_D3D12_DRED=1")
[ "$TIMING" = 1 ] && ENV_ARGS+=("VICTORY_GPU_TIMING=1")
ENV_ARGS+=("VICTORY_CAPTURE=$CAPTURE")
[ -n "$FRAMES" ] && ENV_ARGS+=("VICTORY_CAPTURE_FRAMES=$FRAMES")
[ -n "$KEYS" ] && ENV_ARGS+=("VICTORY_KEYS=$KEYS")
[ -n "$COPY_MODE" ] && ENV_ARGS+=("VICTORY_COPY_MODE=$COPY_MODE")
[ -n "$LOOP_LIMIT" ] && ENV_ARGS+=("VICTORY_SHADER_LOOP_LIMIT=$LOOP_LIMIT")
[ -n "$SKIP" ] && ENV_ARGS+=("VICTORY_SKIP_PIPELINES=$SKIP")
[ -n "$DUMP_TARGETS" ] && ENV_ARGS+=("VICTORY_DUMP_TARGETS=1")
# Aftermath (diag build, NVIDIA): the crash dump, its JSON and the shader debug info land in the capture folder.
# Markers are on with it: a hang run is for the dump, not for frame times.
if [ "$AFTERMATH" = 1 ]; then
  ROOT=$(cd "$HERE/.." && { pwd -W 2>/dev/null || pwd; })
  ENV_ARGS+=("VICTORY_AFTERMATH=$CAPTURE" "VICTORY_AFTERMATH_MARKERS=1"
    "VICTORY_AFTERMATH_DLL=${VICTORY_AFTERMATH_DLL:-$ROOT/tools/nsight-aftermath-sdk-2026.3/lib/x64}")
fi

echo "log:     $LOG"
echo "capture: $CAPTURE"
echo "profile: $PROFILE  console: $CONSOLE  timing: $TIMING  presentmon: $PRESENTMON"
echo

# The log starts with what the run was, one setting per line, so experiment-table.mjs can read it back.
{
  # The build line: a lane checkout's commit, or, for a snapshot build, the commit, branch and profile from
  # snapshot.txt beside VICTORY_BIN (build-line.mjs says why).
  node "$HERE/build-line.mjs" "$VICTORY_DIR" "${VICTORY_BIN:-}" "$PROFILE" "$CONSOLE"
  for E in "${ENV_ARGS[@]}"; do echo "harness env: $E"; done
  [ -n "${VICTORY_BIN:-}" ] && echo "harness env: VICTORY_BIN=$VICTORY_BIN"
  # A variable given on the command line (VICTORY_D3D12_DEBUG=1 ./run-world.sh) is passed through to the game
  # but is not in ENV_ARGS; record every other VICTORY_* variable too so the experiment table can tell runs apart.
  SET_NAMES=" VICTORY_BIN "
  for E in "${ENV_ARGS[@]}"; do SET_NAMES+="${E%%=*} "; done
  for NAME in $(compgen -e | sort); do
    case "$NAME" in VICTORY_*) ;; *) continue ;; esac
    case "$SET_NAMES" in *" $NAME "*) continue ;; esac
    echo "harness env: $NAME=${!NAME}"
  done
  echo "capture: $CAPTURE"
  if [ "$RECORD" = 1 ]; then echo "harness env: record=on"; else echo "harness env: record=off"; fi
  echo "harness env: volume=$VOLUME"
} >"$LOG"

# --warm: translate every shader into the cache this run reads, and make the shader pack's pipelines on this GPU,
# before the game starts (builds with upstream's warm-up only). The loop limit and the wave mode are part of a
# translation, so they are the run's own.
if [ "$WARM" = 1 ]; then
  WARM_ENV=(VICTORY_LOG=info "VICTORY_WAVE64_EMULATE=emulate")
  [ -n "$LOOP_LIMIT" ] && WARM_ENV+=("VICTORY_SHADER_LOOP_LIMIT=$LOOP_LIMIT")
  WARM_T0=$(date +%s)
  echo "warm-up: translate --cache --pipelines (log: $LOG.warm)"
  # The warm-up is raised as the game is: other lanes' compilers starve it at normal priority (852 s against
  # 682 s). The selection shares run-process.ps1's rules and matches only a victory.exe created after this
  # warm-up began whose command line has " translate " and "--cache", so it can never select a real game.
  ( sleep 4; RUN_WORLD_WARM_STARTED_EPOCH="$WARM_T0" \
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HERE/raise-priority.ps1" -Translate >&2 ) 2>&1 &
  WARM_RAISER=$!
  (cd "$VICTORY_DIR" && env "${WARM_ENV[@]}" "$BIN" translate --cache --pipelines "$(dirname "$GAME_EXE")") >"$LOG.warm" 2>&1
  WARM_RC=$?
  wait "$WARM_RAISER" 2>/dev/null
  echo "warm-up: exit=$WARM_RC after $(( $(date +%s) - WARM_T0 )) s"
fi

# PresentMon starts on its own when the heavy 3D scene begins, so it cannot miss the window.
PM_PID=""
if [ "$PRESENTMON" = 1 ]; then
  node "$HERE/presentmon.mjs" watch "$LOG" "$CAPTURE/presentmon.csv" &
  PM_PID=$!
fi

# The game is raised to above-normal priority so other lanes' compilers cannot starve its pipeline workers
# (raise-priority.ps1 says why, picks this run's process, and prints one line saying what it raised).
RUN_STARTED=$(date +%s)
( sleep 4; RUN_WORLD_GAME_EXE="$GAME_EXE" RUN_WORLD_STARTED_EPOCH="$RUN_STARTED"     powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HERE/raise-priority.ps1" >&2 ) 2>&1 &

# The game plays at 4% in Windows' mixer unless told otherwise (--volume N, or --volume off to leave it alone):
# the title is loud and the PC is streaming. set-volume.ps1 touches only this run's game, each audio session once.
if [ "$VOLUME" != off ]; then
  ( sleep 4; RUN_WORLD_GAME_EXE="$GAME_EXE" RUN_WORLD_STARTED_EPOCH="$RUN_STARTED"       powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HERE/set-volume.ps1" -Percent "$VOLUME" >>"$LOG" 2>&1 ) &
fi

# Every run records its own window at two frames a second, into its capture folder; --no-record turns it off.
# record-screen.mjs selects only this run's game (run-process.ps1 -Strict) and ends only its own ffmpeg child.
REC_PID=""
if [ "$RECORD" = 1 ]; then
  RUN_WORLD_GAME_EXE="$GAME_EXE" RUN_WORLD_STARTED_EPOCH="$RUN_STARTED" \
    node "$HERE/record-screen.mjs" "$CAPTURE/screen.mp4" >>"$LOG" 2>&1 &
  REC_PID=$!
fi

# --heavy-seconds: end the game N seconds after the first frame line that is heavy (draws + dropped >= 1000).
# It appends "harness: ended by --heavy-seconds ..." to the log before the summary below reads it.
HEAVY_PID=""
if [ -n "$HEAVY_SECONDS" ]; then
  RUN_WORLD_GAME_EXE="$GAME_EXE" RUN_WORLD_STARTED_EPOCH="$RUN_STARTED" \
    node "$HERE/heavy-watch.mjs" "$LOG" "$HEAVY_SECONDS" &
  HEAVY_PID=$!
fi

(cd "$VICTORY_DIR" && env "${ENV_ARGS[@]}" "$BIN" run "$GAME_EXE" --execute --console "$CONSOLE") \
  2>&1 | tee -a "$LOG"
RC=${PIPESTATUS[0]}  # victory.exe's own exit code; tee's would always be 0

# The watcher ends the game itself, so give it a moment to record that in the log before the summary.
if [ -n "$HEAVY_PID" ]; then
  for _ in $(seq 1 50); do
    kill -0 "$HEAVY_PID" 2>/dev/null || break
    sleep 0.1
  done
  kill -0 "$HEAVY_PID" 2>/dev/null && kill "$HEAVY_PID" 2>/dev/null
  wait "$HEAVY_PID" 2>/dev/null
fi

if [ -n "$PM_PID" ]; then
  kill -0 "$PM_PID" 2>/dev/null && kill "$PM_PID" 2>/dev/null
  wait "$PM_PID" 2>/dev/null
fi

# The recorder ends when the game process does; give it its clean stop (and its own last line) before the summary.
if [ -n "$REC_PID" ]; then
  for _ in $(seq 1 150); do
    kill -0 "$REC_PID" 2>/dev/null || break
    sleep 0.1
  done
  kill -0 "$REC_PID" 2>/dev/null && kill "$REC_PID" 2>/dev/null
  wait "$REC_PID" 2>/dev/null
fi
# The sheets are what an agent opens to review a run; a failure here never fails the run.
if [ "$RECORD" = 1 ] && [ -f "$CAPTURE/screen.mp4" ]; then
  node "$HERE/contact-sheets.mjs" "$CAPTURE/screen.mp4" >>"$LOG" 2>&1 || echo "contact sheets: failed" >&2
fi

# The driver's own account of a GPU fault is in the Windows System log; append it before the summary reads the log.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HERE/driver-events.ps1" "$RUN_STARTED" "$(date +%s)" 2>/dev/null >>"$LOG"

# The game's own exit code, before the parser reads the log: a non-zero code with no failure line is a run
# something else stopped, not a log that simply ends.
echo "harness: victory exit=$RC" >>"$LOG"

echo
node "$HERE/summarize-run.mjs" "$LOG" | tee "$LOG.md"
echo "victory exit=$RC"
exit "$RC"
