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
      log("开始提取贴文数据");

      // 更新选择器以适应 X.com 当前结构
      // 方法 1: 尝试多种可能的选择器
      let linkElement = null;
      const linkSelectors = [
        'a[href*="/status/"]',
        '[role="link"][href*="/status/"]',
        'a[href*="/x/status/"]',
        '[data-testid="tweet"] a[href*="/status/"]'
      ];

      for (const selector of linkSelectors) {
        linkElement = tweetElement.querySelector(selector);
        if (linkElement) {
          log(`找到链接元素: ${selector}`);
          break;
        }
      }

      if (!linkElement) {
        log("未找到贴文链接元素");
        return null;
      }

      const statusUrl = new URL(linkElement.href, window.location.origin);
      const pathParts = statusUrl.pathname.split("/");
      const tweetId = pathParts[pathParts.length - 1];

      if (!tweetId) {
        log("未找到贴文 ID");
        return null;
      }

      if (seenTweets.has(tweetId)) {
        log(`贴文已处理: ${tweetId}`);
        return null;
      }

      // 更新作者信息选择器
      let userNameElement = null;
      const userNameSelectors = [
        'div[data-testid="User-Name"]',
        '[data-testid="User-Name"]',
        'div[data-testid="UserScreenName"]',
        '[data-testid="user-name"]',
        'div[role="group"] span span'
      ];

      for (const selector of userNameSelectors) {
        userNameElement = tweetElement.querySelector(selector);
        if (userNameElement) {
          log(`找到用户名元素: ${selector}`);
          break;
        }
      }

      let authorName = "Unknown";
      let authorHandle = "";

      if (userNameElement) {
        // 尝试多种方法获取用户名
        authorName = userNameElement.querySelector('span')?.innerText ||
                    userNameElement.innerText ||
                    "Unknown";

        // 尝试多种方法获取用户handle
        const handleElement = userNameElement.querySelector('a[href^="/"]') ||
                            tweetElement.querySelector('a[href^="/"]');
        if (handleElement) {
          authorHandle = handleElement.href.split("/").pop() || "";
        }
      }

      // 更新贴文正文选择器
      let text = "";
      const textSelectors = [
        'div[data-testid="tweetText"]',
        '[data-testid="tweetText"]',
        'div[lang]', // 多语言推文
        'div[role="presentation"] span'
      ];

      for (const selector of textSelectors) {
        const textElement = tweetElement.querySelector(selector);
        if (textElement) {
          // 尝试多种方法获取文本
          text = textElement.innerText ||
                 Array.from(textElement.querySelectorAll('span')).map(s => s.innerText).join('') ||
                 textElement.textContent ||
                 "";
          if (text.trim()) {
            log(`找到贴文文本: ${selector}`);
            break;
          }
        }
      }

      // 提取时间戳
      const timeElement = tweetElement.querySelector("time");
      const timestamp = timeElement?.getAttribute("datetime") || new Date().toISOString();

      // 提取媒体信息 - 更新选择器
      const imageSelectors = [
        'img[src*="media"]',
        'img[alt*="Image"]',
        '[data-testid="tweetPhoto"] img'
      ];

      const videoSelectors = [
        'video[src]',
        '[data-testid="videoPlayer"]',
        '[data-testid="videoComponent"] video'
      ];

      let images = [];
      let videos = [];

      // 尝试多种图片选择器
      for (const selector of imageSelectors) {
        const imgElements = tweetElement.querySelectorAll(selector);
        if (imgElements.length > 0) {
          images = Array.from(imgElements).map(img => img.src).filter(Boolean);
          log(`找到 ${images.length} 张图片`);
          break;
        }
      }

      // 尝试多种视频选择器
      for (const selector of videoSelectors) {
        const videoElements = tweetElement.querySelectorAll(selector);
        if (videoElements.length > 0) {
          videos = Array.from(videoElements).map(video => video.src).filter(Boolean);
          log(`找到 ${videos.length} 个视频`);
          break;
        }
      }

      seenTweets.add(tweetId);

      const tweetData = {
        tweetId,
        author: {
          name: authorName.trim(),
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

      log(`成功提取贴文数据: ${tweetId}`, {
        author: tweetData.author.name,
        textLength: tweetData.text.length,
        mediaCount: tweetData.media.images.length + tweetData.media.videos.length
      });

      return tweetData;
    } catch (error) {
      log("提取贴文数据时出错:", error);
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
    try {
      // 多种方法检查点赞状态
      const ariaLabel = likeButton.getAttribute("aria-label") || "";

      // 方法 1: 检查 aria-label
      if (ariaLabel.toLowerCase().includes("unlike") ||
          ariaLabel.includes("已赞") ||
          ariaLabel.includes("Liked")) {
        log("通过 aria-label 检测到点赞状态");
        return true;
      }

      // 方法 2: 检查 data-testid
      if (likeButton.querySelector('[data-testid="unlike"]') ||
          likeButton.getAttribute('data-testid') === 'unlike') {
        log("通过 data-testid 检测到点赞状态");
        return true;
      }

      // 方法 3: 检查按钮内的 SVG 颜色或路径
      const svg = likeButton.querySelector('svg');
      if (svg) {
        // 检查 SVG 是否为红色（点赞后的颜色）
        const path = svg.querySelector('path');
        if (path) {
          const d = path.getAttribute('d');
          if (d && d.includes('M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.352-2.48-1.704-4.42-1.704-5.52')) {
            log("通过 SVG 路径检测到点赞状态");
            return true;
          }
        }
      }

      // 方法 4: 检查按钮的激活状态类
      if (likeButton.classList.contains('active') ||
          likeButton.classList.contains('liked') ||
          likeButton.classList.contains('r-14lw9ot')) {
        log("通过 CSS 类检测到点赞状态");
        return true;
      }

      return false;
    } catch (error) {
      log("检查点赞状态时出错:", error);
      return false;
    }
  }

  /**
   * 监听点赞按钮的点击事件
   */
  function observeLikeButtons() {
    log("初始化点赞按钮监听器");

    // 方法 1: 事件委托监听点击
    document.addEventListener(
      "click",
      (event) => {
        // 更新选择器以找到点赞按钮
        const likeButtonSelectors = [
          'button[data-testid="like"]',
          'button[data-testid="unlike"]',
          '[role="button"][aria-label*="Like"]',
          '[role="button"][aria-label*="Unlike"]',
          'div[role="button"][data-testid="like"]',
          'div[role="button"][data-testid="unlike"]'
        ];

        let likeButton = null;
        for (const selector of likeButtonSelectors) {
          likeButton = event.target.closest(selector);
          if (likeButton) {
            log(`找到点赞按钮: ${selector}`);
            break;
          }
        }

        if (!likeButton) return;

        log("检测到点赞按钮点击");

        // 增加延迟时间，确保 DOM 更新完成
        const delays = [200, 500, 800]; // 尝试多个延迟时间
        delays.forEach(delay => {
          setTimeout(() => {
            try {
              if (isLiked(likeButton)) {
                log("确认点赞状态，开始提取贴文数据");

                // 更新贴文容器选择器
                const tweetElementSelectors = [
                  "article",
                  '[data-testid="tweet"]',
                  '[role="article"]',
                  '[data-testid="tweetDetail"]'
                ];

                let tweetElement = null;
                for (const selector of tweetElementSelectors) {
                  tweetElement = likeButton.closest(selector);
                  if (tweetElement) {
                    log(`找到贴文容器: ${selector}`);
                    break;
                  }
                }

                if (!tweetElement) {
                  log("未找到贴文容器");
                  return;
                }

                const tweetData = extractTweetData(tweetElement);
                if (tweetData) {
                  sendTweetData(tweetData);
                } else {
                  log("提取贴文数据失败");
                }
              }
            } catch (error) {
              log(`检查点赞状态时出错 (${delay}ms 延迟):`, error);
            }
          }, delay);
        });
      },
      true // 使用捕获阶段确保能捕获到事件
    );

    // 方法 2: 监听鼠标抬起事件（备用）
    document.addEventListener("mouseup", (event) => {
      const likeButton = event.target.closest(
        'button[data-testid="like"], button[data-testid="unlike"], [role="button"][aria-label*="Like"]'
      );

      if (likeButton) {
        log("检测到鼠标抬起事件，准备检查点赞状态");
        // 更长的延迟，确保点击动画完成
        setTimeout(() => {
          if (isLiked(likeButton)) {
            log("通过鼠标抬起事件检测到点赞状态");
          }
        }, 1000);
      }
    }, true);

    log("点赞按钮监听器初始化完成");
  }

  /**
   * Fallback: 定期扫描页面上已点赞的贴文
   * 用于捕获页面加载时已存在的点赞贴文
   */
  function scanExistingLikes() {
    log("开始扫描现有点赞贴文");

    // 更新选择器以适应 X.com 当前结构
    const unlikeButtonSelectors = [
      'button[data-testid="unlike"]',
      '[role="button"][aria-label*="Unlike"]',
      'div[role="button"][data-testid="unlike"]'
    ];

    let totalScanned = 0;

    unlikeButtonSelectors.forEach(selector => {
      const buttons = document.querySelectorAll(selector);
      log(`找到 ${buttons.length} 个 ${selector} 按钮`);

      buttons.forEach((button) => {
        // 更新贴文容器选择器
        const tweetElementSelectors = [
          "article",
          '[data-testid="tweet"]',
          '[role="article"]'
        ];

        for (const tweetSelector of tweetElementSelectors) {
          const tweetElement = button.closest(tweetSelector);
          if (tweetElement) {
            const tweetData = extractTweetData(tweetElement);
            if (tweetData) {
              sendTweetData(tweetData);
            }
            break; // 找到容器后停止尝试其他选择器
          }
        }
        totalScanned++;
      });
    });

    log(`扫描完成，总共处理了 ${totalScanned} 个点赞按钮`);
  }

  /**
   * 使用 MutationObserver 监听新加载的内容
   */
  function observeNewContent() {
    log("初始化新内容监听器");

    const observer = new MutationObserver((mutations) => {
      let processedNodes = 0;

      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          processedNodes++;

          // 更新新内容的选择器
          const unlikeButtonSelectors = [
            'button[data-testid="unlike"]',
            '[role="button"][aria-label*="Unlike"]',
            'div[role="button"][data-testid="unlike"]'
          ];

          unlikeButtonSelectors.forEach(selector => {
            const unlikeButtons = node.querySelectorAll?.(selector);
            if (unlikeButtons && unlikeButtons.length > 0) {
              log(`在新增节点中找到 ${unlikeButtons.length} 个 ${selector} 按钮`);

              unlikeButtons.forEach((button) => {
                // 更新贴文容器选择器
                const tweetElementSelectors = [
                  "article",
                  '[data-testid="tweet"]',
                  '[role="article"]'
                ];

                for (const tweetSelector of tweetElementSelectors) {
                  const tweetElement = button.closest(tweetSelector);
                  if (tweetElement) {
                    const tweetData = extractTweetData(tweetElement);
                    if (tweetData) {
                      sendTweetData(tweetData);
                    }
                    break;
                  }
                }
              });
            }
          });
        });
      }

      if (processedNodes > 0) {
        log(`MutationObserver 处理了 ${processedNodes} 个新增节点`);
      }
    });

    // 更新时间线容器选择器
    const timelineSelectors = [
      'div[data-testid="primaryColumn"]',
      '[data-testid="primaryColumn"]',
      'div[role="main"]',
      'main[role="main"]'
    ];

    let timelineObserverInitialized = false;

    const waitForTimeline = setInterval(() => {
      for (const selector of timelineSelectors) {
        const timeline = document.querySelector(selector);
        if (timeline) {
          clearInterval(waitForTimeline);
          observer.observe(timeline, { childList: true, subtree: true });
          log(`时间线监听器已初始化: ${selector}`);
          timelineObserverInitialized = true;
          break;
        }
      }

      if (!timelineObserverInitialized) {
        log("未找到时间线容器，将在 1 秒后重试");
      }
    }, 1000);

    // 10 秒后停止尝试
    setTimeout(() => {
      if (!timelineObserverInitialized) {
        clearInterval(waitForTimeline);
        log("无法初始化时间线监听器，请检查页面结构");
      }
    }, 10000);
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
