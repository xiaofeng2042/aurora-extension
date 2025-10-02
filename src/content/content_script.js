/**
 * Content Script - 桥接页面脚本和后台服务
 */

(function () {
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log("[Aurora Content Script]", ...args);
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
        chrome.runtime
          .sendMessage({
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
            console.error("[Aurora] Error sending to background:", error);
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
