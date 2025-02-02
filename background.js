import { crawl } from "./scripts/offlinifying.js";
import { notify } from "./scripts/interactions.js";

chrome.action.onClicked.addListener(async function (tab) {
  if (!tab.url || tab.url.startsWith("chrome://")) {
    notify("Error", "This page cannot be downloaded!");
    return;
  }

  const counter = await crawl(tab, new Set(), "Offlinified");
});