import { downloadSinglePage } from "./service-workers/offlinifying.js";
import { setupInteractions, notify } from "./service-workers/interactions.js";

setupInteractions();

chrome.action.onClicked.addListener(async function (tab) {
  if (tab.url.startsWith("chrome://")) { notify("Error", "This page cannot be downloaded!"); return; }

  await downloadSinglePage(tab);
  
  notify("Download complete", `of ${tab.url}`);
});