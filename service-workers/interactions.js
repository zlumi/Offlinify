export function setupInteractions() {
  chrome.notifications.onClicked.addListener(
    (notificationId, buttonIndex) => {
      chrome.notifications.clear(notificationId);
    }
  );
}

export function notify(title, message, buttons = []) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "../icons/icon128.png",
    title,
    message,
    buttons
  });
}