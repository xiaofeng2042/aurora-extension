# 防重复同步功能测试文档

## 功能概述

本次实现了一套完整的防重复同步策略，避免已点赞的历史帖子被重复同步到 Linear。

## 核心功能

### 1. 安装时间戳记录
- **位置**: `src/shared/storage.js:getInstallTimestamp()`
- **功能**: 记录扩展首次安装的时间戳，用于区分历史推文和新推文
- **默认行为**: 首次调用时自动生成并永久存储

### 2. 配置管理系统
- **位置**: `src/shared/storage.js:getConfig()`, `setConfig()`
- **默认配置**:
  ```javascript
  {
    syncHistoricalLikes: false,  // 默认不同步历史点赞
    maxSyncedTweetsCache: 1000,  // 最多缓存1000条同步记录
    cleanupDays: 30,              // 清理周期
    enableNotifications: true     // 启用通知
  }
  ```

### 3. 历史推文检测
- **位置**: `src/shared/storage.js:isHistoricalTweet()`
- **逻辑**: 比较推文时间戳与安装时间戳
- **返回**: 如果推文发布时间 < 安装时间，则为历史推文

### 4. 页面扫描控制
- **位置**: `src/page/page_script.js:scanExistingLikes()`
- **行为**:
  - 页面加载时检查配置
  - 如果 `syncHistoricalLikes === false`，跳过扫描
  - 如果 `syncHistoricalLikes === true`，执行扫描并检查每个推文是否历史推文

### 5. LRU缓存清理
- **位置**: `src/shared/storage.js:cleanupSyncedTweets()`
- **策略**: 当同步记录超过1000条时，保留最近同步的记录，删除旧记录
- **目的**: 防止存储溢出

## 用户界面

### 设置面板新增项 (`src/popup.html`)

1. **同步历史点赞开关**
   - 元素ID: `syncHistoricalLikes`
   - 类型: checkbox
   - 默认: 未选中
   - 说明: 启用后会尝试同步扩展安装前的所有点赞

2. **状态指示器**
   - 元素ID: `historicalLikesStatus`
   - 显示: "已启用" / "已禁用"

3. **同步当前页面按钮**
   - 元素ID: `syncCurrentPageBtn`
   - 功能: 手动触发当前页面的点赞扫描
   - 用途: 用户想要同步特定页面的历史点赞

4. **清除同步记录按钮**
   - 元素ID: `clearHistoryBtn`
   - 功能: 清除所有同步记录并重置安装时间戳
   - 确认: 需要用户确认操作

## 测试步骤

### 测试1: 默认行为（不同步历史点赞）

**目标**: 验证扩展默认不同步历史点赞

**步骤**:
1. 重新加载扩展：
   - 打开 `chrome://extensions/`
   - 点击 Aurora 的刷新按钮
2. 打开扩展 popup
3. 检查设置面板中"同步历史点赞"复选框状态
   - **预期**: 未选中
   - **预期**: 状态显示"已禁用"
4. 访问 X.com 任意页面（如首页）
5. 打开浏览器开发者控制台 (F12)
6. 查找日志:
   ```
   [Aurora Page Script] 历史点赞扫描已禁用，跳过扫描
   [Aurora Page Script] 配置不允许扫描历史点赞，跳过
   ```
   - **预期**: 应该看到这些日志
7. 打开 popup 的调试面板
   - **预期**: 今日同步数为 0

**结果**: ✅/❌

---

### 测试2: 新点赞实时同步

**目标**: 验证新点赞可以正常同步（不受历史设置影响）

**前置条件**:
- Linear API Token 已配置
- Linear Team ID 已配置

**步骤**:
1. 访问 X.com
2. 找到一条未点赞的推文
3. 点击点赞按钮（❤️）
4. 检查浏览器控制台日志:
   ```
   [Aurora Page Script] 检测到点赞按钮点击
   [Aurora Page Script] 确认点赞状态，开始提取贴文数据
   [Aurora Page Script] 成功提取贴文数据: [tweet_id]
   [Aurora Background] Handling new liked post: [tweet_id]
   ```
5. 打开 popup
   - **预期**: "今日同步" 计数 +1
   - **预期**: "最近同步" 列表显示新同步的推文
6. 检查 Linear
   - **预期**: 创建了对应的 Issue

**结果**: ✅/❌

---

### 测试3: 启用历史同步

**目标**: 验证启用历史同步后可以扫描页面上的已点赞推文

**步骤**:
1. 打开 popup
2. 点击"设置"按钮
3. 勾选"同步历史点赞"复选框
4. 检查状态指示器
   - **预期**: 显示"已启用"
5. 打开浏览器控制台
6. 检查日志:
   ```
   [Aurora Background] Config updated: {syncHistoricalLikes: true, ...}
   ```
7. 刷新 X.com 页面
8. 检查控制台日志:
   ```
   [Aurora Page Script] 历史点赞扫描已启用
   [Aurora Page Script] 开始扫描现有点赞贴文
   [Aurora Page Script] 找到 X 个 unlike 按钮
   ```
9. 等待扫描完成
10. 打开 popup
    - **预期**: 同步统计增加
    - **预期**: 最近同步列表显示扫描到的推文

**结果**: ✅/❌

---

### 测试4: 手动同步当前页面

**目标**: 验证手动同步按钮可以触发页面扫描

**前置条件**: "同步历史点赞" 已启用

**步骤**:
1. 访问 X.com（如用户的点赞列表页面）
2. 打开 popup
3. 点击"设置"按钮展开设置面板
4. 点击"同步当前页面"按钮
5. 检查按钮文本变化:
   - **预期**: "同步中..." → "同步完成 ✓"
6. 检查浏览器控制台日志:
   ```
   [Aurora Page Script] 开始扫描现有点赞贴文
   ```
7. 打开 popup 调试面板
   - **预期**: 看到"当前页面同步触发成功"日志

**结果**: ✅/❌

---

### 测试5: 清除同步记录

**目标**: 验证清除同步记录功能

**步骤**:
1. 确保已有一些同步记录（今日同步 > 0）
2. 打开 popup → 设置
3. 点击"清除同步记录"按钮
4. 确认对话框
   - **预期**: 显示警告信息
   - 内容: "确定要清除所有同步记录吗？这将删除已同步的推文记录，但不会删除 Linear 中已创建的 Issue。"
5. 点击"确定"
6. 检查 popup:
   - **预期**: 今日同步 = 0
   - **预期**: 总计 = 0
   - **预期**: 最近同步列表清空
7. 检查调试面板:
   ```
   同步记录清除成功
   ```
8. 重新点赞一条之前同步过的推文
   - **预期**: 会再次同步（因为记录已清除）

**结果**: ✅/❌

---

### 测试6: LRU缓存清理

**目标**: 验证当同步记录超过1000条时自动清理

**说明**: 此测试较难执行（需要1000+条记录），可以通过修改代码临时降低阈值测试

**步骤** (可选):
1. 修改 `src/shared/storage.js` 中 `maxSyncedTweetsCache` 默认值为 `10`
2. 同步超过10条推文
3. 检查存储:
   ```javascript
   chrome.storage.local.get('syncedTweets', (result) => {
     console.log(result.syncedTweets.length); // 应该 <= 10
   });
   ```
4. 恢复配置默认值

**结果**: ✅/❌

---

### 测试7: 防重复同步验证

**目标**: 验证同一推文不会被重复同步

**步骤**:
1. 点赞一条推文 A
2. 等待同步完成（检查 popup 统计）
3. 取消点赞推文 A
4. 再次点赞推文 A
5. 检查控制台日志:
   ```
   [Aurora Background] Tweet already synced, skipping: [tweet_id]
   ```
6. 检查 popup:
   - **预期**: 同步计数不变（没有重复同步）
7. 检查 Linear:
   - **预期**: 只有一个 Issue，没有重复

**结果**: ✅/❌

---

## 调试技巧

### 查看扩展存储内容
```javascript
// 在浏览器控制台执行
chrome.storage.local.get(null, (data) => {
  console.log('所有存储数据:', data);
});

// 查看配置
chrome.storage.local.get('auroraConfig', (data) => {
  console.log('配置:', data.auroraConfig);
});

// 查看安装时间戳
chrome.storage.local.get('installTimestamp', (data) => {
  console.log('安装时间:', new Date(data.installTimestamp));
});

// 查看已同步推文列表
chrome.storage.local.get('syncedTweets', (data) => {
  console.log('已同步推文数:', data.syncedTweets?.length);
  console.log('推文IDs:', data.syncedTweets);
});
```

### 重置扩展状态
```javascript
// 清除所有存储（谨慎使用）
chrome.storage.local.clear(() => {
  console.log('存储已清空');
});
```

### 手动触发配置更新
```javascript
// 在 popup 控制台执行
chrome.runtime.sendMessage({
  type: "SET_CONFIG",
  config: { syncHistoricalLikes: true }
}, (response) => {
  console.log('配置更新结果:', response);
});
```

## 预期行为总结

| 场景 | syncHistoricalLikes | 行为 |
|------|---------------------|------|
| 首次安装，访问X.com | false (默认) | 不扫描页面上的已点赞推文 |
| 首次安装，点击新点赞 | false (默认) | 立即同步（不受设置影响） |
| 启用历史同步后访问页面 | true | 扫描并同步页面上的已点赞推文 |
| 手动点击"同步当前页面" | true | 触发当前页面扫描 |
| 手动点击"同步当前页面" | false | 不执行扫描（配置不允许） |
| 已同步的推文再次点赞 | 任意 | 跳过同步（已存在记录） |
| 清除同步记录后 | 任意 | 所有推文视为未同步 |

## 已知限制

1. **时间戳精度**: 使用安装时间作为分界点，如果用户在安装后立即点赞历史推文，可能被误判为新推文
2. **无法追溯取消点赞**: 如果用户取消点赞，Linear 中的 Issue 不会被删除
3. **页面加载时机**: 如果页面加载太快，可能错过一些已渲染的点赞按钮
4. **跨设备同步**: 不同设备上的扩展有独立的安装时间戳和同步记录

## 测试检查清单

- [ ] 测试1: 默认行为（不同步历史点赞）
- [ ] 测试2: 新点赞实时同步
- [ ] 测试3: 启用历史同步
- [ ] 测试4: 手动同步当前页面
- [ ] 测试5: 清除同步记录
- [ ] 测试6: LRU缓存清理（可选）
- [ ] 测试7: 防重复同步验证

## 回归测试清单

确保新功能不影响现有功能：

- [ ] Linear API 连接正常
- [ ] 团队选择功能正常
- [ ] 手动同步队列功能正常
- [ ] 统计数据显示正常
- [ ] 最近同步列表显示正常
- [ ] 调试面板功能正常

## 问题报告模板

如果测试失败，请记录以下信息：

```
### 问题描述
[简要描述问题]

### 测试场景
[哪个测试步骤]

### 预期行为
[应该发生什么]

### 实际行为
[实际发生了什么]

### 控制台日志
```
[粘贴相关日志]
```

### 存储状态
```javascript
[粘贴 chrome.storage.local.get 的输出]
```

### 环境信息
- Chrome 版本: [版本号]
- 扩展版本: [版本号]
- 操作系统: [OS]
- X.com 页面: [URL]
```

## 下一步

测试完成后，可以考虑：

1. **性能优化**:
   - 减少存储读写频率
   - 优化页面扫描算法

2. **功能增强**:
   - 添加同步进度显示
   - 支持选择性同步（只同步特定作者的推文）
   - 添加同步历史查看界面

3. **用户体验**:
   - 改进通知样式
   - 添加同步统计图表
   - 提供导出同步记录功能
