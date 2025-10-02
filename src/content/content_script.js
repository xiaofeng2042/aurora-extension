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
        // 可以在这里显示页面通知
      }

      return false; // 同步响应
    });
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
