import { expect, test } from 'claude-code/testing'

import { kindOf, sosReason, stepOf } from './register'

test('a label carries the shape of a request, never the whole command', () => {
  expect(sosReason('Bash', { command: 'git push origin main --token=abc' })).toBe('Bash: git push')
  expect(sosReason('Bash', { command: 'TOKEN=abc curl https://x' })).toBe('Bash')
  expect(sosReason('Bash', { command: 'curl https://user:pw@x' })).toBe('Bash: curl')
  expect(sosReason('Edit', { file_path: '/a/b/state.js' })).toBe('Edit: state.js')
  expect(sosReason('WebFetch', { url: 'https://user:pw@example.com/a?k=1' })).toBe('WebFetch: example.com')
  expect(sosReason('mcp__linear__save_issue', {})).toBe('linear:save_issue')
})

test('kinds of work and steps of a gauge', () => {
  expect(['Edit', 'Bash', 'Grep', 'WebFetch', 'Agent', 'mcp__x__y'].map(kindOf)).toEqual(['edit', 'bash', 'read', 'web', 'agent', 'gear'])
  expect(stepOf(84)).toBe(80)
})

const labels = (argv: readonly string[][]) => argv.map(a => a[3])

test('a prompted tool raises the label, and its call being over clears it', async ($, on) => {
  const runs: string[][] = []
  on('env.get', () => ({ value: 't9' }))
  on('clock.now', () => ({ value: 1000 }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', () => ({ result: {} }))

  await $.classic.PermissionRequest({
    hook_event_name: 'PermissionRequest',
    session_id: 's',
    transcript_path: '',
    cwd: '/',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main' },
  })
  expect(runs[0]).toEqual(['hc', 'label', 't9', 'cc.sos=Bash: git push'])

  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(labels(runs)).toEqual(['cc.sos=Bash: git push', 'cc.op=bash', 'cc.sos='])
})

test('outside Herdr nothing runs', async ($, on) => {
  const runs: string[][] = []
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('classic.PermissionRequest', () => ({}))

  await $.classic.PermissionRequest({
    hook_event_name: 'PermissionRequest',
    session_id: 's',
    transcript_path: '',
    cwd: '/',
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  })
  expect(runs).toEqual([])
})
