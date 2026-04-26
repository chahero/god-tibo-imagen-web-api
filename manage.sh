#!/bin/sh
set -eu

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PID_FILE="$APP_DIR/server.pid"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"
ERROR_LOG="$LOG_DIR/error.log"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8787}"

cd "$APP_DIR"
mkdir -p "$LOG_DIR"

is_running() {
  [ -f "$PID_FILE" ] && PID="$(cat "$PID_FILE")" && [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1
}

install_dependencies() {
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    if [ -f "package-lock.json" ]; then
      npm ci
    else
      npm install
    fi
  fi
}

start() {
  if is_running; then
    PID="$(cat "$PID_FILE")"
    echo "Server is already running. PID: $PID"
    echo "Log: tail -f $LOG_FILE"
    exit 1
  fi

  if [ -f "$PID_FILE" ]; then
    echo "Removing stale PID file."
    rm -f "$PID_FILE"
  fi

  install_dependencies

  echo "Starting server..."
  nohup node src/cli/serve.js --host "$HOST" --port "$PORT" > "$LOG_FILE" 2> "$ERROR_LOG" &
  PID="$!"
  echo "$PID" > "$PID_FILE"

  echo "Server started. PID: $PID"
  echo "URL: http://$HOST:$PORT"
  echo "Log: tail -f $LOG_FILE"
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Server is not running."
    exit 1
  fi

  PID="$(cat "$PID_FILE")"
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping server. PID: $PID"
    kill "$PID"
    rm -f "$PID_FILE"
    echo "Server stopped."
  else
    echo "Process not found. Removing stale PID file."
    rm -f "$PID_FILE"
    exit 1
  fi
}

status() {
  if is_running; then
    PID="$(cat "$PID_FILE")"
    echo "Server is running. PID: $PID"
    echo "URL: http://$HOST:$PORT"
    echo ""
    echo "Recent logs:"
    tail -n 10 "$LOG_FILE" 2>/dev/null || true
  else
    echo "Server is not running."
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    exit 1
  fi
}

restart() {
  echo "Restarting server..."
  stop || true
  sleep 2
  start
}

case "${1:-}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    restart
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
