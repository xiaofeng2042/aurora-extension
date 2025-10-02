/**
 * Popup UI 脚本
 */

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
};

/**
 * 加载统计数据
 */
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SYNC_STATS",
    });

    if (response) {
      elements.todayCount.textContent = response.todaySynced || 0;
      elements.totalCount.textContent = response.totalSynced || 0;
    }
  } catch (error) {
    console.error("Error loading stats:", error);
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
    console.log("Checking Linear connection status...");
    const status = await chrome.runtime.sendMessage({
      type: "CHECK_LINEAR_CONNECTION",
    });

    console.log("Received connection status:", status);

    if (status.connected) {
      console.log("Linear connection successful!");
      elements.statusBadge.textContent = "已连接";
      elements.statusBadge.classList.remove("inactive");
      elements.statusBadge.classList.add("active");

      updateConnectionStatus(true);
    } else {
      console.log("Linear connection failed:", status.error);
      elements.statusBadge.textContent = "未连接";
      elements.statusBadge.classList.remove("active");
      elements.statusBadge.classList.add("inactive");

      updateConnectionStatus(false);
    }
  } catch (error) {
    console.error("Error checking connection:", error);
    elements.statusBadge.textContent = "连接错误";
    elements.statusBadge.classList.remove("active");
    elements.statusBadge.classList.add("inactive");
    updateConnectionStatus(false);
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

    // 加载团队信息
    loadTeamInfo();
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
 * 监听来自 background 的消息
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SYNC_SUCCESS") {
    // 刷新数据
    loadStats();
    loadRecentPosts();
  }
});

/**
 * 初始化
 */
async function init() {
  // 加载数据
  await loadStats();
  await loadRecentPosts();
  await checkConnectionStatus();

  // 绑定事件
  elements.syncBtn.addEventListener("click", syncQueue);
  elements.settingsBtn.addEventListener("click", toggleSettings);
  elements.saveTokenBtn.addEventListener("click", saveToken);
  elements.fetchTeamsBtn.addEventListener("click", fetchTeams);
  elements.saveTeamBtn.addEventListener("click", saveTeam);
  elements.teamSelect.addEventListener("change", handleTeamSelectChange);
  elements.refreshConnectionBtn.addEventListener("click", async () => {
    elements.refreshConnectionBtn.textContent = "刷新中...";
    elements.refreshConnectionBtn.disabled = true;
    await checkConnectionStatus();
    setTimeout(() => {
      elements.refreshConnectionBtn.textContent = "刷新";
      elements.refreshConnectionBtn.disabled = false;
    }, 1000);
  });

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
    loadRecentPosts();
  }, 10000); // 每 10 秒刷新

  // 预填用户提供的团队 ID (用于测试)
  elements.teamIdInput.value = "2a88645c-b488-4f41-ab48-d48ef64bae46";
  console.log("Pre-filled team ID: 2a88645c-b488-4f41-ab48-d48ef64bae46");
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
