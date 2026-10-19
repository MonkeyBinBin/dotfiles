-- Base markdownlint config shared by the linter and the --fix formatter
local config_args = { "--config", vim.fn.stdpath("config") .. "/lint/.markdownlint-cli2.yaml" }

return {
  {
    "mfussenegger/nvim-lint",
    opts = { linters = { ["markdownlint-cli2"] = { prepend_args = config_args } } },
  },
  {
    "stevearc/conform.nvim",
    opts = { formatters = { ["markdownlint-cli2"] = { prepend_args = config_args } } },
  },
}
