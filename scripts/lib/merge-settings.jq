# 合併 AI CLI settings.json：以 example 為「dotfiles 提供」內容，與本機既有設定智慧合併
# 用法：jq --slurpfile ex example.json -f merge-settings.jq user.json
#
# 規則：
# - env：example 的 key 覆蓋 user（recursive merge），其餘保留
# - permissions.allow / permissions.deny：取聯集去重，使用者自訂條目保留
# - hooks：對每個事件以 hook command 字串為冪等鍵，example 條目若 user 已有則跳過，否則 append
# - example 沒有的頂層 key（如 plugins、mcpServers）一律不動

# 保留 user 原順序，將 example 中尚未出現的條目依序 append 到尾端
def union_arrays($a; $b):
  ($a // []) as $a
  | ($b // []) as $b
  | $a + ($b | map(select(. as $x | $a | index($x) | not)));

def merge_hook_event($u; $e):
  ($u // []) as $u
  | ($e // []) as $e
  | ($u | map(.hooks // [] | map(.command)) | flatten) as $ucmds
  | $u + ($e | map(
      . as $entry
      | ($entry.hooks // [] | map(.command)) as $cmds
      | if any($cmds[]; . as $c | $ucmds | index($c)) then empty else $entry end
    ));

def merge_hooks($u; $e):
  reduce ($e // {} | to_entries[]) as $kv
    ($u // {}; .[$kv.key] = merge_hook_event(.[$kv.key]; $kv.value));

. as $user
| $ex[0] as $example
| (if $example.env then .env = (($user.env // {}) * $example.env) else . end)
| (if $example.permissions.allow
     then .permissions.allow = union_arrays($user.permissions.allow; $example.permissions.allow)
     else . end)
| (if $example.permissions.deny
     then .permissions.deny = union_arrays($user.permissions.deny; $example.permissions.deny)
     else . end)
| (if $example.hooks then .hooks = merge_hooks($user.hooks; $example.hooks) else . end)
