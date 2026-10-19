-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
--
-- VS Code-like layer on top of LazyVim defaults. Already provided by LazyVim:
--   <C-s> save, <A-j>/<A-k> move lines, <leader><space> find files,
--   <leader>/ grep, <leader>e explorer, <S-h>/<S-l> prev/next buffer
local map = vim.keymap.set

-- Ctrl+P: quick open
map("n", "<C-p>", "<leader><space>", { remap = true, desc = "Find Files (Root Dir)" })

-- Ctrl+/: toggle comment (terminals may send <C-_> instead of <C-/>)
for _, lhs in ipairs({ "<C-/>", "<C-_>" }) do
  map("n", lhs, "gcc", { remap = true, desc = "Toggle Comment" })
  map("x", lhs, "gc", { remap = true, desc = "Toggle Comment" })
end

-- Ctrl+`: toggle terminal (replaces LazyVim's <C-/>, now used for comments).
-- Same terminal as LazyVim's <leader>ft, so the root-dir terminal is shared.
map({ "n", "t" }, "<C-`>", function()
  Snacks.terminal.focus(nil, { cwd = LazyVim.root() })
end, { desc = "Toggle Terminal (Root Dir)" })
for _, lhs in ipairs({ "<C-/>", "<C-_>" }) do
  pcall(vim.keymap.del, "t", lhs)
end
