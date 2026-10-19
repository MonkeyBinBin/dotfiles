-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua

-- Markdown (prompts, CLAUDE.md): no format on save; use <leader>cf manually
vim.api.nvim_create_autocmd("FileType", {
  group = vim.api.nvim_create_augroup("markdown_no_autoformat", { clear = true }),
  pattern = { "markdown", "markdown.mdx" },
  callback = function(ev)
    vim.b[ev.buf].autoformat = false
  end,
})
