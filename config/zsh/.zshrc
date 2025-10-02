#!/usr/bin/env zsh

# Minimal .zshrc: set config directory and source files in zshrc.d in lexicographic order.
# This file is intentionally small — per-repo zsh files live in the same directory as this file.

# Determine the directory containing this .zshrc (works when the file is sourced)
if [[ -z ${ZSH_CONFIG_DIR:-} ]]; then
	# 偵測並解析被 source 的腳本檔（支援 symlink）
	script=${(%):-%N}

	# 如果是相對路徑，先轉成絕對路徑（相對於當前工作目錄）
	if [[ $script != /* ]]; then
	  script="$PWD/$script"
	fi

	# 反覆解析 symlink（readlink 會回傳相對或絕對的目標）
	while [ -L "$script" ]; do
	  link=$(readlink "$script")
	  if [[ $link == /* ]]; then
	    script="$link"
	  else
	    script="$(dirname "$script")/$link"
	  fi
	done

	# 最終把目錄設成實際檔案的父目錄（使用 pwd -P 取得實體路徑）
	ZSH_CONFIG_DIR="$(cd "$(dirname "$script")" >/dev/null 2>&1 && pwd -P)"
fi

# Source each .zsh file in zshrc.d in order. Skip if no files found.
for _f in "${ZSH_CONFIG_DIR}/zshrc.d"/*.zsh; do
	[[ -e $_f ]] || continue
	source "$_f"
done

unset _f
