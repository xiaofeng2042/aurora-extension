# 扩展上下文失效修复测试文档

## 修复概述

已完成对 "Extension context invalidated" 错误的全面修复，包括：

### 1. 核心修复内容

#### ✅ **运行时验证工具函数**
在所有文件中添加了 `isRuntimeValid()` 和 `sendMessageSafely()` 函数：

**`shared/storage.js`**:
```javascript
isRuntimeValid() // 检查 chrome.runtime.id 是否存在
sendMessageSafely(message, retries = 3) // 带重试的安全消息发送
sleep(ms) // 延迟函数
```

**`content/content_script.js`**: 独立的运行时验证（无法导入其他文件）
**`page/page_script.js`**: 独立的运行时验证
**`popup.js`**: 独立的运行时验证

#### ✅ **批处理和限流机制**
**`page/page_script.js`** 中的 `scanExistingLikes()` 函数：
- **批处理**: 每批5个推文，避免大量并发调用
- **批次延迟**: 批次间等待2秒
- **推文延迟**: 批次内每个推文间隔500ms
- **实时验证**: 每个批次前检查运行时上下文

#### ✅ **增强的错误处理**
**`content/content_script.js`**:
- 替换 `chrome.runtime.sendMessage` 为 `sendMessageSafely`
- 添加用户友好的错误通知（页面右上角显示红色提示框）
- 自动5秒后移除提示

**`popup.js`**:
- 关键函数使用 `sendMessageSafely`
- `loadStats()` 添加上下文失效检测
- `syncCurrentPage()` 添加运行时验证
- `clearSyncHistory()` 添加运行时验证

**`page/page_script.js`**:
- `shouldScanHistoricalLikes()` 添加运行时验证
- `checkAndSendHistoricalTweet()` 添加运行时验证
- 批处理中实时检查上下文有效性

### 2. 修复的具体错误场景

#### 🎯 **场景1: 扩展重载后历史点赞扫描**
- **之前**: 大量 `chrome.runtime.sendMessage` 调用全部失败，抛出 "Extension context invalidated"
- **现在**:
  1. 先检查运行时上下文
  2. 批处理限制并发调用
  3. 指数退避重试机制
  4. 实时上下文验证

#### 🎯 **场景2: Content Script 消息发送失败**
- **之前**: 第52行 `chrome.runtime.sendMessage` 调用直接抛出错误
- **现在**:
  1. 使用 `sendMessageSafely` 重试机制
  2. 用户友好的页面通知
  3. 建议用户刷新页面

#### 🎯 **场景3: Popup 功能失效**
- **之前**: 各种功能调用时静默失败
- **现在**:
  1. 实时运行时验证
  2. 状态指示器显示错误
  3. 用户明确指导

### 3. 批处理逻辑详解

#### **历史扫描批处理流程**:
```
开始扫描
    ↓
收集所有推文数据 (避免DOM查询重复)
    ↓
分批处理 (每批5个推文)
    ↓
检查运行时上下文 ✅ → 处理当前批次
    ↓                     ↓
失败 → 停止扫描          推文1 → 推文2 → 推文3 → 推文4 → 推文5 (间隔500ms)
    ↓                     ↓
结束                 等待2秒 → 下一批次 (如果有的话)
```

#### **优势**:
1. **减少并发压力**: 不会瞬间发送大量消息
2. **实时错误检测**: 每个批次都检查上下文
3. **优雅降级**: 发现错误立即停止，不影响后续功能
4. **用户体验**: 有序处理，避免页面卡顿

### 4. 错误处理策略

#### **重试策略**:
```javascript
// 指数退避: 1秒 → 2秒 → 4秒
// 最多重试3次
async function sendMessageSafely(message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    if (!isRuntimeValid()) {
      await sleep(1000 * Math.pow(2, i)); // 指数退避
      continue;
    }
    // 尝试发送消息...
  }
}
```

#### **用户通知策略**:
- **页面内通知**: Content Script 在页面右上角显示红色提示框
- **Popup 状态**: 状态指示器显示 "扩展错误"
- **调试日志**: 详细记录错误和重试过程

## 测试步骤

### 🧪 **测试1: 基础上下文验证**

**目的**: 验证扩展能正常检测运行时上下文

**步骤**:
1. 确保扩展已加载
2. 打开 popup
3. 检查控制台是否有 "Extension context invalid" 相关日志
4. 验证统计数据正常显示

**预期**: ✅ 无错误，正常显示统计数据

---

### 🧪 **测试2: 扩展重载后行为**

**目的**: 验证扩展重载后的行为改进

**步骤**:
1. 访问 X.com 页面
2. 打开浏览器控制台
3. 在 `chrome://extensions/` 页面刷新 Aurora 扩展
4. 观察控制台日志

**预期**: ✅ 不再出现大量 "Extension context invalidated" 错误
**预期**: ✅ 应该看到 "Extension context invalid, retry attempt X/3" 日志

---

### 🧪 **测试3: 历史点赞扫描稳定性**

**目的**: 验证启用历史同步后的稳定性

**步骤**:
1. 打开 popup 设置
2. 勾选 "同步历史点赞"
3. 访问有大量点赞的 X.com 页面
4. 观察控制台批处理日志

**预期**: ✅ 看到 "处理第 X/Y 批次" 日志
**预期**: ✅ 批次间有合理延迟
**预期**: ✅ 不会瞬间发送大量消息

---

### 🧪 **测试4: 错误恢复能力**

**目的**: 验证错误处理和用户提示

**步骤**:
1. 访问 X.com 页面
2. 打开 popup
3. 在 `chrome://extensions/` 禁用并重新启用扩展
4. 尝试点击 "同步当前页面" 按钮

**预期**: ✅ 显示 "扩展需要重新加载，请刷新页面后重试" 提示
**预期**: ✅ 页面右上角显示红色通知框

---

### 🧪 **测试5: 新点赞正常功能**

**目的**: 确保修复不影响正常功能

**前置条件**: 已配置 Linear Token 和 Team ID

**步骤**:
1. 访问 X.com
2. 找到未点赞的推文
3. 点击点赞按钮
4. 检查 popup 统计变化
5. 检查 Linear 是否创建 Issue

**预期**: ✅ 新点赞正常同步到 Linear
**预期**: ✅ 统计数据正确更新

## 验证脚本

可以创建一个简单的测试脚本验证修复效果：

```javascript
// 在 X.com 页面控制台执行
console.log("=== Aurora 扩展测试 ===");

// 1. 检查页面脚本是否加载
if (window.auroraPageScript) {
  console.log("✅ Page Script 已加载");

  // 2. 检查运行时验证
  if (window.auroraPageScript.isRuntimeValid) {
    console.log("✅ 运行时验证函数可用");
  }

  // 3. 测试历史扫描（确保先启用配置）
  console.log("测试历史扫描...");
  window.auroraPageScript.scanExistingLikes();
} else {
  console.log("❌ Page Script 未加载");
}

// 4. 检查 Content Script
if (window.postMessage) {
  console.log("✅ Content Script 应该可用");
}
```

## 性能影响评估

### ✅ **正面影响**:
1. **减少错误频率**: 大幅减少 "Extension context invalidated" 错误
2. **改善用户体验**: 错误时提供明确指导
3. **提高稳定性**: 批处理避免瞬间大量调用
4. **自动恢复**: 重试机制提高成功率

### ⚠️ **潜在影响**:
1. **延迟增加**: 历史扫描可能需要更长时间（由于批处理）
2. **重试开销**: 失败时会有额外重试调用
3. **内存使用**: 更多错误处理代码

### 📊 **权衡**:
- **稳定性 > 速度**: 确保功能正常工作比速度更重要
- **用户体验 > 性能**: 提供清晰错误信息比隐藏错误更好
- **可靠性 > 效率**: 自动重试比一次失败更可靠

## 监控建议

在生产环境中，建议监控以下指标：

1. **错误频率**: "Extension context invalidated" 出现次数
2. **重试成功率**: 重试后成功的消息比例
3. **批处理性能**: 历史扫描的处理时间
4. **用户反馈**: 错误通知的有效性

## 故障排除

### **如果仍有错误**:
1. 检查扩展版本是否为最新
2. 清除浏览器缓存和扩展数据
3. 完全重新安装扩展
4. 检查 Chrome 版本兼容性

### **如果性能问题**:
1. 可以调整批处理大小（BATCH_SIZE）
2. 可以调整延迟时间（BATCH_DELAY）
3. 可以减少重试次数

### **如果功能不正常**:
1. 检查控制台日志中的详细错误
2. 验证所有文件是否正确更新
3. 确保 chrome.runtime.sendMessage 调用已正确替换

## 总结

通过实施运行时验证、批处理、重试机制和用户友好的错误处理，显著改善了扩展的稳定性和用户体验。修复后的扩展能够：

- ✅ 优雅处理扩展重载场景
- ✅ 减少历史扫描时的错误频率
- ✅ 提供清晰的用户错误指导
- ✅ 保持核心功能的正常工作
- ✅ 自动恢复临时性错误

这应该能彻底解决 "Extension context invalidated" 错误问题，特别是在历史点赞同步场景中。