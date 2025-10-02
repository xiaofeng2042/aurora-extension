/**
 * Page Script - 运行在 X.com 页面环境中
 * 监听用户点赞动作并抓取贴文数据
 */

(function () {
  const seenTweets = new Set();
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log("[Aurora Page Script]", ...args);
  }

  /**
   * 从贴文 DOM 元素中提取数据
   */
  function extractTweetData(tweetElement) {
    try {
      // 提取贴文链接和 ID
      const linkElement = tweetElement.querySelector('a[href*="/status/"]');
      if (!linkElement) return null;

      const statusUrl = new URL(linkElement.href, window.location.origin);
      const pathParts = statusUrl.pathname.split("/");
      const tweetId = pathParts[pathParts.length - 1];

      if (!tweetId || seenTweets.has(tweetId)) return null;

      // 提取作者信息
      const userNameElement = tweetElement.querySelector(
        'div[data-testid="User-Name"]'
      );
      const authorName =
        userNameElement?.querySelector('span')?.innerText || "Unknown";
      const authorHandle =
        userNameElement?.querySelector('a[href^="/"]')?.href.split("/").pop() ||
        "";

      // 提取贴文正文
      const textElements = tweetElement.querySelectorAll(
        'div[data-testid="tweetText"] span'
      );
      const text = Array.from(textElements)
        .map((span) => span.innerText)
        .join("");

      // 提取时间戳
      const timeElement = tweetElement.querySelector("time");
      const timestamp = timeElement?.getAttribute("datetime") || new Date().toISOString();

      // 提取媒体信息
      const images = Array.from(
        tweetElement.querySelectorAll('img[src*="media"]')
      ).map((img) => img.src);

      const videos = Array.from(
        tweetElement.querySelectorAll('video[src]')
      ).map((video) => video.src);

      seenTweets.add(tweetId);

      return {
        tweetId,
        author: {
          name: authorName,
          handle: authorHandle,
        },
        text: text.trim(),
        timestamp,
        url: statusUrl.href,
        media: {
          images,
          videos,
        },
      };
    } catch (error) {
      log("Error extracting tweet data:", error);
      return null;
    }
  }

  /**
   * 发送贴文数据到 content script
   */
  function sendTweetData(tweetData) {
    window.postMessage(
      {
        type: "AURORA_LIKED_POST",
        payload: tweetData,
        source: "aurora-page-script",
      },
      "*"
    );
    log("Sent liked post:", tweetData.tweetId);
  }

  /**
   * 检查按钮是否为"已点赞"状态
   */
  function isLiked(likeButton) {
    const ariaLabel = likeButton.getAttribute("aria-label") || "";
    // X.com 的点赞按钮在点赞后 aria-label 会变为 "Unlike" 或包含 "已赞"
    return (
      ariaLabel.toLowerCase().includes("unlike") ||
      ariaLabel.includes("已赞") ||
      likeButton.querySelector('[data-testid="unlike"]') !== null
    );
  }

  /**
   * 监听点赞按钮的点击事件
   */
  function observeLikeButtons() {
    // 使用事件委托监听整个 document 的点击
    document.addEventListener(
      "click",
      (event) => {
        // 查找点击目标是否是点赞按钮或其子元素
        const likeButton = event.target.closest(
          'button[data-testid="like"], button[data-testid="unlike"]'
        );

        if (!likeButton) return;

        // 延迟检查状态,确保 DOM 已更新
        setTimeout(() => {
          // 如果点击后变成已点赞状态,则处理
          if (isLiked(likeButton)) {
            // 向上查找包含完整贴文的容器
            const tweetElement = likeButton.closest("article");
            if (!tweetElement) return;

            const tweetData = extractTweetData(tweetElement);
            if (tweetData) {
              sendTweetData(tweetData);
            }
          }
        }, 300);
      },
      true // 使用捕获阶段确保能捕获到事件
    );

    log("Like button observer initialized");
  }

  /**
   * Fallback: 定期扫描页面上已点赞的贴文
   * 用于捕获页面加载时已存在的点赞贴文
   */
  function scanExistingLikes() {
    const unlikeButtons = document.querySelectorAll(
      'button[data-testid="unlike"]'
    );

    unlikeButtons.forEach((button) => {
      const tweetElement = button.closest("article");
      if (!tweetElement) return;

      const tweetData = extractTweetData(tweetElement);
      if (tweetData) {
        sendTweetData(tweetData);
      }
    });

    log(`Scanned ${unlikeButtons.length} existing liked tweets`);
  }

  /**
   * 使用 MutationObserver 监听新加载的内容
   */
  function observeNewContent() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          // 检查新加载的贴文中是否有已点赞的
          const unlikeButtons = node.querySelectorAll?.(
            'button[data-testid="unlike"]'
          );
          unlikeButtons?.forEach((button) => {
            const tweetElement = button.closest("article");
            if (!tweetElement) return;

            const tweetData = extractTweetData(tweetElement);
            if (tweetData) {
              sendTweetData(tweetData);
            }
          });
        });
      }
    });

    // 监听时间线容器
    const waitForTimeline = setInterval(() => {
      const timeline = document.querySelector(
        'div[data-testid="primaryColumn"]'
      );
      if (timeline) {
        clearInterval(waitForTimeline);
        observer.observe(timeline, { childList: true, subtree: true });
        log("Timeline observer initialized");
      }
    }, 1000);
  }

  /**
   * 初始化
   */
  function init() {
    log("Initializing...");

    // 等待页面加载完成
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }

    // 监听点赞按钮点击
    observeLikeButtons();

    // 监听新内容加载
    observeNewContent();

    // 延迟扫描现有点赞(给页面时间渲染)
    setTimeout(scanExistingLikes, 2000);

    log("Initialized successfully");
  }

  init();
})();
