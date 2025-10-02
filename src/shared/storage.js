/**
 * Storage - 本地存储封装
 * 使用 Chrome Storage API 管理扩展数据
 */

const Storage = {
  // 存储键名常量
  KEYS: {
    SYNCED_TWEETS: "syncedTweets", // 已同步的推文 ID 集合
    SYNC_STATS: "syncStats", // 同步统计信息
    LINEAR_TOKEN: "linearToken", // Linear API Token
    LINEAR_TEAM_ID: "linearTeamId", // Linear 团队 ID
    RECENT_POSTS: "recentPosts", // 最近同步的帖子(用于显示)
    SYNC_QUEUE: "syncQueue", // 待同步队列(失败重试用)
    INSTALL_TIMESTAMP: "installTimestamp", // 扩展安装时间戳
    SYNC_HISTORICAL_LIKES: "syncHistoricalLikes", // 是否同步历史点赞
    CONFIG: "auroraConfig", // 扩展配置
  },

  /**
   * 获取存储的值
   */
  async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error(`[Storage] Error getting ${key}:`, error);
      return null;
    }
  },

  /**
   * 设置存储的值
   */
  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`[Storage] Error setting ${key}:`, error);
      return false;
    }
  },

  /**
   * 批量获取多个值
   */
  async getMultiple(keys) {
    try {
      const result = await chrome.storage.local.get(keys);
      return result;
    } catch (error) {
      console.error("[Storage] Error getting multiple keys:", error);
      return {};
    }
  },

  /**
   * 批量设置多个值
   */
  async setMultiple(items) {
    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (error) {
      console.error("[Storage] Error setting multiple keys:", error);
      return false;
    }
  },

  /**
   * 删除存储的值
   */
  async remove(key) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (error) {
      console.error(`[Storage] Error removing ${key}:`, error);
      return false;
    }
  },

  /**
   * 清空所有存储
   */
  async clear() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error("[Storage] Error clearing storage:", error);
      return false;
    }
  },

  // === 业务方法 ===

  /**
   * 检查推文是否已同步
   */
  async isTweetSynced(tweetId) {
    const syncedTweets = (await this.get(this.KEYS.SYNCED_TWEETS)) || [];
    return syncedTweets.includes(tweetId);
  },

  /**
   * 标记推文为已同步
   */
  async markTweetSynced(tweetId) {
    const syncedTweets = (await this.get(this.KEYS.SYNCED_TWEETS)) || [];
    if (!syncedTweets.includes(tweetId)) {
      syncedTweets.push(tweetId);
      await this.set(this.KEYS.SYNCED_TWEETS, syncedTweets);
    }
  },

  /**
   * 获取同步统计信息
   */
  async getSyncStats() {
    const stats = await this.get(this.KEYS.SYNC_STATS);
    return (
      stats || {
        totalSynced: 0,
        successCount: 0,
        failureCount: 0,
        lastSyncTime: null,
        todaySynced: 0,
        lastResetDate: new Date().toDateString(),
      }
    );
  },

  /**
   * 更新同步统计
   */
  async updateSyncStats(success = true) {
    const stats = await this.getSyncStats();

    // 检查是否需要重置今日统计
    const today = new Date().toDateString();
    if (stats.lastResetDate !== today) {
      stats.todaySynced = 0;
      stats.lastResetDate = today;
    }

    // 更新统计
    stats.lastSyncTime = new Date().toISOString();
    stats.todaySynced += 1;

    if (success) {
      stats.totalSynced += 1;
      stats.successCount += 1;
    } else {
      stats.failureCount += 1;
    }

    await this.set(this.KEYS.SYNC_STATS, stats);
    return stats;
  },

  /**
   * 获取 Linear API Token
   */
  async getLinearToken() {
    return await this.get(this.KEYS.LINEAR_TOKEN);
  },

  /**
   * 设置 Linear API Token
   */
  async setLinearToken(token) {
    return await this.set(this.KEYS.LINEAR_TOKEN, token);
  },

  /**
   * 获取 Linear 团队 ID
   */
  async getLinearTeamId() {
    return await this.get(this.KEYS.LINEAR_TEAM_ID);
  },

  /**
   * 设置 Linear 团队 ID
   */
  async setLinearTeamId(teamId) {
    return await this.set(this.KEYS.LINEAR_TEAM_ID, teamId);
  },

  /**
   * 添加到最近帖子列表(用于 popup 显示)
   */
  async addRecentPost(post) {
    const recentPosts = (await this.get(this.KEYS.RECENT_POSTS)) || [];

    // 添加到列表开头
    recentPosts.unshift({
      ...post,
      syncedAt: new Date().toISOString(),
    });

    // 只保留最近 10 条
    const trimmedPosts = recentPosts.slice(0, 10);

    await this.set(this.KEYS.RECENT_POSTS, trimmedPosts);
    return trimmedPosts;
  },

  /**
   * 获取最近帖子列表
   */
  async getRecentPosts(limit = 5) {
    const recentPosts = (await this.get(this.KEYS.RECENT_POSTS)) || [];
    return recentPosts.slice(0, limit);
  },

  /**
   * 添加到同步队列(失败重试用)
   */
  async addToSyncQueue(post) {
    const queue = (await this.get(this.KEYS.SYNC_QUEUE)) || [];
    queue.push({
      ...post,
      addedAt: new Date().toISOString(),
      retryCount: 0,
    });
    await this.set(this.KEYS.SYNC_QUEUE, queue);
  },

  /**
   * 获取同步队列
   */
  async getSyncQueue() {
    return (await this.get(this.KEYS.SYNC_QUEUE)) || [];
  },

  /**
   * 从同步队列移除
   */
  async removeFromSyncQueue(tweetId) {
    const queue = (await this.get(this.KEYS.SYNC_QUEUE)) || [];
    const filtered = queue.filter((item) => item.tweetId !== tweetId);
    await this.set(this.KEYS.SYNC_QUEUE, filtered);
  },

  /**
   * 更新队列中项目的重试次数
   */
  async incrementRetryCount(tweetId) {
    const queue = (await this.get(this.KEYS.SYNC_QUEUE)) || [];
    const updated = queue.map((item) => {
      if (item.tweetId === tweetId) {
        return { ...item, retryCount: (item.retryCount || 0) + 1 };
      }
      return item;
    });
    await this.set(this.KEYS.SYNC_QUEUE, updated);
  },

  /**
   * 获取存储使用情况
   */
  async getStorageUsage() {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      return {
        used: usage,
        quota: chrome.storage.local.QUOTA_BYTES,
        percentage: (usage / chrome.storage.local.QUOTA_BYTES) * 100,
      };
    } catch (error) {
      console.error("[Storage] Error getting storage usage:", error);
      return null;
    }
  },

  // === 配置管理 ===

  /**
   * 获取扩展配置
   */
  async getConfig() {
    const config = await this.get(this.KEYS.CONFIG);
    return {
      // 默认配置
      syncHistoricalLikes: false,
      maxSyncedTweetsCache: 1000,
      cleanupDays: 30,
      enableNotifications: true,
      ...config
    };
  },

  /**
   * 设置扩展配置
   */
  async setConfig(config) {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...config };
    return await this.set(this.KEYS.CONFIG, newConfig);
  },

  /**
   * 获取安装时间戳
   */
  async getInstallTimestamp() {
    let timestamp = await this.get(this.KEYS.INSTALL_TIMESTAMP);
    if (!timestamp) {
      timestamp = Date.now();
      await this.set(this.KEYS.INSTALL_TIMESTAMP, timestamp);
      console.log("[Storage] Set install timestamp:", timestamp);
    }
    return timestamp;
  },

  /**
   * 检查是否应该同步历史点赞
   */
  async shouldSyncHistoricalLikes() {
    const config = await this.getConfig();
    return config.syncHistoricalLikes === true;
  },

  /**
   * 检查推文是否为历史推文（在安装前点赞的）
   */
  async isHistoricalTweet(tweetTimestamp) {
    const installTimestamp = await this.getInstallTimestamp();
    return new Date(tweetTimestamp).getTime() < installTimestamp;
  },

  /**
   * 清理旧的同步记录（LRU策略）
   */
  async cleanupSyncedTweets() {
    const config = await this.getConfig();
    const syncedTweets = (await this.get(this.KEYS.SYNCED_TWEETS)) || [];

    // 如果记录数量少于限制，不需要清理
    if (syncedTweets.length <= config.maxSyncedTweetsCache) {
      return;
    }

    // 获取最近同步的帖子列表，按同步时间排序
    const recentPosts = (await this.get(this.KEYS.RECENT_POSTS)) || [];

    // 保留最近同步的推文ID
    const recentTweetIds = recentPosts
      .sort((a, b) => new Date(b.syncedAt) - new Date(a.syncedAt))
      .slice(0, config.maxSyncedTweetsCache)
      .map(post => post.tweetId);

    // 过滤掉不在最近列表中的推文
    const filteredSyncedTweets = syncedTweets.filter(id => recentTweetIds.includes(id));

    await this.set(this.KEYS.SYNCED_TWEETS, filteredSyncedTweets);
    console.log(`[Storage] Cleaned up synced tweets: ${syncedTweets.length} -> ${filteredSyncedTweets.length}`);
  },

  /**
   * 清除所有同步记录
   */
  async clearSyncHistory() {
    await Promise.all([
      this.remove(this.KEYS.SYNCED_TWEETS),
      this.remove(this.KEYS.RECENT_POSTS),
      this.remove(this.KEYS.SYNC_QUEUE),
      this.remove(this.KEYS.SYNC_STATS),
      this.remove(this.KEYS.INSTALL_TIMESTAMP)
    ]);

    // 重新设置安装时间戳
    await this.getInstallTimestamp();
    console.log("[Storage] Sync history cleared");
  },

  /**
   * 检查扩展运行时上下文是否有效
   */
  isRuntimeValid() {
    try {
      return chrome?.runtime?.id !== undefined;
    } catch (error) {
      return false;
    }
  },

  /**
   * 安全地发送消息到背景脚本，带重试机制
   */
  async sendMessageSafely(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
      // 检查运行时上下文是否有效
      if (!this.isRuntimeValid()) {
        console.warn(`[Storage] Extension context invalid, retry attempt ${i + 1}/${retries}`);

        if (i < retries - 1) {
          // 指数退避等待
          await this.sleep(1000 * Math.pow(2, i));
          continue;
        }

        throw new Error("Extension context invalidated - please reload the page");
      }

      try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
      } catch (error) {
        if (error.message.includes("Extension context invalidated") && i < retries - 1) {
          console.warn(`[Storage] Context invalidated, waiting before retry ${i + 1}/${retries}`);
          await this.sleep(1000 * Math.pow(2, i));
        } else {
          throw error;
        }
      }
    }

    throw new Error("Failed to send message after retries");
  },

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

// 导出(支持不同的模块系统)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
}
