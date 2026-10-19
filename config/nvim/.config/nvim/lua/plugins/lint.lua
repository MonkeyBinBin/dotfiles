-- Basic checks for common file types not covered by LazyVim extras.
-- Anything without an entry here (or in an extra) gets no LSP/linter and edits as plain text.
return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        bashls = {}, -- sh/bash; runs shellcheck when installed
        cssls = {}, -- css/scss/less
        html = {},
      },
    },
  },
  {
    "mason-org/mason.nvim",
    opts = { ensure_installed = { "shellcheck", "htmlhint" } },
  },
  {
    "mfussenegger/nvim-lint",
    opts = {
      linters_by_ft = {
        zsh = { "zsh" }, -- syntax check only (zsh -n); shellcheck doesn't support zsh
        html = { "htmlhint" }, -- html-lsp does not validate markup structure
      },
    },
  },
}
