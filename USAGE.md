# Aurora 使用指南

## 功能概述

Aurora 是一个 Chrome 扩展,可以自动将您在 X.com 上点赞的帖子同步到 Liner 知识库。

## 安装步骤

1. 打开 Chrome 浏览器,访问 `chrome://extensions/`
2. 启用右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目的 `src/` 目录
5. 确认扩展已成功加载(查看扩展列表中是否出现 Aurora)

## 配置 Liner API Token

### 1. 获取 Liner API Token

⚠️ **注意**: 当前代码中使用的 Liner API 端点是假设的。实际使用时需要:
- 访问 Liner 官方网站获取 API 文档
- 在 Liner 设置中生成 API Token
- 更新 `src/shared/liner_api.js` 中的 API 端点

### 2. 在扩展中配置 Token

1. 点击浏览器工具栏中的 Aurora 图标
2. 点击"设置"按钮
3. 在输入框中粘贴您的 Liner API Token
4. 点击"保存 Token"
5. 等待验证完成,状态应显示"已连接到 Liner"

## 使用方法

### 自动同步

1. 访问 X.com 或 twitter.com
2. 浏览您感兴趣的帖子
3. 点击帖子下方的❤️(点赞)按钮
4. Aurora 会自动捕获并同步到 Liner

### 查看同步状态

1. 点击浏览器工具栏中的 Aurora 图标
2. 查看统计信息:
   - **今日同步**: 今天同步的帖子数量
   - **总计**: 总共同步的帖子数量
3. 查看"最近同步"列表,显示最近 5 条同步的帖子

### 手动同步队列

如果某些帖子同步失败(例如网络问题),它们会被加入队列:

1. 打开 Aurora 扩展 popup
2. 点击"手动同步队列"按钮
3. 等待同步完成

队列也会每 5 分钟自动重试一次。

## 工作原理

### 技术架构

```
┌─────────────────────────────────────────┐
│           X.com 页面环境                  │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │    page_script.js                │   │
│  │  - 监听点赞按钮点击                │   │
│  │  - 抓取贴文数据                    │   │
│  │  - MutationObserver 监听新内容     │   │
│  └──────────────┬───────────────────┘   │
│                 │ postMessage            │
│  ┌──────────────▼───────────────────┐   │
│  │    content_script.js             │   │
│  │  - 接收页面脚本消息                │   │
│  │  - 转发到后台服务                  │   │
│  └──────────────┬───────────────────┘   │
└─────────────────┼───────────────────────┘
                  │ chrome.runtime.sendMessage
┌─────────────────▼───────────────────────┐
│       Background Service Worker          │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │    service_worker.js             │   │
│  │  - 去重检查                        │   │
│  │  - 调用 Liner API                 │   │
│  │  - 队列管理与重试                  │   │
│  │  - 更新统计信息                    │   │
│  └──────────────┬───────────────────┘   │
│                 │                        │
│  ┌──────────────▼───────────────────┐   │
│  │    storage.js                    │   │
│  │  - 本地存储管理                    │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │    liner_api.js                  │   │
│  │  - Liner API 调用                 │   │
│  │  - 重试与错误处理                  │   │
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### 数据流

1. **点赞检测**:
   - `page_script.js` 监听页面上的点赞按钮点击
   - 使用 MutationObserver 监听新加载的内容
   - 定期扫描已点赞的贴文(fallback)

2. **数据提取**:
   - 作者信息(名字、handle)
   - 贴文正文
   - 时间戳
   - URL
   - 媒体(图片、视频链接)

3. **消息传递**:
   - Page Script → Content Script (postMessage)
   - Content Script → Background (chrome.runtime.sendMessage)

4. **后台处理**:
   - 检查是否已同步(去重)
   - 检查 Liner Token 是否配置
   - 调用 Liner API 同步
   - 更新本地存储和统计
   - 失败时加入重试队列

5. **存储**:
   - 已同步的推文 ID 列表
   - 同步统计信息
   - 最近同步的帖子(用于 popup 显示)
   - 失败重试队列

## 调试方法

### 查看日志

1. **页面脚本日志**:
   - 在 X.com 页面上按 F12 打开开发者工具
   - 切换到 Console 标签
   - 查找 `[Aurora Page Script]` 前缀的日志

2. **Content Script 日志**:
   - 同样在页面的 Console 中
   - 查找 `[Aurora Content Script]` 前缀的日志

3. **Background Service Worker 日志**:
   - 访问 `chrome://extensions/`
   - 找到 Aurora 扩展
   - 点击"service worker"链接
   - 查看日志输出

4. **Popup 日志**:
   - 右键点击扩展图标
   - 选择"检查弹出内容"
   - 查看 Console

### 常见问题排查

**问题: 点赞后没有同步**

1. 检查 page_script 是否正常运行:
   - 打开 X.com,按 F12,查看是否有 `[Aurora Page Script] Initialized successfully` 日志

2. 检查 content_script 是否接收到消息:
   - 查看是否有 `[Aurora Content Script] Received liked post from page script` 日志

3. 检查 background 是否处理:
   - 在 `chrome://extensions/` 中查看 service worker 日志
   - 查找是否有错误信息

**问题: Token 验证失败**

1. 确认 Token 格式正确
2. 检查网络连接
3. 查看 liner_api.js 中的 API 端点是否正确

**问题: 扩展图标无法加载**

- 确保 `src/assets/icons/` 目录存在且包含图标文件
- 图标文件需要是有效的 PNG 格式

## 限制与注意事项

⚠️ **重要提示**:

1. **X.com 结构变化**: X.com 的 DOM 结构可能随时更改,导致抓取失败
2. **速率限制**: 频繁调用 Liner API 可能触发速率限制
3. **仅供个人使用**: 此工具仅用于个人学习和研究,不建议大规模使用
4. **隐私**: 所有数据仅在本地和 Liner 之间传输,不会发送到其他服务器
5. **服务条款**: 使用此扩展可能违反 X.com 的服务条款,请谨慎使用

## 数据存储

所有数据使用 Chrome Storage API 存储在本地:

- **syncedTweets**: 已同步的推文 ID 列表
- **syncStats**: 同步统计信息
- **linerToken**: Liner API Token (加密存储)
- **recentPosts**: 最近同步的帖子(最多 10 条)
- **syncQueue**: 待重试的失败队列

可以在 `chrome://extensions/` → Aurora → 存储 中查看和清除数据。

## 后续改进方向

- [ ] 支持自定义标签
- [ ] 支持过滤特定作者
- [ ] 支持批量导入历史点赞
- [ ] 添加同步进度通知
- [ ] 支持自定义同步规则
- [ ] 优化 DOM 选择器,提高稳定性
- [ ] 添加国际化支持

## 支持

如有问题,请查看项目 README 或提交 Issue。
