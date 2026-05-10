---
name: prompt-workflow-design
description: Prompt 與 workflow 設計指引，適用於撰寫 system prompt、CLAUDE.md、agent 工作流、自動化 pipeline、Cowork project 設定。觸發詞：prompt 設計、system prompt、CLAUDE.md、agent、workflow、自動化流程、Cowork。
---

# Prompt / Workflow 設計指引

複雜任務先給結構大綱，使用者確認方向後再展開細節。**不要一次倒整份成品**。

## 工作節奏

1. 先輸出：目標 / 角色 / 約束 / 輸出格式 的骨架
2. 等使用者確認方向或修正
3. 再展開實際 prompt 文字 / workflow 步驟

## 補充

- system prompt 結構偏好：identity → rules → task-specific → examples
- 推測時明確標註「以下為推測：」
- 避免一次給多個方向讓使用者挑 — 先給推薦版，標明取捨
