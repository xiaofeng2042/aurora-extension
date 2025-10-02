/**
 * Background Service Worker - 后台服务
 * 处理推文同步、队列管理和错误重试
 */

// 导入共享模块(在 service worker 中需要使用 importScripts)
importScripts("../shared/storage.js", "../shared/linear_api.js");

const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log("[Aurora Background]", ...args);
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
  log("Handling new liked post:", tweetData.tweetId);

  try {
    // 1. 检查是否已同步
    const alreadySynced = await Storage.isTweetSynced(tweetData.tweetId);
    if (alreadySynced) {
      log("Tweet already synced, skipping:", tweetData.tweetId);
      return { success: true, skipped: true };
    }

    // 2. 检查是否有 Linear Token
    const token = await Storage.getLinearToken();
    if (!token) {
      log("Linear token not configured, adding to queue");
      await Storage.addToSyncQueue(tweetData);
      return {
        success: false,
        error: "Linear token not configured",
        queued: true,
      };
    }

    // 3. 同步到 Linear
    syncState.isSync = true;
    syncState.currentTweet = tweetData;

    const result = await LinearAPI.syncTweet(tweetData);

    if (result.success) {
      // 同步成功
      await Storage.markTweetSynced(tweetData.tweetId);
      await Storage.updateSyncStats(true);
      await Storage.addRecentPost(tweetData);

      log("Tweet synced successfully:", tweetData.tweetId);

      // 通知 popup 更新
      notifyPopup({ type: "SYNC_SUCCESS", tweet: tweetData });

      // 通知 content script 显示页面通知
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "SYNC_SUCCESS",
            payload: { tweetId: tweetData.tweetId }
          }).catch(() => {
            // 忽略错误，页面可能未加载 Aurora
          });
        }
      });

      syncState.isSync = false;
      syncState.currentTweet = null;

      return { success: true };
    } else {
      // 同步失败,加入队列等待重试
      await Storage.addToSyncQueue(tweetData);
      await Storage.updateSyncStats(false);

      log("Tweet sync failed, added to queue:", result.error);

      syncState.isSync = false;
      syncState.currentTweet = null;

      return {
        success: false,
        error: result.error,
        queued: true,
      };
    }
  } catch (error) {
    log("Error handling liked post:", error);

    syncState.isSync = false;
    syncState.currentTweet = null;

    // 加入队列等待重试
    await Storage.addToSyncQueue(tweetData);

    return {
      success: false,
      error: error.message,
      queued: true,
    };
  }
}

/**
 * 处理同步队列中的失败项目(重试)
 */
async function processQueuedTweets() {
  log("Processing queued tweets...");

  const queue = await Storage.getSyncQueue();

  if (queue.length === 0) {
    log("Queue is empty");
    return;
  }

  log(`Found ${queue.length} tweets in queue`);

  for (const item of queue) {
    // 检查重试次数
    if (item.retryCount >= 5) {
      log(`Max retries reached for tweet ${item.tweetId}, removing from queue`);
      await Storage.removeFromSyncQueue(item.tweetId);
      continue;
    }

    // 尝试同步
    const result = await LinearAPI.syncTweet(item);

    if (result.success) {
      // 成功,从队列移除
      await Storage.markTweetSynced(item.tweetId);
      await Storage.removeFromSyncQueue(item.tweetId);
      await Storage.updateSyncStats(true);
      await Storage.addRecentPost(item);

      log(`Queued tweet synced successfully: ${item.tweetId}`);
    } else {
      // 失败,增加重试计数
      await Storage.incrementRetryCount(item.tweetId);
      log(`Queued tweet sync failed: ${item.tweetId}, will retry later`);
    }

    // 添加延迟避免速率限制
    await new Promise((resolve) => setTimeout(resolve, 2000));
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

  if (message.type === "GET_SYNC_STATS") {
    // 获取同步统计
    Storage.getSyncStats().then((stats) => {
      sendResponse(stats);
    });
    return true;
  }

  if (message.type === "GET_RECENT_POSTS") {
    // 获取最近帖子
    Storage.getRecentPosts(message.limit || 5).then((posts) => {
      sendResponse(posts);
    });
    return true;
  }

  if (message.type === "PROCESS_QUEUE") {
    // 手动触发队列处理
    processQueuedTweets().then(() => {
      sendResponse({ success: true });
    });
    return true;
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
    // 检查 Linear 连接
    (async () => {
      try {
        log("Checking Linear connection...");
        const status = await LinearAPI.checkConnection();
        log("Linear connection status:", status);
        sendResponse(status);
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

  if (message.type === "GET_LINEAR_TEAMS") {
    // 获取 Linear 团队列表
    (async () => {
      try {
        log("Fetching Linear teams...");
        const teams = await LinearAPI.getTeams();
        log("Linear teams fetched:", teams);
        sendResponse({ teams: teams.teams.nodes });
      } catch (error) {
        log("Error fetching Linear teams:", error);
        sendResponse({
          teams: [],
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_LINEAR_TEAM") {
    // 获取当前配置的 Linear 团队
    (async () => {
      try {
        const teamId = await LinearAPI.getTeamId();
        if (teamId) {
          // 尝试获取团队详细信息
          try {
            const result = await LinearAPI.validateTeamId(teamId);
            if (result.valid && result.team) {
              sendResponse({
                teamId: teamId,
                teamName: result.team.name,
                teamKey: result.team.key
              });
            } else {
              sendResponse({ teamId: teamId });
            }
          } catch (error) {
            log("Error validating team:", error);
            sendResponse({ teamId: teamId });
          }
        } else {
          sendResponse(null);
        }
      } catch (error) {
        log("Error getting Linear team:", error);
        sendResponse({
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "SET_LINEAR_TEAM") {
    // 设置并验证 Linear 团队 ID
    (async () => {
      try {
        log("Setting Linear team:", message.teamId);
        const result = await LinearAPI.validateTeamId(message.teamId);

        if (result.valid) {
          sendResponse({
            success: true,
            team: result.team
          });
        } else {
          sendResponse({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        log("Failed to set Linear team:", error);
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
        const config = await Storage.getConfig();
        const installTimestamp = await Storage.getInstallTimestamp();

        const debugInfo = {
          timestamp: new Date().toISOString(),
          extensionId: chrome.runtime.id,
          storage: {
            linearToken: await Storage.getLinearToken() ? "已配置" : "未配置",
            linearTeamId: await LinearAPI.getTeamId() || "未配置",
            syncStats: await Storage.getSyncStats(),
            queueSize: (await Storage.getSyncQueue()).length,
            storageUsage: await Storage.getStorageUsage(),
            syncedTweetsCount: ((await Storage.get(Storage.KEYS.SYNCED_TWEETS)) || []).length
          },
          config: config,
          installTimestamp: installTimestamp,
          syncState: {
            isSync: syncState.isSync,
            currentTweet: syncState.currentTweet?.tweetId || null
          }
        };

        sendResponse(debugInfo);
      } catch (error) {
        log("Error getting debug info:", error);
        sendResponse({
          error: error.message,
          timestamp: new Date().toISOString()
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

  if (message.type === "CHECK_HISTORICAL_TWEET") {
    // 检查是否为历史推文
    (async () => {
      try {
        const { timestamp } = message.payload;
        const isHistorical = await Storage.isHistoricalTweet(timestamp);
        const shouldSyncHistorical = await Storage.shouldSyncHistoricalLikes();

        sendResponse({
          isHistorical,
          shouldSync: !isHistorical || shouldSyncHistorical
        });
      } catch (error) {
        log("Error checking historical tweet:", error);
        sendResponse({
          isHistorical: false,
          shouldSync: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.type === "CLEAR_SYNC_HISTORY") {
    // 清除同步历史
    (async () => {
      try {
        await Storage.clearSyncHistory();
        log("Sync history cleared");
        sendResponse({ success: true });
      } catch (error) {
        log("Error clearing sync history:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  return false;
});

/**
 * 定期处理队列(每 5 分钟)
 */
chrome.alarms.create("processQueue", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "processQueue") {
    log("Alarm triggered: processQueue");
    processQueuedTweets();
  }
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

  // 检查是否有待处理的队列
  Storage.getSyncQueue().then((queue) => {
    if (queue.length > 0) {
      log(`Found ${queue.length} tweets in queue on startup`);
      processQueuedTweets();
    }
  });
});

log("Service worker initialized");
