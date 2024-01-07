# Tmux 設定與使用

tmux 快捷鍵設定，詳細設定如下：

prefix: `Ctrl + e`

快捷鍵 | 說明
--- | ---
prefix + \ | 垂直分割視窗
prefix + - | 水平分割視窗
prefix + Ctrl + h | 變更視窗寬度(左)
prefix + Ctrl + j | 變更視窗高度(下)
prefix + Ctrl + k | 變更視窗高度(上)
prefix + Ctrl + l | 變更視窗寬度(右)

指令 | 說明
--- | ---
sts | 開啟新 Session

## 套用設定檔

切換目錄到下載的 tmux 資料夾，執行以下指令

```bash
ln -s $PWD/.tmux.conf ~/.tmux.conf
```

## 新增指令

開啟 ~/.zshrc，加入以下設定, 重新開啟終端機

```bash
[[ ! -f ~/.config/tmux/tmux.command.sh ]] || source ~/.config/tmux/tmux.command.sh
```
