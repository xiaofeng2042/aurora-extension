/**
 * Popup UI 脚本
 */

/**
 * 检查扩展运行时上下文是否有效
 */
function isRuntimeValid() {
  try {
    return chrome?.runtime?.id !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全地发送消息到背景脚本，带重试机制
 */
async function sendMessageSafely(message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    // 检查运行时上下文是否有效
    if (!isRuntimeValid()) {
      console.warn(`[Popup] Extension context invalid, retry attempt ${i + 1}/${retries}`);

      if (i < retries - 1) {
        // 指数退避等待
        await sleep(1000 * Math.pow(2, i));
        continue;
      }

      throw new Error("Extension context invalidated - please reload the extension");
    }

    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (error) {
      if (error.message.includes("Extension context invalidated") && i < retries - 1) {
        console.warn(`[Popup] Context invalidated, waiting before retry ${i + 1}/${retries}`);
        await sleep(1000 * Math.pow(2, i));
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to send message after retries");
}

// DOM 元素
const elements = {
  statusBadge: document.getElementById("statusBadge"),
  todayCount: document.getElementById("todayCount"),
  totalCount: document.getElementById("totalCount"),
  recentPosts: document.getElementById("recentPosts"),
  syncBtn: document.getElementById("syncBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsSection: document.getElementById("settingsSection"),
  tokenInput: document.getElementById("tokenInput"),
  saveTokenBtn: document.getElementById("saveTokenBtn"),
  connectionStatus: document.getElementById("connectionStatus"),
  refreshConnectionBtn: document.getElementById("refreshConnectionBtn"),
  teamIdInput: document.getElementById("teamIdInput"),
  fetchTeamsBtn: document.getElementById("fetchTeamsBtn"),
  saveTeamBtn: document.getElementById("saveTeamBtn"),
  teamSelect: document.getElementById("teamSelect"),
  teamSelectContainer: document.getElementById("teamSelectContainer"),
  currentTeamInfo: document.getElementById("currentTeamInfo"),
  currentTeamName: document.getElementById("currentTeamName"),
  debugSection: document.getElementById("debugSection"),
  debugContent: document.getElementById("debugContent"),
  toggleDebugBtn: document.getElementById("toggleDebugBtn"),
  clearDebugBtn: document.getElementById("clearDebugBtn"),
  testSyncBtn: document.getElementById("testSyncBtn"),
  checkImagesBtn: document.getElementById("checkImagesBtn"),
  syncHistoricalLikes: document.getElementById("syncHistoricalLikes"),
  historicalLikesStatus: document.getElementById("historicalLikesStatus"),
  syncCurrentPageBtn: document.getElementById("syncCurrentPageBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  // 新增配置相关元素
  titleStyleSelect: document.getElementById("titleStyleSelect"),
  titleMaxLengthSlider: document.getElementById("titleMaxLengthSlider"),
  titleLengthValue: document.getElementById("titleLengthValue"),
  enableSmartLabels: document.getElementById("enableSmartLabels"),
  smartLabelsStatus: document.getElementById("smartLabelsStatus"),
  labelCategoriesContainer: document.getElementById("labelCategoriesContainer"),
  enablePreview: document.getElementById("enablePreview"),
  previewStatus: document.getElementById("previewStatus"),
  autoSyncDelaySlider: document.getElementById("autoSyncDelaySlider"),
  autoSyncDelayValue: document.getElementById("autoSyncDelayValue"),
  // 预览队列相关元素
  previewSectionTitle: document.getElementById("previewSectionTitle"),
  previewCount: document.getElementById("previewCount"),
  previewQueue: document.getElementById("previewQueue"),
};

// 调试日志存储
let debugLogs = [];

/**
 * 加载统计数据
 */
async function loadStats() {
  try {
    const response = await sendMessageSafely({
      type: "GET_SYNC_STATS",
    });

    if (response) {
      elements.todayCount.textContent = response.todaySynced || 0;
      elements.totalCount.textContent = response.totalSynced || 0;
    }
  } catch (error) {
    if (error.message.includes("Extension context invalidated")) {
      addDebugLog("扩展上下文已失效，请重新加载扩展", { error: error.message });
      // 显示用户友好的错误信息
      elements.statusBadge.textContent = "扩展错误";
      elements.statusBadge.style.color = "#ef4444";
    } else {
      console.error("Error loading stats:", error);
    }
  }
}

/**
 * 加载最近帖子
 */
async function loadRecentPosts() {
  try {
    const posts = await chrome.runtime.sendMessage({
      type: "GET_RECENT_POSTS",
      limit: 5,
    });

    if (!posts || posts.length === 0) {
      elements.recentPosts.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div>还没有同步任何帖子</div>
          <div style="font-size: 0.75rem; margin-top: 8px;">
            在 X.com 上点赞帖子即可自动同步
          </div>
        </div>
      `;
      return;
    }

    // 渲染帖子列表
    elements.recentPosts.innerHTML = posts
      .map(
        (post) => `
      <div class="post-item">
        <div class="post-author">
          ${escapeHtml(post.author.name)}
          ${post.author.handle ? `@${escapeHtml(post.author.handle)}` : ""}
        </div>
        <div class="post-text">${escapeHtml(post.text || "无内容")}</div>
        <div class="post-time">${formatTime(post.syncedAt)}</div>
      </div>
    `
      )
      .join("");
  } catch (error) {
    console.error("Error loading recent posts:", error);
    elements.recentPosts.innerHTML = `
      <div class="empty-state">
        <div>加载失败</div>
      </div>
    `;
  }
}

/**
 * 检查连接状态
 */
async function checkConnectionStatus() {
  try {
    addDebugLog("开始检查 Linear 连接状态");

    // 首先检查配置完整性
    const configCheck = await checkConfiguration();
    if (!configCheck.valid) {
      addDebugLog("配置检查失败", configCheck);
      elements.statusBadge.textContent = "配置不完整";
      elements.statusBadge.classList.remove("active");
      elements.statusBadge.classList.add("inactive");
      updateConnectionStatus(false);
      return;
    }

    addDebugLog("配置验证通过，开始连接测试");
    const status = await chrome.runtime.sendMessage({
      type: "CHECK_LINEAR_CONNECTION",
    });

    addDebugLog("连接状态检查结果", status);

    if (status.connected) {
      addDebugLog("Linear 连接成功");
      elements.statusBadge.textContent = "已连接";
      elements.statusBadge.classList.remove("inactive");
      elements.statusBadge.classList.add("active");
      updateConnectionStatus(true);
    } else {
      addDebugLog("Linear 连接失败", { error: status.error });
      elements.statusBadge.textContent = "连接失败";
      elements.statusBadge.classList.remove("active");
      elements.statusBadge.classList.add("inactive");
      updateConnectionStatus(false);
    }
  } catch (error) {
    addDebugLog("连接状态检查出错", { error: error.message });
    console.error("Error checking connection:", error);
    elements.statusBadge.textContent = "连接错误";
    elements.statusBadge.classList.remove("active");
    elements.statusBadge.classList.add("inactive");
    updateConnectionStatus(false);
  }
}

/**
 * 检查配置完整性
 */
async function checkConfiguration() {
  try {
    addDebugLog("开始检查配置完整性");

    const response = await chrome.runtime.sendMessage({
      type: "GET_DEBUG_INFO",
    });

    const issues = [];

    if (!response) {
      addDebugLog("无法获取调试信息");
      return {
        valid: false,
        issues: ["无法获取扩展状态信息"]
      };
    }

    // 检查 Token
    if (response.storage.linearToken === "未配置") {
      issues.push("Linear API Token 未配置");
      addDebugLog("Linear API Token 未配置");
    } else {
      addDebugLog("Linear API Token 已配置");
    }

    // 检查团队 ID
    if (response.storage.linearTeamId === "未配置") {
      issues.push("Linear 团队 ID 未配置");
      addDebugLog("Linear 团队 ID 未配置");
    } else {
      addDebugLog("Linear 团队 ID 已配置");
    }

    // 检查存储使用情况
    if (response.storage.storageUsage) {
      const usage = response.storage.storageUsage;
      if (usage.percentage > 90) {
        issues.push(`存储空间即将用完 (${usage.percentage.toFixed(1)}%)`);
        addDebugLog("存储空间警告", { usage });
      }
    }

    // 检查同步队列
    if (response.storage.queueSize > 0) {
      addDebugLog("发现待同步队列", { queueSize: response.storage.queueSize });
    }

    const valid = issues.length === 0;
    addDebugLog(`配置检查完成: ${valid ? "通过" : "失败"}`, { issues });

    return {
      valid,
      issues,
      config: response
    };
  } catch (error) {
    addDebugLog("配置检查出错", { error: error.message });
    return {
      valid: false,
      issues: [`配置检查出错: ${error.message}`]
    };
  }
}

/**
 * 更新连接状态显示
 */
function updateConnectionStatus(connected) {
  const statusDot = elements.connectionStatus.querySelector(".status-dot");
  const statusText = elements.connectionStatus.querySelector("span");

  if (connected) {
    statusDot.classList.remove("disconnected");
    statusDot.classList.add("connected");
    statusText.textContent = "已连接到 Linear";
  } else {
    statusDot.classList.remove("connected");
    statusDot.classList.add("disconnected");
    statusText.textContent = "未连接到 Linear";
  }
}

/**
 * 手动同步队列
 */
async function syncQueue() {
  elements.syncBtn.textContent = "同步中...";
  elements.syncBtn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: "PROCESS_QUEUE" });

    // 刷新数据
    await loadStats();
    await loadRecentPosts();

    elements.syncBtn.textContent = "同步完成 ✓";

    setTimeout(() => {
      elements.syncBtn.textContent = "手动同步队列";
      elements.syncBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("Error syncing queue:", error);
    elements.syncBtn.textContent = "同步失败";
    elements.syncBtn.disabled = false;
  }
}

/**
 * 保存 Token
 */
async function saveToken() {
  const token = elements.tokenInput.value.trim();

  if (!token) {
    alert("请输入 Token");
    return;
  }

  elements.saveTokenBtn.textContent = "保存中...";
  elements.saveTokenBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_LINEAR_TOKEN",
      token: token,
    });

    if (response?.success) {
      elements.saveTokenBtn.textContent = "保存成功 ✓";
      elements.tokenInput.value = "";

      // 强制刷新连接状态并添加延迟确保Token已保存
      await new Promise(resolve => setTimeout(resolve, 500));
      await checkConnectionStatus();

      // 再次确认状态更新
      setTimeout(async () => {
        await checkConnectionStatus();
        console.log("Connection status re-checked after successful token save");
      }, 1000);

      setTimeout(() => {
        elements.saveTokenBtn.textContent = "保存 Token";
        elements.saveTokenBtn.disabled = false;
      }, 2000);
    } else {
      const message = response?.error
        ? `Token 验证失败: ${response.error}`
        : "Token 验证失败,请检查是否正确";

      alert(message);
      elements.saveTokenBtn.textContent = "保存 Token";
      elements.saveTokenBtn.disabled = false;
    }
  } catch (error) {
    console.error("Error saving token:", error);
    const message = error?.message ? `保存失败: ${error.message}` : "保存失败";
    alert(message);
    elements.saveTokenBtn.textContent = "保存 Token";
    elements.saveTokenBtn.disabled = false;
  }
}

/**
 * 切换设置面板
 */
function toggleSettings() {
  const isVisible = elements.settingsSection.style.display !== "none";

  if (isVisible) {
    elements.settingsSection.style.display = "none";
    elements.settingsBtn.textContent = "设置";
  } else {
    elements.settingsSection.style.display = "block";
    elements.settingsBtn.textContent = "关闭设置";

    // 加载团队信息和配置
    loadTeamInfo();
    loadConfig();
  }
}

/**
 * 加载团队信息
 */
async function loadTeamInfo() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_LINEAR_TEAM",
    });

    if (response && response.teamId && response.teamName) {
      elements.currentTeamName.textContent = `${response.teamName} (${response.teamId.substring(0, 8)}...)`;
      elements.currentTeamInfo.style.display = "block";
      elements.teamIdInput.value = response.teamId;
    } else {
      elements.currentTeamInfo.style.display = "none";
    }
  } catch (error) {
    console.error("Error loading team info:", error);
    elements.currentTeamInfo.style.display = "none";
  }
}

/**
 * 加载配置设置
 */
async function loadConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_CONFIG",
    });

    if (response) {
      // 设置历史点赞开关状态
      elements.syncHistoricalLikes.checked = response.syncHistoricalLikes === true;
      updateHistoricalLikesStatus(response.syncHistoricalLikes);

      // 加载同步配置
      await loadSyncConfig();

      addDebugLog("配置加载成功", response);
    }
  } catch (error) {
    addDebugLog("加载配置失败", { error: error.message });
  }
}

/**
 * 加载同步配置
 */
async function loadSyncConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_CONFIG",
    });

    const config = response || {};

    // 标题生成设置
    elements.titleStyleSelect.value = config.titleStyle || 'smart';
    elements.titleMaxLengthSlider.value = config.titleMaxLength || 100;
    elements.titleLengthValue.textContent = config.titleMaxLength || 100;

    // 标签设置
    elements.enableSmartLabels.checked = config.enableSmartLabels !== false;
    updateSmartLabelsStatus(config.enableSmartLabels !== false);

    // 初始化标签分类复选框
    initializeLabelCategories(config.labelCategories || []);

    // 预览设置
    elements.enablePreview.checked = config.enablePreview !== false;
    updatePreviewStatus(config.enablePreview !== false);

    // 同步延迟设置
    const delaySeconds = Math.floor((config.autoSyncDelay || 3000) / 1000);
    elements.autoSyncDelaySlider.value = delaySeconds;
    elements.autoSyncDelayValue.textContent = delaySeconds;

    addDebugLog("同步配置加载成功", config);
  } catch (error) {
    addDebugLog("加载同步配置失败", { error: error.message });
  }
}

/**
 * 初始化标签分类复选框
 */
function initializeLabelCategories(selectedCategories = []) {
  const allCategories = [
    { key: 'technology', label: '技术', keywords: ['tech', 'code', 'ai'] },
    { key: 'business', label: '商业', keywords: ['business', 'startup'] },
    { key: 'entertainment', label: '娱乐', keywords: ['movie', 'music'] },
    { key: 'sports', label: '体育', keywords: ['sport', 'game'] },
    { key: 'politics', label: '政治', keywords: ['politics', 'policy'] },
    { key: 'science', label: '科学', keywords: ['science', 'research'] }
  ];

  elements.labelCategoriesContainer.innerHTML = '';

  allCategories.forEach(category => {
    const label = document.createElement('label');
    label.style.cssText = 'display: inline-flex; align-items: center; padding: 4px 8px; background: #f3f4f6; border-radius: 4px; cursor: pointer; font-size: 0.75rem; color: #374151;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = category.key;
    checkbox.checked = selectedCategories.includes(category.key);
    checkbox.style.marginRight = '4px';

    checkbox.addEventListener('change', saveLabelCategories);

    const text = document.createElement('span');
    text.textContent = category.label;
    text.title = `关键词: ${category.keywords.join(', ')}`;

    label.appendChild(checkbox);
    label.appendChild(text);
    elements.labelCategoriesContainer.appendChild(label);
  });
}

/**
 * 保存标签分类设置
 */
async function saveLabelCategories() {
  const checkboxes = elements.labelCategoriesContainer.querySelectorAll('input[type="checkbox"]:checked');
  const selectedCategories = Array.from(checkboxes).map(cb => cb.value);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        labelCategories: selectedCategories
      }
    });

    if (response?.success) {
      addDebugLog("标签分类保存成功", { categories: selectedCategories });
    } else {
      addDebugLog("标签分类保存失败", response);
    }
  } catch (error) {
    addDebugLog("保存标签分类出错", { error: error.message });
  }
}

/**
 * 更新智能标签状态显示
 */
function updateSmartLabelsStatus(enabled) {
  if (enabled) {
    elements.smartLabelsStatus.textContent = "已启用";
    elements.smartLabelsStatus.style.color = "#10b981";
  } else {
    elements.smartLabelsStatus.textContent = "已禁用";
    elements.smartLabelsStatus.style.color = "#9ca3af";
  }
}

/**
 * 更新预览状态显示
 */
function updatePreviewStatus(enabled) {
  if (enabled) {
    elements.previewStatus.textContent = "已启用";
    elements.previewStatus.style.color = "#10b981";
  } else {
    elements.previewStatus.textContent = "已禁用";
    elements.previewStatus.style.color = "#9ca3af";
  }
}

/**
 * 保存标题样式设置
 */
async function saveTitleStyle() {
  const titleStyle = elements.titleStyleSelect.value;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        titleStyle: titleStyle
      }
    });

    if (response?.success) {
      addDebugLog("标题样式保存成功", { titleStyle });
    } else {
      addDebugLog("标题样式保存失败", response);
    }
  } catch (error) {
    addDebugLog("保存标题样式出错", { error: error.message });
  }
}

/**
 * 保存标题最大长度设置
 */
async function saveTitleMaxLength() {
  const maxLength = parseInt(elements.titleMaxLengthSlider.value);
  elements.titleLengthValue.textContent = maxLength;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        titleMaxLength: maxLength
      }
    });

    if (response?.success) {
      addDebugLog("标题最大长度保存成功", { maxLength });
    } else {
      addDebugLog("标题最大长度保存失败", response);
    }
  } catch (error) {
    addDebugLog("保存标题最大长度出错", { error: error.message });
  }
}

/**
 * 保存智能标签设置
 */
async function saveSmartLabelsSetting() {
  const enabled = elements.enableSmartLabels.checked;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        enableSmartLabels: enabled
      }
    });

    if (response?.success) {
      updateSmartLabelsStatus(enabled);
      addDebugLog("智能标签设置保存成功");
    } else {
      addDebugLog("智能标签设置保存失败", response);
      // 回滚状态
      elements.enableSmartLabels.checked = !enabled;
    }
  } catch (error) {
    addDebugLog("保存智能标签设置出错", { error: error.message });
    // 回滚状态
    elements.enableSmartLabels.checked = !enabled;
  }
}

/**
 * 保存预览设置
 */
async function savePreviewSetting() {
  const enabled = elements.enablePreview.checked;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        enablePreview: enabled
      }
    });

    if (response?.success) {
      updatePreviewStatus(enabled);
      addDebugLog("预览设置保存成功");
    } else {
      addDebugLog("预览设置保存失败", response);
      // 回滚状态
      elements.enablePreview.checked = !enabled;
    }
  } catch (error) {
    addDebugLog("保存预览设置出错", { error: error.message });
    // 回滚状态
    elements.enablePreview.checked = !enabled;
  }
}

/**
 * 保存自动同步延迟设置
 */
async function saveAutoSyncDelay() {
  const delaySeconds = parseInt(elements.autoSyncDelaySlider.value);
  elements.autoSyncDelayValue.textContent = delaySeconds;
  const delayMs = delaySeconds * 1000;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        autoSyncDelay: delayMs
      }
    });

    if (response?.success) {
      addDebugLog("自动同步延迟保存成功", { delay: delayMs });
    } else {
      addDebugLog("自动同步延迟保存失败", response);
    }
  } catch (error) {
    addDebugLog("保存自动同步延迟出错", { error: error.message });
  }
}

/**
 * 更新历史点赞状态显示
 */
function updateHistoricalLikesStatus(enabled) {
  if (enabled) {
    elements.historicalLikesStatus.textContent = "已启用";
    elements.historicalLikesStatus.style.color = "#10b981";
  } else {
    elements.historicalLikesStatus.textContent = "已禁用";
    elements.historicalLikesStatus.style.color = "#9ca3af";
  }
}

/**
 * 保存历史点赞设置
 */
async function saveHistoricalLikesSetting() {
  const enabled = elements.syncHistoricalLikes.checked;

  try {
    addDebugLog("保存历史点赞设置", { enabled });

    const response = await chrome.runtime.sendMessage({
      type: "SET_CONFIG",
      config: {
        syncHistoricalLikes: enabled
      }
    });

    if (response?.success) {
      updateHistoricalLikesStatus(enabled);
      addDebugLog("历史点赞设置保存成功");
    } else {
      addDebugLog("历史点赞设置保存失败", response);
      // 回滚状态
      elements.syncHistoricalLikes.checked = !enabled;
    }
  } catch (error) {
    addDebugLog("保存历史点赞设置出错", { error: error.message });
    // 回滚状态
    elements.syncHistoricalLikes.checked = !enabled;
  }
}

/**
 * 同步当前页面
 */
async function syncCurrentPage() {
  elements.syncCurrentPageBtn.textContent = "同步中...";
  elements.syncCurrentPageBtn.disabled = true;

  try {
    // 先检查运行时上下文是否有效
    if (!isRuntimeValid()) {
      throw new Error("扩展上下文已失效，请重新加载扩展");
    }

    addDebugLog("开始同步当前页面");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url?.includes('x.com') && !tab.url?.includes('twitter.com')) {
      addDebugLog("当前页面不是 X.com", { url: tab?.url });
      alert("请在 X.com 页面使用此功能");
      return;
    }

    // 注入脚本强制扫描当前页面的点赞
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 触发页面脚本中的历史点赞扫描
        if (window.auroraPageScript && window.auroraPageScript.scanExistingLikes) {
          window.auroraPageScript.scanExistingLikes();
          return { success: true };
        }
        return { success: false, error: "Aurora page script not loaded" };
      }
    });

    elements.syncCurrentPageBtn.textContent = "同步完成 ✓";
    addDebugLog("当前页面同步触发成功");

  } catch (error) {
    if (error.message.includes("Extension context invalidated")) {
      addDebugLog("扩展上下文已失效", { error: error.message });
      alert("扩展需要重新加载，请刷新页面后重试");
    } else {
      addDebugLog("同步当前页面失败", { error: error.message });
      alert(`同步失败: ${error.message}`);
    }
  }

  setTimeout(() => {
    elements.syncCurrentPageBtn.textContent = "同步当前页面";
    elements.syncCurrentPageBtn.disabled = false;
  }, 2000);
}

/**
 * 清除同步记录
 */
async function clearSyncHistory() {
  if (!confirm("确定要清除所有同步记录吗？这将删除已同步的推文记录，但不会删除 Linear 中已创建的 Issue。")) {
    return;
  }

  elements.clearHistoryBtn.textContent = "清除中...";
  elements.clearHistoryBtn.disabled = true;

  try {
    // 先检查运行时上下文是否有效
    if (!isRuntimeValid()) {
      throw new Error("扩展上下文已失效，请重新加载扩展");
    }

    addDebugLog("开始清除同步记录");

    const response = await sendMessageSafely({
      type: "CLEAR_SYNC_HISTORY"
    });

    if (response?.success) {
      addDebugLog("同步记录清除成功");

      // 刷新显示
      await loadStats();
      await loadRecentPosts();

      alert("同步记录已清除");
    } else {
      addDebugLog("同步记录清除失败", response);
      alert(`清除失败: ${response?.error || "未知错误"}`);
    }
  } catch (error) {
    addDebugLog("清除同步记录出错", { error: error.message });
    alert(`清除失败: ${error.message}`);
  }

  elements.clearHistoryBtn.textContent = "清除同步记录";
  elements.clearHistoryBtn.disabled = false;
}

/**
 * 获取团队列表
 */
async function fetchTeams() {
  elements.fetchTeamsBtn.textContent = "获取中...";
  elements.fetchTeamsBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_LINEAR_TEAMS",
    });

    if (response && response.teams && response.teams.length > 0) {
      // 清空现有选项
      elements.teamSelect.innerHTML = '<option value="">选择一个团队...</option>';

      // 添加团队选项
      response.teams.forEach(team => {
        const option = document.createElement("option");
        option.value = team.id;
        option.textContent = `${team.name} (${team.key})`;
        elements.teamSelect.appendChild(option);
      });

      elements.teamSelectContainer.style.display = "block";
      elements.fetchTeamsBtn.textContent = "获取团队 ✓";

      // 自动选择当前配置的团队（如果有）
      const currentTeamId = elements.teamIdInput.value.trim();
      if (currentTeamId) {
        elements.teamSelect.value = currentTeamId;
      }
    } else {
      alert("未找到可用的团队，请检查您的 Linear 权限");
      elements.fetchTeamsBtn.textContent = "获取团队";
    }
  } catch (error) {
    console.error("Error fetching teams:", error);
    alert(`获取团队列表失败: ${error.message || "网络错误"}`);
    elements.fetchTeamsBtn.textContent = "获取团队";
  } finally {
    elements.fetchTeamsBtn.disabled = false;
  }
}

/**
 * 保存团队配置
 */
async function saveTeam() {
  const teamId = elements.teamIdInput.value.trim() || elements.teamSelect.value;

  if (!teamId) {
    alert("请输入团队 ID 或从列表中选择一个团队");
    return;
  }

  elements.saveTeamBtn.textContent = "保存中...";
  elements.saveTeamBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_LINEAR_TEAM",
      teamId: teamId,
    });

    if (response?.success) {
      elements.saveTeamBtn.textContent = "保存成功 ✓";

      // 更新当前团队信息显示
      if (response.team) {
        elements.currentTeamName.textContent = `${response.team.name} (${response.team.key})`;
        elements.currentTeamInfo.style.display = "block";
      }

      // 刷新连接状态以确保团队配置生效
      await checkConnectionStatus();

      setTimeout(() => {
        elements.saveTeamBtn.textContent = "保存团队配置";
        elements.saveTeamBtn.disabled = false;
      }, 2000);
    } else {
      const message = response?.error
        ? `团队验证失败: ${response.error}`
        : "团队验证失败，请检查团队 ID 是否正确";

      alert(message);
      elements.saveTeamBtn.textContent = "保存团队配置";
      elements.saveTeamBtn.disabled = false;
    }
  } catch (error) {
    console.error("Error saving team:", error);
    const message = error?.message ? `保存失败: ${error.message}` : "保存失败";
    alert(message);
    elements.saveTeamBtn.textContent = "保存团队配置";
    elements.saveTeamBtn.disabled = false;
  }
}

/**
 * 团队选择变更处理
 */
function handleTeamSelectChange() {
  const selectedTeamId = elements.teamSelect.value;
  if (selectedTeamId) {
    elements.teamIdInput.value = selectedTeamId;
  }
}

/**
 * 检查页面图片
 */
async function checkImages() {
  elements.checkImagesBtn.textContent = "检查中...";
  elements.checkImagesBtn.disabled = true;

  try {
    addDebugLog("开始检查页面图片");

    // 获取当前活动的标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url?.includes('x.com') && !tab.url?.includes('twitter.com')) {
      addDebugLog("当前页面不是 X.com", { url: tab?.url });
      alert("请在 X.com 页面使用此功能");
      elements.checkImagesBtn.textContent = "检查图片";
      elements.checkImagesBtn.disabled = false;
      return;
    }

    addDebugLog("向页面注入检查脚本");

    // 注入脚本检查页面图片
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const imageSelectors = [
          'img[src*="media"]',
          'img[alt*="Image"]',
          '[data-testid="tweetPhoto"] img',
          'img[data-testid="tweetImage"]',
          'img[src*="pbs.twimg.com"]',
          'img[src*="twimg.com"]',
          '[aria-label*="图片"] img',
          '[aria-label*="Image"] img'
        ];

        const allImages = [];
        const tweetImages = [];

        imageSelectors.forEach(selector => {
          const imgs = document.querySelectorAll(selector);
          imgs.forEach(img => {
            const src = img.src;
            if (src && src.includes('/media/')) {
              tweetImages.push(src);
            }
            if (src) {
              allImages.push(src);
            }
          });
        });

        return {
          totalImages: allImages.length,
          uniqueImages: [...new Set(allImages)].length,
          tweetImages: [...new Set(tweetImages)],
          tweetImageCount: [...new Set(tweetImages)].length
        };
      }
    });

    const imageData = result[0]?.result;

    if (imageData) {
      addDebugLog("图片检查结果", imageData);
      alert(`页面图片统计：\n\n` +
        `总图片数: ${imageData.totalImages}\n` +
        `去重后: ${imageData.uniqueImages}\n` +
        `推文图片: ${imageData.tweetImageCount}\n\n` +
        `前3个推文图片URL:\n${imageData.tweetImages.slice(0, 3).join('\n')}`
      );
    }
  } catch (error) {
    addDebugLog("检查图片失败", { error: error.message });
    alert(`检查失败: ${error.message}`);
  }

  elements.checkImagesBtn.textContent = "检查图片";
  elements.checkImagesBtn.disabled = false;
}

/**
 * 测试同步功能
 */
async function testSync() {
  elements.testSyncBtn.textContent = "测试中...";
  elements.testSyncBtn.disabled = true;

  try {
    addDebugLog("开始测试同步功能");

    // 创建测试推文数据
    const testTweet = {
      tweetId: "test_" + Date.now(),
      author: {
        name: "测试用户",
        handle: "test_user"
      },
      text: "这是一个测试推文，用于验证 Aurora 扩展的同步功能是否正常工作。\n\n包含图片和媒体内容测试。",
      timestamp: new Date().toISOString(),
      url: "https://x.com/test_user/status/" + Date.now(),
      media: {
        images: [
          "https://pbs.twimg.com/media/test_image.jpg?format=jpg&name=large",
          "https://pbs.twimg.com/media/test_image2.jpg?format=jpg&name=large"
        ],
        videos: [
          "https://video.twimg.com/ext_tw_video/test_video.mp4"
        ]
      }
    };

    addDebugLog("发送测试推文到后台", { tweetId: testTweet.tweetId });

    const response = await chrome.runtime.sendMessage({
      type: "NEW_LIKED_POST",
      payload: testTweet
    });

    addDebugLog("测试同步响应", response);

    if (response?.success) {
      elements.testSyncBtn.textContent = "测试成功 ✓";
      addDebugLog("测试同步成功");
    } else {
      elements.testSyncBtn.textContent = "测试失败";
      addDebugLog("测试同步失败", { error: response?.error });
    }
  } catch (error) {
    addDebugLog("测试同步出错", { error: error.message });
    elements.testSyncBtn.textContent = "测试错误";
  }

  setTimeout(() => {
    elements.testSyncBtn.textContent = "测试同步";
    elements.testSyncBtn.disabled = false;
  }, 3000);
}

/**
 * 格式化时间
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // 小于 1 分钟
  if (diff < 60000) {
    return "刚刚";
  }

  // 小于 1 小时
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  }

  // 小于 24 小时
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  }

  // 超过 24 小时,显示日期
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 加载预览队列
 */
async function loadPreviewQueue() {
  try {
    addDebugLog("开始加载预览队列");
    const response = await chrome.runtime.sendMessage({
      type: "GET_PREVIEW_QUEUE",
    });

    if (response && response.queue) {
      addDebugLog(`获取到 ${response.queue.length} 个预览项目`);
      renderPreviewQueue(response.queue);
    } else {
      addDebugLog("预览队列为空或获取失败");
      hidePreviewSection();
    }
  } catch (error) {
    addDebugLog("加载预览队列失败", { error: error.message });
    hidePreviewSection();
  }
}

/**
 * 渲染预览队列
 */
function renderPreviewQueue(queue) {
  const pendingItems = queue.filter(item => item.status === 'pending');
  const confirmedItems = queue.filter(item => item.status === 'confirmed');

  if (pendingItems.length === 0 && confirmedItems.length === 0) {
    hidePreviewSection();
    return;
  }

  // 显示预览区域
  elements.previewSectionTitle.style.display = "block";
  elements.previewQueue.style.display = "block";
  elements.previewCount.textContent = `(${pendingItems.length})`;

  let html = "";

  // 添加批量操作按钮（有待处理项目时）
  if (pendingItems.length > 0) {
    html += `
      <div class="batch-actions">
        <button class="batch-btn batch-confirm-all" onclick="batchConfirmAll()">全部同步 (${pendingItems.length})</button>
        <button class="batch-btn batch-skip-all" onclick="batchSkipAll()">全部跳过</button>
      </div>
    `;
  }

  // 渲染每个预览项目
  queue.forEach(item => {
    const timeUntilAuto = getTimeUntilAutoSync(item.autoSyncAt);
    const statusClass = `status-${item.status}`;
    const statusText = item.status === 'pending' ? '待确认' : '已确认';

    html += `
      <div class="preview-item ${statusClass}">
        <div class="preview-item-status">${statusText}</div>
        <div class="post-author">
          ${escapeHtml(item.author.name)}
          ${item.author.handle ? `@${escapeHtml(item.author.handle)}` : ""}
        </div>
        <div class="post-text">${escapeHtml(item.text || "无内容")}</div>
        ${item.status === 'pending' && timeUntilAutoSync ?
          `<div class="preview-auto-time">自动同步: ${timeUntilAuto}</div>` :
          ''
        }
        ${item.status === 'pending' ? `
          <div class="preview-actions">
            <button class="preview-btn preview-btn-confirm" onclick="confirmPreviewItem('${item.tweetId}')">同步</button>
            <button class="preview-btn preview-btn-skip" onclick="skipPreviewItem('${item.tweetId}')">跳过</button>
          </div>
        ` : ''}
      </div>
    `;
  });

  elements.previewQueue.innerHTML = html;
}

/**
 * 隐藏预览区域
 */
function hidePreviewSection() {
  elements.previewSectionTitle.style.display = "none";
  elements.previewQueue.style.display = "none";
}

/**
 * 计算距离自动同步的时间
 */
function getTimeUntilAutoSync(autoSyncAt) {
  if (!autoSyncAt) return null;

  const now = new Date();
  const autoTime = new Date(autoSyncAt);
  const diff = autoTime - now;

  if (diff <= 0) return '即将同步';

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}分${seconds}秒后自动同步`;
  } else {
    return `${seconds}秒后自动同步`;
  }
}

/**
 * 确认单个预览项目
 */
async function confirmPreviewItem(tweetId) {
  try {
    addDebugLog("确认预览项目", { tweetId });

    // 禁用按钮避免重复点击
    const button = event.target;
    button.disabled = true;
    button.textContent = "同步中...";

    const response = await chrome.runtime.sendMessage({
      type: "CONFIRM_PREVIEW_ITEM",
      payload: { tweetId }
    });

    if (response?.success) {
      addDebugLog("预览项目同步成功", { tweetId });
      // 刷新预览队列和统计数据
      await loadPreviewQueue();
      await loadStats();
      await loadRecentPosts();
    } else {
      addDebugLog("预览项目同步失败", { tweetId, error: response?.error });
      alert(`同步失败: ${response?.error || "未知错误"}`);
      button.disabled = false;
      button.textContent = "同步";
    }
  } catch (error) {
    addDebugLog("确认预览项目出错", { tweetId, error: error.message });
    alert(`操作失败: ${error.message}`);
    event.target.disabled = false;
    event.target.textContent = "同步";
  }
}

/**
 * 跳过单个预览项目
 */
async function skipPreviewItem(tweetId) {
  try {
    addDebugLog("跳过预览项目", { tweetId });

    const button = event.target;
    button.disabled = true;
    button.textContent = "跳过中...";

    const response = await chrome.runtime.sendMessage({
      type: "SKIP_PREVIEW_ITEM",
      payload: { tweetId }
    });

    if (response?.success) {
      addDebugLog("预览项目跳过成功", { tweetId });
      await loadPreviewQueue();
    } else {
      addDebugLog("预览项目跳过失败", { tweetId, error: response?.error });
      button.disabled = false;
      button.textContent = "跳过";
    }
  } catch (error) {
    addDebugLog("跳过预览项目出错", { tweetId, error: error.message });
    event.target.disabled = false;
    event.target.textContent = "跳过";
  }
}

/**
 * 批量确认所有待处理项目
 */
async function batchConfirmAll() {
  try {
    addDebugLog("开始批量确认预览项目");

    const response = await chrome.runtime.sendMessage({
      type: "GET_PREVIEW_QUEUE",
    });

    if (response?.queue) {
      const pendingItems = response.queue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        alert("没有待确认的项目");
        return;
      }

      const tweetIds = pendingItems.map(item => item.tweetId);

      const batchResponse = await chrome.runtime.sendMessage({
        type: "BATCH_CONFIRM_PREVIEW",
        payload: { tweetIds }
      });

      if (batchResponse?.results) {
        const successCount = batchResponse.results.filter(r => r.success).length;
        const failCount = batchResponse.results.length - successCount;

        addDebugLog("批量确认完成", {
          total: batchResponse.results.length,
          success: successCount,
          failed: failCount
        });

        alert(`批量同步完成: 成功 ${successCount} 个，失败 ${failCount} 个`);

        // 刷新界面
        await loadPreviewQueue();
        await loadStats();
        await loadRecentPosts();
      }
    }
  } catch (error) {
    addDebugLog("批量确认出错", { error: error.message });
    alert(`批量操作失败: ${error.message}`);
  }
}

/**
 * 批量跳过所有待处理项目
 */
async function batchSkipAll() {
  try {
    addDebugLog("开始批量跳过预览项目");

    const response = await chrome.runtime.sendMessage({
      type: "GET_PREVIEW_QUEUE",
    });

    if (response?.queue) {
      const pendingItems = response.queue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        alert("没有待跳过的项目");
        return;
      }

      if (!confirm(`确定要跳过 ${pendingItems.length} 个待同步项目吗？`)) {
        return;
      }

      // 逐个跳过
      for (const item of pendingItems) {
        await chrome.runtime.sendMessage({
          type: "SKIP_PREVIEW_ITEM",
          payload: { tweetId: item.tweetId }
        });
      }

      addDebugLog("批量跳过完成", { count: pendingItems.length });

      // 刷新界面
      await loadPreviewQueue();
    }
  } catch (error) {
    addDebugLog("批量跳过出错", { error: error.message });
    alert(`批量操作失败: ${error.message}`);
  }
}

/**
 * 监听来自 background 的消息
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SYNC_SUCCESS") {
    // 刷新数据
    loadStats();
    loadRecentPosts();
  }

  if (message.type === "PREVIEW_QUEUE_UPDATED") {
    // 预览队列更新，刷新预览区域
    loadPreviewQueue();
  }
});

// 将函数暴露到全局作用域，以便 HTML 中的 onclick 可以访问
window.confirmPreviewItem = confirmPreviewItem;
window.skipPreviewItem = skipPreviewItem;
window.batchConfirmAll = batchConfirmAll;
window.batchSkipAll = batchSkipAll;

/**
 * 初始化
 */
async function init() {
  addDebugLog("Popup 初始化开始");

  // 加载数据
  addDebugLog("加载统计数据");
  await loadStats();

  addDebugLog("加载预览队列");
  await loadPreviewQueue();

  addDebugLog("加载最近帖子");
  await loadRecentPosts();

  addDebugLog("检查连接状态");
  await checkConnectionStatus();

// 绑定事件
  elements.syncBtn.addEventListener("click", syncQueue);
  elements.testSyncBtn.addEventListener("click", testSync);
  elements.checkImagesBtn.addEventListener("click", checkImages);
  elements.settingsBtn.addEventListener("click", toggleSettings);
  elements.saveTokenBtn.addEventListener("click", saveToken);
  elements.fetchTeamsBtn.addEventListener("click", fetchTeams);
  elements.saveTeamBtn.addEventListener("click", saveTeam);
  elements.teamSelect.addEventListener("change", handleTeamSelectChange);
  elements.toggleDebugBtn.addEventListener("click", toggleDebugPanel);
  elements.clearDebugBtn.addEventListener("click", clearDebugLogs);
  elements.refreshConnectionBtn.addEventListener("click", async () => {
    addDebugLog("手动刷新连接状态");
    elements.refreshConnectionBtn.textContent = "刷新中...";
    elements.refreshConnectionBtn.disabled = true;
    await checkConnectionStatus();
    setTimeout(() => {
      elements.refreshConnectionBtn.textContent = "刷新";
      elements.refreshConnectionBtn.disabled = false;
    }, 1000);
  });
  elements.syncHistoricalLikes.addEventListener("change", saveHistoricalLikesSetting);
  elements.syncCurrentPageBtn.addEventListener("click", syncCurrentPage);
  elements.clearHistoryBtn.addEventListener("click", clearSyncHistory);

  // 新增配置相关事件
  elements.titleStyleSelect.addEventListener("change", saveTitleStyle);
  elements.titleMaxLengthSlider.addEventListener("input", saveTitleMaxLength);
  elements.enableSmartLabels.addEventListener("change", saveSmartLabelsSetting);
  elements.enablePreview.addEventListener("change", savePreviewSetting);
  elements.autoSyncDelaySlider.addEventListener("input", saveAutoSyncDelay);

  // Token 输入框回车保存
  elements.tokenInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveToken();
    }
  });

  // 团队 ID 输入框回车保存
  elements.teamIdInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveTeam();
    }
  });

  // 定期刷新数据
  setInterval(() => {
    loadStats();
    loadPreviewQueue();
    loadRecentPosts();
  }, 10000); // 每 10 秒刷新

// 预填用户提供的团队 ID (用于测试)
  elements.teamIdInput.value = "2a88645c-b488-4f41-ab48-d48ef64bae46";
  console.log("Pre-filled team ID: 2a88645c-b488-4f41-ab48-d48ef64bae46");

  // 加载调试信息
  loadDebugInfo();
}

/**
 * 添加调试日志
 */
function addDebugLog(message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}${data ? `: ${JSON.stringify(data, null, 2)}` : ''}`;

  debugLogs.unshift(logEntry);
  // 只保留最近 50 条日志
  if (debugLogs.length > 50) {
    debugLogs = debugLogs.slice(0, 50);
  }

  updateDebugDisplay();
}

/**
 * 更新调试显示
 */
function updateDebugDisplay() {
  if (elements.debugContent) {
    elements.debugContent.textContent = debugLogs.join('\n') || '等待调试信息...';
    // 自动滚动到最新日志
    elements.debugContent.scrollTop = 0;
  }
}

/**
 * 切换调试面板
 */
function toggleDebugPanel() {
  const isVisible = elements.debugSection.style.display !== "none";

  if (isVisible) {
    elements.debugSection.style.display = "none";
    elements.toggleDebugBtn.textContent = "调试";
  } else {
    elements.debugSection.style.display = "block";
    elements.toggleDebugBtn.textContent = "关闭调试";
    updateDebugDisplay();
  }
}

/**
 * 清除调试日志
 */
function clearDebugLogs() {
  debugLogs = [];
  updateDebugDisplay();
}

/**
 * 加载调试信息
 */
async function loadDebugInfo() {
  try {
    addDebugLog("正在获取调试信息...");

    const response = await chrome.runtime.sendMessage({
      type: "GET_DEBUG_INFO",
    });

    if (response) {
      addDebugLog("获取调试信息成功", response);
    } else {
      addDebugLog("未获取到调试信息");
    }
  } catch (error) {
    addDebugLog("获取调试信息失败", { error: error.message });
    console.error("Error loading debug info:", error);
  }
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
