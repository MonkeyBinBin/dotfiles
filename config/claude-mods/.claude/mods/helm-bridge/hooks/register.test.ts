import { expect, test } from 'claude-code/testing'

import { kindOf, sosReason, stepOf } from './register'

test('a label carries the shape of a request, never the whole command', () => {
  expect(sosReason('Bash', { command: 'git push origin main --token=abc' })).toBe('Bash: git push')
  expect(sosReason('Bash', { command: 'mysql -pHunter2 db' })).toBe('Bash: mysql')
  expect(sosReason('Bash', { command: 'deploy s3cr3tToken' })).toBe('Bash: deploy')
  expect(sosReason('Bash', { command: 'git -c user.token=abc push' })).toBe('Bash: git')
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
const drained = () => new Promise(resolve => setTimeout(resolve, 20)) // nothing waits on the label queue, so a test has to

const asked = (command: string) => ({
  hook_event_name: 'PermissionRequest' as const,
  session_id: 's',
  transcript_path: '',
  cwd: '/',
  tool_name: 'Bash',
  tool_input: { command },
})

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
  await drained()
  expect(runs[0]).toEqual(['hc', 'label', 't9', 'cc.sos=Bash: git push'])

  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await drained()
  expect(labels(runs)).toEqual(['cc.sos=Bash: git push', 'cc.op=bash', 'cc.sos='])
})

test("a tool doesn't wait on a slow label", async ($, on) => {
  let isRunningLabel = false
  let release = () => {}
  on('env.get', () => ({ value: 't9' }))
  on('process.run', async () => {
    isRunningLabel = true
    await new Promise<void>(resolve => (release = resolve))
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await drained()
  expect(isRunningLabel).toBe(true)
  release()
})

test('three failures in parallel all count', async ($, on) => {
  const runs: string[][] = []
  on('env.get', () => ({ value: 't9' }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('tool.call', () => ({ result: {}, isError: true }))

  await Promise.all(['a', 'b', 'c'].map(command => $.tool.call({ tool: 'Bash', command })))
  await drained()
  expect(runs.flat()).toContain('cc.hull=3')
})

// Bash calls under way with these commands, held until `done`.
async function underway($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], commands: string[]) {
  const runs: string[][] = []
  const ids: Record<string, string> = {}
  let finish = () => {}
  const over = new Promise<void>(resolve => (finish = resolve))
  on('env.get', () => ({ value: 't9' }))
  on('clock.now', () => ({ value: 1000 }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', async (_, e) => {
    ids[(e as unknown as { command: string }).command] = e.tool_use_id
    await over
    return { result: {} }
  })
  on('ui.render', { component: 'ToolProgress' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return Text({ children: e.props.hint })
  })
  const running = commands.map(command => $.tool.call({ tool: 'Bash', command }))
  await drained()
  const pillUnder = async (command: string) => {
    await $.ui.mount({
      plugin: 'helm-bridge',
      surface: 'terminal',
      component: 'ToolProgress',
      requestId: ids[command]!,
      props: { tool_use_id: ids[command]!, kind: 'background_hint', hint: '(ctrl+b to run in background)' },
    })
    await drained()
  }
  return { runs, pillUnder, done: async () => (finish(), await Promise.all(running), await drained()) }
}

const sosLabels = (runs: string[][]) => runs.flat().filter(word => word.startsWith('cc.sos='))

test('an approved tool that runs on clears the alarm while it runs', async ($, on) => {
  const { runs, pillUnder, done } = await underway($, on, ['npm test'])
  await $.classic.PermissionRequest(asked('npm test'))
  await drained()
  await pillUnder('npm test')
  expect(sosLabels(runs)).toEqual(['cc.sos=Bash: npm test', 'cc.sos='])
  await done()
})

test("another call of the tool running on doesn't clear the prompted one's alarm", async ($, on) => {
  const { runs, pillUnder, done } = await underway($, on, ['ls', 'npm test'])
  await $.classic.PermissionRequest(asked('npm test'))
  await drained()
  await pillUnder('ls')
  expect(sosLabels(runs)).toEqual(['cc.sos=Bash: npm test'])
  await done()
})

test('overlapping prompts: answering one leaves the other up', async ($, on) => {
  const { runs, pillUnder, done } = await underway($, on, ['git push', 'npm test'])
  await $.classic.PermissionRequest(asked('git push'))
  await $.classic.PermissionRequest(asked('npm test'))
  await drained()
  await pillUnder('git push')
  expect(sosLabels(runs)).toEqual(['cc.sos=Bash: git push', 'cc.sos=Bash: npm test'])
  await pillUnder('npm test')
  expect(sosLabels(runs).at(-1)).toBe('cc.sos=')
  await done()
})

test('a failed label goes out again with the next one', async ($, on) => {
  const runs: string[][] = []
  on('env.get', () => ({ value: 't9' }))
  on('clock.now', () => ({ value: 1000 }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: runs.length === 1 ? 1 : 0, stdout: '', stderr: '' } }
  })
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', () => ({ result: {} }))

  await $.classic.PermissionRequest(asked('git push'))
  await drained()
  await $.tool.call({ tool: 'Read', file_path: '/a' })
  await drained()
  expect(runs[0]).toEqual(['hc', 'label', 't9', 'cc.sos=Bash: git push'])
  expect(runs[1]).toContain('cc.sos=Bash: git push')
  expect(runs[1]).toContain('cc.op=read')
})

test("a subagent's turn leaves the main loop's gauges alone", async ($, on) => {
  const runs: string[][] = []
  on('env.get', () => ({ value: 't9' }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('tool.call', () => ({ result: {}, isError: true }))
  on('turn.start', () => ({ turnId: 'sub' }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await drained()
  await $.turn.start({ text: 'go', turnId: 'sub', agentId: 'a1' } as never)
  await drained()
  expect(runs.flat()).toContain('cc.hull=1')
  expect(runs.flat()).not.toContain('cc.hull=')
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
