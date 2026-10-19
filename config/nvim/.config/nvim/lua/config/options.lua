-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua

-- VS Code-like: absolute line numbers
vim.opt.relativenumber = false

-- Only run prettier when the project has its own prettier config
vim.g.lazyvim_prettier_needs_config = true
