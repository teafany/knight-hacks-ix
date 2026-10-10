import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const windows = process.platform === 'win32'
const python = join(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python')
const vite = join(root, 'frontend/node_modules/vite/bin/vite.js')

if (!existsSync(python) || !existsSync(vite)) {
  console.error('Install dependencies first:')
  console.error('  python3 -m venv .venv')
  console.error('  .venv/bin/python -m pip install -r server/requirements.txt')
  console.error('  npm ci --prefix frontend')
  process.exit(1)
}

const children = []
let stopping = false
let killTimer

function signalChild(child, signal) {
  if (!child.pid) return
  try {
    // Django's autoreloader runs a child process. Signal the whole owned group.
    if (windows) child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(error.message)
  }
}

function stop(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) signalChild(child, 'SIGTERM')
  killTimer = setTimeout(() => {
    for (const child of children) signalChild(child, 'SIGKILL')
  }, 5000)
  killTimer.unref()
}

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', detached: !windows })
  children.push(child)
  child.on('error', error => {
    console.error(`${name} failed to start: ${error.message}`)
    stop(1)
  })
  child.on('close', code => {
    if (!stopping) {
      console.error(`${name} stopped; shutting down both servers.`)
      stop(code ?? 1)
    }
    if (children.every(process => process.exitCode !== null || process.signalCode !== null)) {
      clearTimeout(killTimer)
    }
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

console.log('Starting dashboard at http://localhost:5173 and Django at http://127.0.0.1:8000')
console.log('Press Ctrl+C to stop both servers.')
start('Django', python, ['server/manage.py', 'runserver', '127.0.0.1:8000', ...(windows ? ['--noreload'] : [])], root)
start('Frontend', process.execPath, [vite, '--host', '127.0.0.1'], join(root, 'frontend'))
