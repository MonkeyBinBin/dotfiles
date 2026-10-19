-- Banana: gruvbox.nvim retuned to a banana-yellow palette.
-- Accent hues match cmux's sidebar tint (#D4A017 / #B8860B / #E6C65B).
local c = {
  bg = "#1E1C17",
  bg1 = "#2A271F",
  bg2 = "#3A3529",
  bg3 = "#4D4636",
  fg = "#E8E2D0",
  muted = "#7A7362",
  banana = "#D4A017", -- primary
  banana_light = "#E6C65B",
  banana_dark = "#B8860B",
  banana_dim = "#4A3F1C", -- selection
  olive = "#A3B86C",
  brick = "#D0664A",
  orange = "#E09A3E",
}

local function lualine_mode(accent)
  return {
    a = { bg = accent, fg = c.bg, gui = "bold" },
    b = { bg = c.bg2, fg = c.fg },
    c = { bg = c.bg1, fg = c.muted },
  }
end

return {
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000,
    opts = {
      palette_overrides = {
        dark0 = c.bg,
        dark1 = c.bg1,
        dark2 = c.bg2,
        dark3 = c.bg3,
        dark4 = c.muted,
        light1 = c.fg,
        gray = c.muted,
        bright_yellow = c.banana_light,
        neutral_yellow = c.banana,
        bright_green = c.olive,
        bright_red = c.brick,
        bright_orange = c.orange,
      },
      overrides = {
        Statement = { fg = c.banana },
        Conditional = { fg = c.banana },
        Repeat = { fg = c.banana },
        Label = { fg = c.banana },
        Exception = { fg = c.banana },
        Keyword = { fg = c.banana, italic = true },
        Function = { fg = c.banana_light, bold = true },
        Type = { fg = c.banana_dark },
        CursorLineNr = { fg = c.banana, bg = c.bg1, bold = true },
        Visual = { bg = c.banana_dim },
        WinSeparator = { fg = c.bg3 },
        SnacksPickerPrompt = { fg = c.banana },
      },
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      opts.options.theme = {
        normal = lualine_mode(c.banana),
        insert = lualine_mode(c.olive),
        visual = lualine_mode(c.banana_light),
        replace = lualine_mode(c.brick),
        command = lualine_mode(c.orange),
        inactive = lualine_mode(c.bg2),
      }
    end,
  },
  { "LazyVim/LazyVim", opts = { colorscheme = "gruvbox" } },
}
