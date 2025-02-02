import { crawl, downloadDependencies } from "./scripts/offlinifying.js";
import { notify } from "./scripts/interactions.js";

chrome.action.onClicked.addListener(async function (tab) {
  if (!tab.url || tab.url.startsWith("chrome://")) {
    await notify("Error", "This page cannot be downloaded!");
    return;
  }

  const TARGET_DIR = "Offlinified";

  var dependenciesCollection = new Set();
  const pageCount = await crawl(tab, dependenciesCollection, TARGET_DIR);
  await notify(
    "Offlinifying",
    `${pageCount} pages downloaded, now resolving ${dependenciesCollection.size} dependencies`, `root: ${tab.url}`
  );

  // downloadDependencies(dependenciesCollection, TARGET_DIR);
});