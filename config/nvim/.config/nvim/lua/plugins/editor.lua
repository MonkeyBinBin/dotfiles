return {
  -- VS Code-like multi-cursor: <C-n> selects the word and adds the next match
  {
    "mg979/vim-visual-multi",
    keys = { { "<C-n>", mode = { "n", "x" }, desc = "Multi-cursor: Add Next Match" } },
    init = function()
      -- keep LazyVim's <C-Up>/<C-Down> window resize
      vim.g.VM_default_mappings = 0
      vim.g.VM_maps = { ["Find Under"] = "<C-n>", ["Find Subword Under"] = "<C-n>" }
    end,
  },
}
