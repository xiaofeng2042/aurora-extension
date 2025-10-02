/**
 * Content Script - 桥接页面脚本和后台服务
 */

(function () {
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log("[Aurora Content Script]", ...args);
  }

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
        log(`Extension context invalid, retry attempt ${i + 1}/${retries}`);

        if (i < retries - 1) {
          // 指数退避等待
          await sleep(1000 * Math.pow(2, i));
          continue;
        }

        throw new Error("Extension context invalidated - please reload the page");
      }

      try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
      } catch (error) {
        if (error.message.includes("Extension context invalidated") && i < retries - 1) {
          log(`Context invalidated, waiting before retry ${i + 1}/${retries}`);
          await sleep(1000 * Math.pow(2, i));
        } else {
          throw error;
        }
      }
    }

    throw new Error("Failed to send message after retries");
  }

  /**
   * 注入 page_script.js 到页面环境
   * 这样脚本才能访问页面的 JavaScript 环境和 React 组件
   */
  function injectPageScript() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("page/page_script.js");
      script.onload = () => {
        log("Page script injected successfully");
        script.remove();
      };
      script.onerror = (error) => {
        console.error("[Aurora] Failed to inject page script:", error);
      };

      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error("[Aurora] Error injecting page script:", error);
    }
  }

  /**
   * 监听来自页面脚本的消息
   */
  function listenToPageMessages() {
    window.addEventListener("message", (event) => {
      // 安全检查:只接受来自同源的消息
      if (event.source !== window) return;

      // 检查消息类型
      if (
        event.data.type === "AURORA_LIKED_POST" &&
        event.data.source === "aurora-page-script"
      ) {
        const tweetData = event.data.payload;
        log("Received liked post from page script:", tweetData.tweetId);

        // 转发到后台服务
        sendMessageSafely({
          type: "NEW_LIKED_POST",
          payload: tweetData,
        })
          .then((response) => {
            if (response?.success) {
              log("Post sent to background successfully");
            } else {
              log("Background response:", response);
            }
          })
          .catch((error) => {
            if (error.message.includes("Extension context invalidated")) {
              // 显示用户友好的错误提示
              console.error("[Aurora] 扩展上下文已失效，请刷新页面以恢复功能");

              // 尝试在页面上显示提示
              try {
                const notification = document.createElement('div');
                notification.style.cssText = `
                  position: fixed;
                  top: 20px;
                  right: 20px;
                  background: #f87171;
                  color: white;
                  padding: 12px 16px;
                  border-radius: 8px;
                  font-size: 14px;
                  font-family: system-ui, -apple-system, sans-serif;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  z-index: 10000;
                  max-width: 300px;
                `;
                notification.innerHTML = `
                  <div style="font-weight: bold; margin-bottom: 4px;">Aurora 扩展需要重新加载</div>
                  <div style="font-size: 12px;">扩展已更新，请刷新此页面以恢复功能</div>
                `;
                document.body.appendChild(notification);

                // 5秒后自动移除提示
                setTimeout(() => {
                  if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                  }
                }, 5000);
              } catch (e) {
                // 如果无法添加通知到页面，至少记录错误
                console.warn("[Aurora] Could not display notification:", e);
              }
            } else {
              console.error("[Aurora] Error sending to background:", error);
            }
          });
      }
    });

    log("Message listener initialized");
  }

  /**
   * 监听来自后台的消息
   */
  function listenToBackgroundMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "SYNC_STATUS_UPDATE") {
        log("Sync status update:", message.payload);
        showPageNotification(message.payload);
      }

      if (message.type === "SYNC_SUCCESS") {
        log("Sync success:", message.payload);
        showPageNotification({
          type: "success",
          title: "同步成功",
          message: `已将帖子同步到 Linear: ${message.payload?.tweetId || "未知"}`
        });
      }

      if (message.type === "SYNC_ERROR") {
        log("Sync error:", message.payload);
        showPageNotification({
          type: "error",
          title: "同步失败",
          message: message.payload?.error || "未知错误"
        });
      }

      return false; // 同步响应
    });
  }

  /**
   * 显示页面内通知
   */
  function showPageNotification(notification) {
    try {
      // 创建通知元素
      const notificationEl = document.createElement("div");
      notificationEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${notification.type === "success" ? "#10b981" : "#ef4444"};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        z-index: 10000;
        max-width: 300px;
        transform: translateX(100%);
        transition: transform 0.3s ease;
      `;

      notificationEl.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${notification.title}</div>
        <div style="opacity: 0.9;">${notification.message}</div>
      `;

      // 添加到页面
      document.body.appendChild(notificationEl);

      // 动画显示
      setTimeout(() => {
        notificationEl.style.transform = "translateX(0)";
      }, 100);

      // 3 秒后自动消失
      setTimeout(() => {
        notificationEl.style.transform = "translateX(100%)";
        setTimeout(() => {
          if (notificationEl.parentNode) {
            notificationEl.parentNode.removeChild(notificationEl);
          }
        }, 300);
      }, 3000);

      log("显示页面通知:", notification);
    } catch (error) {
      log("显示通知失败:", error);
    }
  }

  /**
   * 初始化
   */
  function init() {
    log("Initializing on", window.location.href);

    // 注入页面脚本
    injectPageScript();

    // 监听消息
    listenToPageMessages();
    listenToBackgroundMessages();

    log("Initialized successfully");
  }

  // 等待 DOM 准备就绪
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
