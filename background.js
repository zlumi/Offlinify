import { downloadSinglePage } from "./service-workers/offlinifying.js";
import { setupInteractions, notify } from "./service-workers/interactions.js";

setupInteractions();

chrome.action.onClicked.addListener(async function (tab) {
  if (!tab.url || tab.url.startsWith("chrome://")) {
    notify("Error", "This page cannot be downloaded!");
    return;
  }

  const references = await downloadSinglePage(tab);

  // crawling will be handled through the popup js
  const referencesParam = encodeURIComponent(JSON.stringify(references));
  const popupUrl = `pages/filter-select.html?references=${referencesParam}`;
  chrome.windows.create({
    url: popupUrl,
    type: "popup",
    focused: true,
    width: 500,
    height: 700
  });
});