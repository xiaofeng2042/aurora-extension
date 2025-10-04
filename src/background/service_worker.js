/**
 * Background Service Worker - 后台服务
 * 处理推文同步、队列管理和错误重试
 */

const DEBUG = true;

// 内嵌Storage模块避免importScripts问题
const Storage = {
  // 存储键名常量
  KEYS: {
    SYNCED_TWEETS: "syncedTweets",
    SYNC_STATS: "syncStats",
    LINEAR_TOKEN: "linearToken",
    LINEAR_TEAM_ID: "linearTeamId",
    RECENT_POSTS: "recentPosts",
    SYNC_QUEUE: "syncQueue",
    INSTALL_TIMESTAMP: "installTimestamp",
    SYNC_HISTORICAL_LIKES: "syncHistoricalLikes",
    CONFIG: "auroraConfig",
    PREVIEW_QUEUE: "previewQueue",
  },

  async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error(`[Storage] Error getting ${key}:`, error);
      return null;
    }
  },

  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`[Storage] Error setting ${key}:`, error);
      return false;
    }
  },

  // 基本方法实现
  async getLinearToken() {
    return await this.get(this.KEYS.LINEAR_TOKEN);
  },

  async getLinearTeamId() {
    return await this.get(this.KEYS.LINEAR_TEAM_ID);
  },

  async getConfig() {
    return await this.get(this.KEYS.CONFIG) || {};
  },

  async setConfig(config) {
    return await this.set(this.KEYS.CONFIG, config);
  }
};

// 内嵌LinearAPI模块避免importScripts问题
const LinearAPI = {
  GRAPHQL_ENDPOINT: "https://api.linear.app/graphql",

  config: {
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 1000,
  },

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * 设置 Token
   */
  async setToken(token) {
    await Storage.set(Storage.KEYS.LINEAR_TOKEN, token);
    return true;
  },

  /**
   * 发送 GraphQL 查询
   */
  async requestGraphQL(query, variables = {}, tokenOverride = null) {
    const token = tokenOverride ?? (await Storage.get(Storage.KEYS.LINEAR_TOKEN));

    if (!token) {
      const error = "Linear API token not configured";
      console.error("[LinearAPI] Error:", error);
      throw new Error(error);
    }

    const requestBody = {
      query: query,
      variables: variables,
    };

    try {
      // 检查token格式：如果以"lin_api_"开头，直接使用；否则添加Bearer前缀
      const authHeader = token.startsWith("lin_api_") ? token : `Bearer ${token}`;

      const response = await fetch(this.GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error = {};
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { message: errorText };
        }

        throw new Error(
          error.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return result.data;
    } catch (error) {
      console.error("[LinearAPI] Network/Request Error:", error);
      throw error;
    }
  },

  /**
   * 带重试的 GraphQL 请求
   */
  async requestWithRetry(query, variables = {}, retries = 0, tokenOverride = null) {
    try {
      return await this.requestGraphQL(query, variables, tokenOverride);
    } catch (error) {
      if (retries < this.config.maxRetries) {
        log(
          `Retry ${retries + 1}/${this.config.maxRetries} after error:`,
          error.message
        );

        // 指数退避
        const delay = this.config.retryDelay * Math.pow(2, retries);
        await this.sleep(delay);

        return this.requestWithRetry(query, variables, retries + 1, tokenOverride);
      }

      throw error;
    }
  },

  /**
   * 验证 Token 是否有效
   */
  async validateToken(token) {
    if (!token) {
      return {
        valid: false,
        error: "Token 不能为空",
      };
    }

    // 检查Token格式
    if (token.length < 20) {
      return {
        valid: false,
        error: "Token 格式不正确，长度太短。请确保使用正确的 Linear API Key。",
      };
    }

    // 预检查：提供Token格式提示
    if (!token.startsWith("lin_api_") && !token.startsWith("lin_")) {
      log("Warning: Token 可能格式不正确。Linear API Key 通常以 'lin_api_' 开头");
    }

    try {
      // 使用最简单的查询进行验证
      const query = `
        query {
          viewer {
            id
          }
        }
      `;

      await this.requestWithRetry(query, {}, 0, token);
      await this.setToken(token);

      return {
        valid: true,
      };
    } catch (error) {
      console.error("[LinearAPI] Token validation failed:", error);
      return {
        valid: false,
        error: error.message || "Token 验证失败",
      };
    }
  },

  /**
   * 获取团队列表
   */
  async getTeams() {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    return await this.requestWithRetry(query);
  },

  /**
   * 验证团队 ID 是否有效且可访问
   */
  async validateTeamId(teamId) {
    if (!teamId) {
      return {
        valid: false,
        error: "团队 ID 不能为空",
      };
    }

    // 检查UUID格式 (简单验证)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(teamId)) {
      return {
        valid: false,
        error: "团队 ID 格式不正确，应为 UUID 格式",
      };
    }

    try {
      const query = `
        query($teamId: String!) {
          team(id: $teamId) {
            id
            name
            key
          }
        }
      `;

      const result = await this.requestWithRetry(query, { teamId });

      if (result && result.team) {
        // 验证成功，保存团队ID
        await Storage.set(Storage.KEYS.LINEAR_TEAM_ID, teamId);
        return {
          valid: true,
          team: result.team,
        };
      } else {
        return {
          valid: false,
          error: "团队不存在或无权限访问",
        };
      }
    } catch (error) {
      console.error("[LinearAPI] Team validation failed:", error);
      return {
        valid: false,
        error: error.message || "团队验证失败",
      };
    }
  },

  /**
   * 检查 API 连接状态（完整验证）
   */
  async checkConnection() {
    try {
      log("Starting connection check...");
      
      // 1. 检查 Token
      const token = await Storage.getLinearToken();
      if (!token) {
        log("Connection check failed: No token");
        return {
          connected: false,
          status: "no_token",
          error: "未配置 Linear API Token"
        };
      }
      
      log("Token found, checking validity...");
      
      // 2. 检查团队 ID
      const teamId = await Storage.getLinearTeamId();
      if (!teamId) {
        log("Connection check failed: No team ID");
        return {
          connected: false,
          status: "no_team",
          error: "未配置团队 ID"
        };
      }
      
      log("Team ID found, testing API connection...");
      
      // 3. 实际测试 API 连接
      const query = `
        query {
          viewer {
            id
            name
            email
          }
        }
      `;
      
      const result = await this.requestWithRetry(query);
      
      if (result && result.viewer) {
        log("Connection check successful:", result.viewer);
        return {
          connected: true,
          status: "ok",
          viewer: result.viewer
        };
      } else {
        log("Connection check failed: Invalid response");
        return {
          connected: false,
          status: "invalid_response",
          error: "API 返回数据异常"
        };
      }
    } catch (error) {
      log("Connection check error:", error);
      return {
        connected: false,
        status: "error",
        error: error.message || "连接测试失败"
      };
    }
  },

  /**
   * 将推文同步到 Linear
   */
  async syncTweet(tweetData) {
    try {
      log("Syncing tweet to Linear:", tweetData.tweetId);

      // 获取配置
      const config = await Storage.getConfig();
      const teamId = await Storage.getLinearTeamId();

      if (!teamId) {
        throw new Error("未配置 Linear 团队 ID");
      }

      // 生成标题
      const title = this.generateTweetTitle(tweetData, config);

      // 格式化描述
      const description = this.formatTweetDescription(tweetData);

      // 创建 Issue
      const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              title
              description
              identifier
              url
              createdAt
            }
          }
        }
      `;

      const variables = {
        input: {
          title: title,
          description: description,
          teamId: teamId,
          labelIds: []
        }
      };

      const result = await this.requestWithRetry(mutation, variables);

      if (result?.issueCreate?.success) {
        log("Tweet synced successfully:", result.issueCreate.issue.identifier);
        return {
          success: true,
          data: result.issueCreate.issue
        };
      } else {
        throw new Error("Issue 创建失败");
      }
    } catch (error) {
      log("Failed to sync tweet:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * 生成推文标题
   */
  generateTweetTitle(tweet, config = {}) {
    const titleStyle = config.titleStyle || 'smart';
    const maxLength = config.titleMaxLength || 100;

    const { text, author } = tweet;

    // 智能标题生成
    if (text && text.trim()) {
      let title = text.trim().replace(/\s+/g, ' ');

      if (title.length > maxLength) {
        title = title.substring(0, maxLength).trim();
        const lastSpace = title.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) {
          title = title.substring(0, lastSpace);
        }
        title += '...';
      }

      const suffix = ` - ${author.name}`;
      if (title.length + suffix.length <= maxLength + 20) {
        title += suffix;
      }

      return title;
    }

    return `Tweet by ${author.name} (@${author.handle})`;
  },

  /**
   * 格式化推文描述
   */
  formatTweetDescription(tweet) {
    let description = `**来自 X.com 的推文**\n\n`;

    description += `**推文内容:**\n${tweet.text || '(无文本内容)'}\n\n`;

    description += `**推主:** ${tweet.author.name} (@${tweet.author.handle})\n\n`;

    description += `**发布时间:** ${new Date(tweet.timestamp).toLocaleString()}\n\n`;

    if (tweet.url) {
      description += `**原链接:** [查看推文](${tweet.url})\n\n`;
    }

    // 添加图片
    if (tweet.media?.images?.length > 0) {
      description += `**图片 (${tweet.media.images.length} 张):**\n\n`;
      tweet.media.images.forEach((imageUrl, index) => {
        if (imageUrl) {
          let displayUrl = imageUrl;
          if (imageUrl.includes('pbs.twimg.com') || imageUrl.includes('twimg.com')) {
            if (!imageUrl.includes('name=')) {
              displayUrl += '&name=large';
            }
          }
          description += `![图片 ${index + 1}](${displayUrl})\n\n`;
        }
      });
    }

    // 添加视频
    if (tweet.media?.videos?.length > 0) {
      description += `**视频 (${tweet.media.videos.length} 个):**\n\n`;
      tweet.media.videos.forEach((videoUrl, index) => {
        if (videoUrl) {
          description += `📹 [视频 ${index + 1}](${videoUrl})\n\n`;
        }
      });
    }

    description += `\n---\n*由 Aurora 扩展自动同步*`;

    return description;
  }
};

function log(...args) {
  if (DEBUG) console.log("[Aurora Background]", ...args);
}

// 跟踪正在处理和已处理的推文，避免重复同步
const inFlightTweetSyncs = new Set();
let syncedTweetsCache = null;

function normalizeSyncedTweets(rawValue) {
  if (!rawValue) {
    return new Set();
  }

  if (rawValue instanceof Set) {
    return new Set(Array.from(rawValue).filter(Boolean));
  }

  if (Array.isArray(rawValue)) {
    return new Set(rawValue.filter(Boolean));
  }

  if (typeof rawValue === "string") {
    return new Set([rawValue].filter(Boolean));
  }

  if (typeof rawValue === "object") {
    return new Set(Object.values(rawValue).filter(Boolean));
  }

  return new Set();
}

async function getSyncedTweetsSet() {
  if (syncedTweetsCache instanceof Set) {
    return syncedTweetsCache;
  }

  const storedValue = await Storage.get(Storage.KEYS.SYNCED_TWEETS);
  syncedTweetsCache = normalizeSyncedTweets(storedValue);
  return syncedTweetsCache;
}

async function persistSyncedTweetsSet(syncedSet) {
  const idsToPersist = Array.from(syncedSet).filter(Boolean);
  const stored = await Storage.set(Storage.KEYS.SYNCED_TWEETS, idsToPersist);
  if (stored === false) {
    throw new Error("Failed to persist synced tweets");
  }
  syncedTweetsCache = syncedSet;
}

// 同步状态
const syncState = {
  isSync: false,
  currentTweet: null,
};

/**
 * 处理新的点赞推文
 */
async function handleNewLikedPost(tweetData) {
  const tweetId = tweetData?.tweetId;
  log("Handling new liked post:", tweetId);

  if (!tweetId) {
    log("Skipping sync: missing tweetId in payload");
    return {
      success: false,
      error: "Missing tweetId",
      skipped: true,
    };
  }

  if (inFlightTweetSyncs.has(tweetId)) {
    log("Tweet sync already in progress, skipping:", tweetId);
    return {
      success: true,
      message: "Tweet sync already in progress",
      skipped: true,
    };
  }

  inFlightTweetSyncs.add(tweetId);

  try {
    const syncedTweetsSet = await getSyncedTweetsSet();
    if (syncedTweetsSet.has(tweetId)) {
      log("Tweet already synced (cache hit):", tweetId);
      return { success: true, message: "Tweet already synced", skipped: true };
    }

    // 同步到 Linear
    const result = await LinearAPI.syncTweet(tweetData);

    if (result.success) {
      log("✓ Successfully synced tweet to Linear:", tweetId);

      // 记录已同步的推文
      syncedTweetsSet.add(tweetId);
      try {
        await persistSyncedTweetsSet(syncedTweetsSet);
      } catch (storageError) {
        log("Failed to persist synced tweets cache:", storageError);
      }

      // 更新统计
      await updateSyncStats(tweetData, result.data);

      // 添加到最近帖子列表
      await addRecentPost(tweetData, result.data);

      // 通知 popup 更新
      notifyPopup({
        type: "SYNC_SUCCESS",
        payload: {
          tweetId,
          linearIssue: result.data
        }
      });

      return {
        success: true,
        message: "Tweet synced successfully",
        data: result.data
      };
    }

    log("✗ Failed to sync tweet:", result.error);

    notifyPopup({
      type: "SYNC_ERROR",
      payload: {
        tweetId,
        error: result.error
      }
    });

    return {
      success: false,
      error: result.error
    };
  } catch (error) {
    log("Error handling liked post:", error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    inFlightTweetSyncs.delete(tweetId);
  }
}

/**
 * 更新同步统计
 */
async function updateSyncStats(tweetData, linearIssue) {
  try {
    const stats = await Storage.get(Storage.KEYS.SYNC_STATS) || {
      totalSynced: 0,
      todaySynced: 0,
      lastSyncDate: null
    };

    // 检查是否是新的一天
    const today = new Date().toDateString();
    if (stats.lastSyncDate !== today) {
      stats.todaySynced = 0;
      stats.lastSyncDate = today;
    }

    // 更新统计
    stats.totalSynced++;
    stats.todaySynced++;

    await Storage.set(Storage.KEYS.SYNC_STATS, stats);
    log("Updated sync stats:", stats);
  } catch (error) {
    log("Error updating sync stats:", error);
  }
}

/**
 * 添加到最近帖子列表
 */
async function addRecentPost(tweetData, linearIssue) {
  try {
    const recentPosts = await Storage.get(Storage.KEYS.RECENT_POSTS) || [];

    // 添加新帖子（包含同步时间和 Linear 信息）
    const post = {
      ...tweetData,
      syncedAt: new Date().toISOString(),
      linearIssue: {
        id: linearIssue.id,
        identifier: linearIssue.identifier,
        url: linearIssue.url
      }
    };

    recentPosts.unshift(post);

    // 只保留最近 20 个
    if (recentPosts.length > 20) {
      recentPosts.splice(20);
    }

    await Storage.set(Storage.KEYS.RECENT_POSTS, recentPosts);
    log("Added to recent posts:", tweetData.tweetId);
  } catch (error) {
    log("Error adding recent post:", error);
  }
}

/**
 * 通知 popup 更新
 */
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup 可能未打开,忽略错误
  });
}

/**
 * 监听来自 content script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("Received message:", message.type);

  if (message.type === "NEW_LIKED_POST") {
    // 异步处理
    handleNewLikedPost(message.payload).then((result) => {
      sendResponse(result);
    });

    // 返回 true 表示异步响应
    return true;
  }

  if (message.type === "GET_SYNC_STATUS") {
    // 获取同步状态
    sendResponse({
      isSync: syncState.isSync,
      currentTweet: syncState.currentTweet,
    });
    return false;
  }

  if (message.type === "SET_LINEAR_TOKEN") {
    (async () => {
      try {
        const result = await LinearAPI.validateToken(message.token);

        if (result.valid) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: result.error });
        }
      } catch (error) {
        log("Failed to set Linear token:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "CHECK_LINEAR_CONNECTION") {
    // 检查 Linear 连接 - 使用完整验证
    (async () => {
      try {
        log("Checking Linear connection (full validation)...");
        const result = await LinearAPI.checkConnection();
        log("Connection check result:", result);
        sendResponse(result);
      } catch (error) {
        log("Error checking Linear connection:", error);
        sendResponse({
          connected: false,
          status: "error",
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_CONFIG") {
    // 获取扩展配置
    (async () => {
      try {
        const config = await Storage.getConfig();
        sendResponse(config);
      } catch (error) {
        log("Error getting config:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "SET_CONFIG") {
    // 设置扩展配置
    (async () => {
      try {
        await Storage.setConfig(message.config);
        const newConfig = await Storage.getConfig();
        log("Config updated:", newConfig);
        sendResponse({ success: true, config: newConfig });
      } catch (error) {
        log("Error setting config:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_LINEAR_TEAMS") {
    // 获取团队列表
    (async () => {
      try {
        log("Fetching Linear teams...");
        const result = await LinearAPI.getTeams();

        if (result && result.teams && result.teams.nodes) {
          log(`Found ${result.teams.nodes.length} teams`);
          sendResponse({
            success: true,
            teams: result.teams.nodes
          });
        } else {
          log("No teams found in response");
          sendResponse({
            success: false,
            error: "未找到团队数据"
          });
        }
      } catch (error) {
        log("Error fetching teams:", error);
        sendResponse({
          success: false,
          error: error.message || "获取团队列表失败"
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_LINEAR_TEAM") {
    // 获取当前配置的团队信息
    (async () => {
      try {
        const teamId = await Storage.get(Storage.KEYS.LINEAR_TEAM_ID);

        if (!teamId) {
          sendResponse({ success: false, error: "未配置团队 ID" });
          return;
        }

        // 查询团队详情
        const query = `
          query($teamId: String!) {
            team(id: $teamId) {
              id
              name
              key
            }
          }
        `;

        const result = await LinearAPI.requestWithRetry(query, { teamId });

        if (result && result.team) {
          sendResponse({
            success: true,
            teamId: result.team.id,
            teamName: result.team.name,
            teamKey: result.team.key
          });
        } else {
          sendResponse({
            success: false,
            error: "团队不存在"
          });
        }
      } catch (error) {
        log("Error getting team info:", error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "SET_LINEAR_TEAM") {
    // 设置团队配置
    (async () => {
      try {
        log("Setting Linear team:", message.teamId);
        const result = await LinearAPI.validateTeamId(message.teamId);

        if (result.valid) {
          log("Team validated successfully:", result.team);
          sendResponse({
            success: true,
            team: result.team
          });
        } else {
          log("Team validation failed:", result.error);
          sendResponse({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        log("Error setting team:", error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_DEBUG_INFO") {
    // 获取调试信息
    (async () => {
      try {
        log("Getting debug info...");

        // 获取存储数据
        const allData = await chrome.storage.local.get(null);
        const token = await Storage.getLinearToken();
        const teamId = await Storage.getLinearTeamId();

        // 计算存储使用情况
        const storageSize = JSON.stringify(allData).length;
        const maxStorageSize = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
        const storagePercentage = (storageSize / maxStorageSize) * 100;

        const debugInfo = {
          storage: {
            linearToken: token ? "已配置" : "未配置",
            linearTeamId: teamId ? "已配置" : "未配置",
            storageUsage: {
              bytes: storageSize,
              max: maxStorageSize,
              percentage: storagePercentage
            },
            queueSize: 0, // TODO: 实现队列大小统计
            allKeys: Object.keys(allData).sort()
          },
          config: allData.auroraConfig || {},
          timestamp: new Date().toISOString()
        };

        log("Debug info collected:", debugInfo);
        sendResponse(debugInfo);
      } catch (error) {
        log("Error getting debug info:", error);
        sendResponse({
          error: error.message,
          storage: {
            linearToken: "错误",
            linearTeamId: "错误",
            storageUsage: { bytes: 0, max: 0, percentage: 0 },
            queueSize: 0,
            allKeys: []
          }
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_SYNC_STATS") {
    // 获取同步统计
    (async () => {
      try {
        const stats = await Storage.get(Storage.KEYS.SYNC_STATS) || {
          totalSynced: 0,
          todaySynced: 0,
          lastSyncDate: null
        };

        // 检查是否是新的一天，如果是则重置今日统计
        const today = new Date().toDateString();
        if (stats.lastSyncDate !== today) {
          stats.todaySynced = 0;
        }

        sendResponse(stats);
      } catch (error) {
        log("Error getting sync stats:", error);
        sendResponse({
          totalSynced: 0,
          todaySynced: 0,
          lastSyncDate: null
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_RECENT_POSTS") {
    // 获取最近同步的帖子
    (async () => {
      try {
        const limit = message.limit || 10;
        const recentPosts = await Storage.get(Storage.KEYS.RECENT_POSTS) || [];

        // 返回指定数量的最近帖子
        sendResponse(recentPosts.slice(0, limit));
      } catch (error) {
        log("Error getting recent posts:", error);
        sendResponse([]);
      }
    })();
    return true;
  }

  return false;
});

/**
 * 扩展安装/更新时
 */
chrome.runtime.onInstalled.addListener((details) => {
  log("Extension installed/updated:", details.reason);

  if (details.reason === "install") {
    // 首次安装
    log("First time installation");

    // 可以打开欢迎页面或设置页面
    chrome.tabs.create({
      url: chrome.runtime.getURL("popup.html"),
    });
  }
});

/**
 * 扩展启动时
 */
chrome.runtime.onStartup.addListener(() => {
  log("Extension started");
});

log("Service worker initialized");
