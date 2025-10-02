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
};

// 导出(支持不同的模块系统)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
}
