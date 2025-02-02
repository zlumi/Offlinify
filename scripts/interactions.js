export async function notify(title, message, contextMessage="", buttons = []) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "../icons/icon128.png",
    title,
    message,
    contextMessage,
    buttons,
    isClickable: false
  });
}