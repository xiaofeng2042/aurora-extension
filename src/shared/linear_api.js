/**
 * Linear API Client - 与 Linear 项目管理工具交互
 * 文档参考: https://linear.app/developers
 */

const LinearAPI = {
  BASE_URL: "https://api.linear.app",
  GRAPHQL_ENDPOINT: "https://api.linear.app/graphql",

  // 请求配置
  config: {
    timeout: 10000, // 10 秒超时
    maxRetries: 3, // 最大重试次数
    retryDelay: 1000, // 重试延迟(毫秒)
  },

  /**
   * 发送 GraphQL 查询
   */
  async requestGraphQL(query, variables = {}, tokenOverride = null) {
    const token = tokenOverride ?? (await this.getToken());

    console.log("[LinearAPI] Request details:", {
      endpoint: this.GRAPHQL_ENDPOINT,
      hasToken: !!token,
      tokenLength: token?.length,
      queryType: query.trim().split(' ')[0]
    });

    if (!token) {
      const error = "Linear API token not configured";
      console.error("[LinearAPI] Error:", error);
      throw new Error(error);
    }

    const requestBody = {
      query: query,
      variables: variables,
    };

    console.log("[LinearAPI] Sending request:", {
      url: this.GRAPHQL_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token.substring(0, 10)}...`
      },
      bodyPreview: {
        query: query.substring(0, 100) + "...",
        variables: variables
      }
    });

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

      console.log("[LinearAPI] Response status:", response.status, response.statusText);
      console.log("[LinearAPI] Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[LinearAPI] HTTP Error Response:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

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
      console.log("[LinearAPI] Response data:", result);

      if (result.errors) {
        console.error("[LinearAPI] GraphQL Errors:", result.errors);
        throw new Error(result.errors[0].message);
      }

      return result.data;
    } catch (error) {
      console.error("[LinearAPI] Network/Request Error:", {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
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
        console.log(
          `[LinearAPI] Retry ${retries + 1}/${this.config.maxRetries} after error:`,
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
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * 获取 Token
   */
  async getToken() {
    // 从 storage.js 获取
    if (typeof Storage !== "undefined") {
      return await Storage.getLinearToken();
    }
    // Fallback: 直接从 chrome.storage 获取
    const result = await chrome.storage.local.get("linearToken");
    return result.linearToken;
  },

  /**
   * 获取团队 ID
   */
  async getTeamId() {
    // 从 storage.js 获取
    if (typeof Storage !== "undefined") {
      return await Storage.getLinearTeamId();
    }
    // Fallback: 直接从 chrome.storage 获取
    const result = await chrome.storage.local.get("linearTeamId");
    return result.linearTeamId;
  },

  /**
   * 设置团队 ID
   */
  async setTeamId(teamId) {
    if (typeof Storage !== "undefined") {
      return await Storage.setLinearTeamId(teamId);
    }
    await chrome.storage.local.set({ linearTeamId: teamId });
    return true;
  },

  /**
   * 设置 Token
   */
  async setToken(token) {
    if (typeof Storage !== "undefined") {
      return await Storage.setLinearToken(token);
    }
    await chrome.storage.local.set({ linearToken: token });
    return true;
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
      console.log("[LinearAPI] Warning: Token 可能格式不正确。Linear API Key 通常以 'lin_api_' 开头");
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
   * 获取用户信息
   */
  async getUserInfo() {
    const query = `
      query {
        viewer {
          id
          name
          email
        }
      }
    `;

    return await this.requestWithRetry(query);
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
        await this.setTeamId(teamId);
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
   * 创建 Issue
   * @param {Object} data - Issue 数据
   * @param {string} data.title - Issue 标题
   * @param {string} data.description - Issue 描述
   * @param {string} data.teamId - 团队 ID
   * @param {Array<string>} data.labels - 标签列表
   */
  async createIssue(data) {
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
        title: data.title || "Untitled Issue",
        description: data.description || "",
        teamId: data.teamId,
        labelIds: data.labelIds || [],
      },
    };

    const result = await this.requestWithRetry(mutation, variables);
    return result.issueCreate;
  },

  /**
   * 将 X.com 推文同步为 Linear Issue
   * @param {Object} tweet - 推文数据
   */
  async syncTweet(tweet) {
    try {
      // 获取配置信息
      const config = await this.getSyncConfig();

      // 生成智能标题
      const title = await this.generateTweetTitle(tweet, config);

      // 格式化推文数据为 Linear Issue
      const issueData = {
        title: title,
        description: this.formatTweetDescription(tweet),
        teamId: await this.getDefaultTeamId(),
        labelIds: await this.getTwitterLabels(tweet, config),
      };

      // 创建 Issue
      const result = await this.createIssue(issueData);

      console.log("[LinearAPI] Tweet synced successfully:", tweet.tweetId);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error("[LinearAPI] Failed to sync tweet:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * 格式化推文描述
   */
  formatTweetDescription(tweet) {
    let description = `**来自 X.com 的推文**\n\n`;

    description += `**推文内容:**\n${tweet.text}\n\n`;

    description += `**推主:** ${tweet.author.name} (@${tweet.author.handle})\n\n`;

    description += `**发布时间:** ${new Date(tweet.timestamp).toLocaleString()}\n\n`;

    if (tweet.url) {
      description += `**原链接:** [查看推文](${tweet.url})\n\n`;
    }

    // 添加图片展示
    if (tweet.media?.images?.length > 0) {
      description += `**图片 (${tweet.media.images.length} 张):**\n\n`;
      tweet.media.images.forEach((imageUrl, index) => {
        if (imageUrl) {
          // 确保图片 URL 是可访问的
          let displayUrl = imageUrl;

          // 如果是 X.com 图片，确保使用正确的格式
          if (imageUrl.includes('pbs.twimg.com') || imageUrl.includes('twimg.com')) {
            // 添加图片尺寸参数以获得更好的显示效果
            if (!imageUrl.includes('name=')) {
              displayUrl += '&name=large';
            }
          }

          description += `![图片 ${index + 1}](${displayUrl})\n\n`;
        }
      });
    }

    // 添加视频链接
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
  },

  /**
   * 获取默认团队 ID
   */
  async getDefaultTeamId() {
    // 1. 优先使用用户配置的团队ID
    const configuredTeamId = await this.getTeamId();
    if (configuredTeamId) {
      console.log("[LinearAPI] Using configured team ID:", configuredTeamId);
      return configuredTeamId;
    }

    // 2. 尝试从旧的存储位置获取
    const defaultTeamId = await this.getStoredDefaultTeamId();
    if (defaultTeamId) {
      console.log("[LinearAPI] Using default team ID from storage:", defaultTeamId);
      // 迁移到新的存储位置
      await this.setTeamId(defaultTeamId);
      return defaultTeamId;
    }

    // 3. 如果都没有，获取第一个团队
    console.log("[LinearAPI] No configured team, fetching teams...");
    const teams = await this.getTeams();
    if (teams.teams.nodes.length > 0) {
      const firstTeamId = teams.teams.nodes[0].id;
      console.log("[LinearAPI] Using first available team:", teams.teams.nodes[0].name);
      await this.setTeamId(firstTeamId);
      return firstTeamId;
    }

    throw new Error("未找到可用的团队。请在设置中配置团队 ID 或确保您有团队访问权限。");
  },

  /**
   * 生成推文标题
   * @param {Object} tweet - 推文数据
   * @param {Object} config - 配置选项
   */
  async generateTweetTitle(tweet, config = {}) {
    const titleStyle = config.titleStyle || 'smart';
    const maxLength = config.titleMaxLength || 100;

    // 根据配置选择标题生成方式
    switch (titleStyle) {
      case 'content':
        return this.generateContentTitle(tweet, maxLength);
      case 'author':
        return this.generateAuthorTitle(tweet);
      case 'smart':
      default:
        return this.generateSmartTitle(tweet, maxLength);
    }
  },

  /**
   * 智能生成标题（内容优先）
   */
  generateSmartTitle(tweet, maxLength = 100) {
    const { text, author } = tweet;

    // 如果推文内容不为空，优先使用内容摘要
    if (text && text.trim()) {
      let title = text.trim();

      // 移除多余的空白字符
      title = title.replace(/\s+/g, ' ');

      // 截取合适长度
      if (title.length > maxLength) {
        // 尝试在句号、感叹号或问号处截断
        const breakPoints = /[。！？.!?]/;
        const match = title.match(breakPoints);
        if (match && match.index < maxLength - 10) {
          title = title.substring(0, match.index + 1);
        } else {
          // 在空格处截断，避免截断单词
          title = title.substring(0, maxLength).trim();
          const lastSpace = title.lastIndexOf(' ');
          if (lastSpace > maxLength * 0.7) {
            title = title.substring(0, lastSpace);
          }
          title += '...';
        }
      }

      // 添加作者信息后缀（如果空间允许）
      const suffix = ` - ${author.name}`;
      if (title.length + suffix.length <= maxLength + 20) {
        title += suffix;
      }

      return title;
    }

    // 如果没有内容，使用作者名
    return `Tweet by ${author.name} (@${author.handle})`;
  },

  /**
   * 基于内容生成标题
   */
  generateContentTitle(tweet, maxLength = 100) {
    const { text, author } = tweet;

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

      return title;
    }

    return `Tweet by ${author.name}`;
  },

  /**
   * 基于作者生成标题
   */
  generateAuthorTitle(tweet) {
    const { author, text } = tweet;
    let title = `Tweet by ${author.name} (@${author.handle})`;

    // 如果有内容且空间允许，添加内容预览
    if (text && text.trim()) {
      const preview = text.trim().substring(0, 50);
      if (preview.length < text.trim().length) {
        title += `: ${preview}...`;
      } else {
        title += `: ${preview}`;
      }
    }

    return title;
  },

  /**
   * 获取同步配置
   */
  async getSyncConfig() {
    // 从 storage 获取配置
    if (typeof Storage !== "undefined") {
      return await Storage.getSyncConfig();
    }

    // 默认配置
    const result = await chrome.storage.local.get("syncConfig");
    return result.syncConfig || {
      titleStyle: 'smart',
      titleMaxLength: 100,
      enableSmartLabels: true,
      labelCategories: ['technology', 'business', 'entertainment', 'sports', 'politics', 'science']
    };
  },

  /**
   * 获取 Twitter 相关标签
   */
  async getTwitterLabels(tweet, config = {}) {
    if (!config.enableSmartLabels) {
      return [];
    }

    const labels = [];

    // 基于推文内容生成标签
    if (tweet.text && config.labelCategories) {
      const contentLabels = this.extractContentLabels(tweet.text, config.labelCategories);
      labels.push(...contentLabels);
    }

    // 添加媒体类型标签
    if (tweet.media) {
      const mediaLabels = this.extractMediaLabels(tweet.media);
      labels.push(...mediaLabels);
    }

    // 获取或创建对应的 Linear 标签
    return await this.getOrCreateLabels(labels);
  },

  /**
   * 从推文内容中提取标签关键词
   */
  extractContentLabels(text, categories) {
    const labels = [];
    const lowerText = text.toLowerCase();

    // 定义关键词映射
    const keywordMap = {
      'technology': ['tech', 'code', 'programming', 'software', 'ai', '开发', '技术', '编程', '人工智能'],
      'business': ['business', 'startup', 'finance', 'economy', '市场', '商业', '创业', '经济'],
      'entertainment': ['movie', 'music', 'game', 'entertainment', '电影', '音乐', '游戏', '娱乐'],
      'sports': ['sport', 'game', 'match', '运动员', '体育', '比赛'],
      'politics': ['politics', 'government', 'policy', '政治', '政府', '政策'],
      'science': ['science', 'research', 'study', '科学', '研究', '学术']
    };

    for (const [category, keywords] of Object.entries(keywordMap)) {
      if (categories.includes(category)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            labels.push(category);
            break;
          }
        }
      }
    }

    return [...new Set(labels)]; // 去重
  },

  /**
   * 从媒体信息中提取标签
   */
  extractMediaLabels(media) {
    const labels = [];

    if (media.images && media.images.length > 0) {
      labels.push('images');
      if (media.images.length > 1) {
        labels.push('gallery');
      }
    }

    if (media.videos && media.videos.length > 0) {
      labels.push('video');
    }

    return labels;
  },

  /**
   * 获取或创建 Linear 标签
   */
  async getOrCreateLabels(labelNames) {
    const labelIds = [];

    for (const labelName of labelNames) {
      try {
        // 首先尝试查找已存在的标签
        const existingLabel = await this.findLabelByName(labelName);
        if (existingLabel) {
          labelIds.push(existingLabel.id);
          continue;
        }

        // 如果标签不存在，创建新标签
        const newLabel = await this.createLabel(labelName);
        if (newLabel) {
          labelIds.push(newLabel.id);
        }
      } catch (error) {
        console.warn(`[LinearAPI] Failed to get/create label: ${labelName}`, error);
      }
    }

    return labelIds;
  },

  /**
   * 查找指定名称的标签
   */
  async findLabelByName(name) {
    const query = `
      query($teamId: String!) {
        team(id: $teamId) {
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    try {
      const teamId = await this.getDefaultTeamId();
      const result = await this.requestWithRetry(query, { teamId });

      if (result?.team?.labels?.nodes) {
        return result.team.labels.nodes.find(label =>
          label.name.toLowerCase() === name.toLowerCase()
        );
      }
    } catch (error) {
      console.warn(`[LinearAPI] Error finding label: ${name}`, error);
    }

    return null;
  },

  /**
   * 创建新标签
   */
  async createLabel(name) {
    const mutation = `
      mutation LabelCreate($input: LabelCreateInput!) {
        labelCreate(input: $input) {
          success
          label {
            id
            name
            color
          }
        }
      }
    `;

    try {
      const teamId = await this.getDefaultTeamId();
      const variables = {
        input: {
          name: name,
          teamId: teamId,
          color: this.getRandomLabelColor()
        }
      };

      const result = await this.requestWithRetry(mutation, variables);

      if (result?.labelCreate?.success) {
        console.log(`[LinearAPI] Created label: ${name}`);
        return result.labelCreate.label;
      }
    } catch (error) {
      console.warn(`[LinearAPI] Error creating label: ${name}`, error);
    }

    return null;
  },

  /**
   * 获取随机标签颜色
   */
  getRandomLabelColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    return colors[Math.floor(Math.random() * colors.length)];
  },

  /**
   * 存储默认团队 ID
   */
  async storeDefaultTeamId(teamId) {
    await chrome.storage.local.set({ defaultLinearTeamId: teamId });
  },

  /**
   * 获取存储的默认团队 ID
   */
  async getStoredDefaultTeamId() {
    const result = await chrome.storage.local.get("defaultLinearTeamId");
    return result.defaultLinearTeamId;
  },

  /**
   * 批量同步推文
   */
  async syncTweets(tweets) {
    const results = [];

    for (const tweet of tweets) {
      // 添加随机延迟,避免速率限制
      await this.sleep(500 + Math.random() * 1000);

      const result = await this.syncTweet(tweet);
      results.push({
        tweetId: tweet.tweetId,
        ...result,
      });
    }

    return results;
  },

  /**
   * 获取最近创建的 Issues
   */
  async getRecentIssues(limit = 20) {
    const query = `
      query GetRecentIssues($limit: Int!) {
        issues(first: $limit, orderBy: "createdAt") {
          nodes {
            id
            title
            description
            identifier
            url
            createdAt
            state {
              name
            }
          }
        }
      }
    `;

    const variables = { limit };
    const result = await this.requestWithRetry(query, variables);
    return result.issues.nodes;
  },

  /**
   * 检查 API 连接状态
   */
  async checkConnection() {
    try {
      await this.getUserInfo();
      return {
        connected: true,
        status: "ok",
      };
    } catch (error) {
      return {
        connected: false,
        status: "error",
        error: error.message,
      };
    }
  },
};

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = LinearAPI;
}