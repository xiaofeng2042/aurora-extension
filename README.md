# Aurora Chrome 扩展

Aurora 正在发展成为一个研究助手，它能够将您在 X.com 上喜欢的启发性帖子与您的 Liner 知识库保持同步。该扩展将监控新的点赞，捕获关键元数据，并将内容直接发送到 Liner，使您的阅读队列保持有序。

## 当前状态

- 带有轮换焦点提示的最小弹出界面（`src/popup.html`，`src/popup.js`）。
- Manifest v3 脚手架已准备好用于额外的后台脚本和权限（`src/manifest.json`）。
- `assets/icons/` 下的占位图标；发布前需替换。

## 计划工作流程

1. 对用户进行 X.com 身份验证以访问 `favorites/list`（点赞）端点。
2. 轮询或流式获取点赞的帖子，规范化标题、作者、URL 和时间戳。
3. 将每个点赞推送到 Liner API，并进行适当的速率限制和重试处理。
4. 在 Aurora 弹出窗口中显示同步活动，以便用户确认最近传输的帖子。

## 入门指南

1. 在基于 Chromium 的浏览器中打开 `chrome://extensions/`。
2. 启用**开发者模式**。
3. 点击**加载已解压的扩展程序**并选择仓库的 `src/` 目录。

## 开发说明

- 后台/服务工作者逻辑将位于 `src/background/`（待实现）。
- X.com 和 Liner 集成的共享帮助程序应添加到 `src/shared/` 下。
- 机密信息（API 令牌、cookies）应放在 gitignored 的 `.env.local` 中；在定义时在 `docs/configuration.md` 中记录所需的密钥。

## 路线图

- [ ] 构建 X.com 点赞的已认证客户端。
- [ ] 实现带有重试保障的 Liner API 包装器。
- [ ] 在本地保存同步状态以避免重复传输。
- [ ] 用同步洞察和手动重试控件替换弹出窗口占位符。
- [ ] 为 Aurora 设计独特的图标集。
