# 個人 dotfiles 儲存庫

這是一個儲存庫，用於存放和管理個人 macOS 作業系統的 dotfiles。dotfiles 是在 Unix-like 系統中，用於個人化設定的隱藏文件或目錄。

## 內容

目前包含以下的設定文件：

- tmux

## Oh my zsh 設定

### Plugins

#### git

```bash
plugins=(git)
```

#### zsh-autosuggestions

1.  Clone this repository into `$ZSH_CUSTOM/plugins` (by default `~/.oh-my-zsh/custom/plugins`)

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
```

2. Add the plugin to the list of plugins for Oh My Zsh to load (inside `~/.zshrc`):

```bash
plugins=(zsh-autosuggestions)
```

#### z

```bash
plugins=(z)
```

#### fzf-zsh-plugin

1. Clone this repository into `$ZSH_CUSTOM/plugins` (by default `~/.oh-my-zsh/custom/plugins`)

```bash
git clone --depth 1 https://github.com/unixorn/fzf-zsh-plugin.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-zsh-plugin
```

2. Add the plugin to the list of plugins for Oh My Zsh to load (inside `~/.zshrc`):

```bash
plugins=(fzf-zsh-plugin)
```

#### fig

```bash
plugins=(fig)
```

#### zsh-syntax-highlighting

1. install zsh-syntax-highlighting

```bash
brew install zsh-syntax-highlighting
```

2. Add the plugin to the list of plugins for Oh My Zsh to load (inside `~/.zshrc`):

```bash
plugins=([plugins...] zsh-syntax-highlighting)
```

### Alias

#### ls

安裝 exa

```bash
brew install exa
```

設定

Add the settings inside `~/.zshrc`:

```bash
alias ls=exa
```

#### cat

安裝 bat

```bash
brew install bat
```

設定

Add the settings inside `~/.zshrc`:

```bash
alias cat=bat
```

#### cdf

設定

Add the settings inside `~/.zshrc`:

```bash
if type fzf > /dev/null; then
  fzf_cd() {
    local dir
    dir=$(find -L . -type d 2> /dev/null | fzf +m) && cd "$dir"
  }

  alias cdf='fzf_cd'
fi
```

## GitHub copilot cli

### 安裝

```bash
brew install gh
```

### 登入 GitHub

```bash
gh auth login
```

### 安裝 GitHub copilot cli

```bash
gh extension install github/gh-copilot --force
```

### 設定 alias

Add the settings inside `~/.zshrc`:

```bash
alias '??'='gh copilot suggest -t shell'
alias 'git?'='gh copilot suggest -t git'
alias 'explain'='gh copilot explain'
```
