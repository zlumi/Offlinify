import { notify } from "./interactions.js";

/**
 * Algorithm to encode a URL to a local path - just one unified/template way to do it.
 * @param {*} path the URL to encode
 * @returns {string} the local path
 */
function localEncode(path) {
  return path
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.]/gi, "_")
    .toLowerCase();
}

/**
 * DataURLs embed file data directly in a URL with Base64/text encoding.
 * This function is for Blob->DataURL conversion.
 * @param {*} blob the blob to convert
 * @returns {Promise<string>} the DataURL of the blob
 */
async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * An injected function to extract current page's HTML & processes it for dependencies and references.
 * @returns {Promise<{ html: string, unfilteredReferences: string[], dependencies: string[] }>} as named
 */
function extractTabInfo() {
  const findDependencies = (document, attribute, query) => {
    return new Set(
      Array.from(document.querySelectorAll(query))
        .map((htmlElement) => htmlElement[attribute])
        .filter((url) => url && url.startsWith("http"))
    );
  };
  const hrefDependencies = findDependencies(
    document,
    "href",
    'link[rel="stylesheet"], link[href]'
  );
  const srcDependencies = findDependencies(
    document,
    "src",
    "script[src], img[src], video[src], audio[src], source[src], track[src], iframe[src], frame[src]"
  );
  const dependencies = [...hrefDependencies, ...srcDependencies];

  const getAbsoluteOuterHTML = () => {
    const docClone = document.documentElement.cloneNode(true);
    const baseURL = window.location.origin;

    function makeAbsolute(node, attr) {
      if (node.hasAttribute(attr)) {
        const url = node.getAttribute(attr);
        if (
          url &&
          !url.startsWith("http:") &&
          !url.startsWith("data:") &&
          !url.startsWith("javascript:")
        ) {
          node.setAttribute(attr, new URL(url, baseURL).href);
        }
      }
    }

    docClone
      .querySelectorAll("[href]")
      .forEach((el) => makeAbsolute(el, "href"));
    docClone
      .querySelectorAll("[src]")
      .forEach((el) => makeAbsolute(el, "src"));

    return docClone.outerHTML;
  };
  const html = getAbsoluteOuterHTML();

  const unfilteredReferences = Array.from(new Set(
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => href.startsWith("http"))
  ));

  return { html, unfilteredReferences, dependencies };
}

/**
 * Asks the user to select a filter for the references through popup.
 * @param {string[]} unfilteredReferences the references from the root site, helps user determine filter
 * @param {string} rootUrl where crawling begins, used in user informing
 * @returns {Promise<string>} the filter selected by the user
 */
async function askFilter(unfilteredReferences, rootUrl) {
  let filter = null;

  const referencesParam = encodeURIComponent(JSON.stringify(unfilteredReferences));
  const popupUrl = `pages/filter-select.html?references=${referencesParam}`;
  chrome.windows.create({
    url: popupUrl,
    type: "popup",
    focused: true,
    width: 500,
    height: 700
  }, (popupWindow) => {
    const popupWindowId = popupWindow.id;

    const filterSubmissionListener = async (message, sender, sendResponse) => {
      if (message.filter) {
        filter = message.filter;
      }
      sendResponse({ filter });
    };
    chrome.runtime.onMessage.addListener(filterSubmissionListener);

    chrome.windows.onRemoved.addListener(async function windowCloseListener(windowId) {
      if (windowId === popupWindowId) {
        chrome.runtime.onMessage.removeListener(filterSubmissionListener);
        chrome.windows.onRemoved.removeListener(windowCloseListener);
        if (!filter) {
          await notify("Offlinifying", "Cancelled (no filter selected)");
          return;
        } else {
          await notify("Offlinifying", `Filter: ${filter}`, rootUrl);
        }
      }
    });
  });

  while (!filter) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return filter;
}

/**
 * Downloads the HTML of the page and repaths the dependencies to local assets folder.
 * @param {string} html the absolutely-pathed (still online) HTML of the page
 * @param {string[]} dependencies the resources that needs to be Offlinified (discovered by injected javascript)
 * @param {string} folderName target output directory
 * @param {Set<string>} dependenciesCollection storage for dependencies (resolved subsequent to crawling)
 * @param {chrome.tabs.Tab} tab the tab being crawled, used in case of error logging
 */
async function downloadHtml(html, dependencies, folderName, dependenciesCollection, tab) {
  for (const dependency of dependencies) {
    try {
      const fileName = localEncode(dependency);
      html = html.replace(dependency, `assets/${fileName}`);
      if (!dependenciesCollection.has(dependency)) dependenciesCollection.add(dependency);
    } catch (error) {
      console.error("download failed! ", dependency, error);
    }
  }

  try {
    const blob = new Blob([html], { type: "text/html" });
    const dataUrl = await blobToDataURL(blob);
    const fileName = localEncode(new URL(tab.url).pathname);
    chrome.downloads.download({
      url: dataUrl,
      filename: `${folderName}/${fileName}.html`,
      saveAs: false,
      conflictAction: "overwrite",
    });
  } catch (error) {
    console.error(`${tab.url} failed to save `, error);
  }
}

/**
 * Crawls the given tab and its references recursively.
 * @param {chrome.tabs.Tab} tab the tab to crawl
 * @param {Set<string>} dependenciesCollection storage for dependencies (resolved subsequent to crawling)
 * @param {string} folderName target output directory
 * @param {string} filter defaults to null, asks user for input if unspecified
 * @param {Set<string>} crawled the set of URLs that have been crawled (used for recursion)
 * @returns {Promise<number>} the number of pages crawled
 */
export async function crawl(tab, dependenciesCollection, folderName, filter = null, crawled = new Set()) {
  while (tab.status !== "complete") {
    await new Promise(resolve => setTimeout(resolve, 250));
    tab = await chrome.tabs.get(tab.id);
  }
  crawled.add(tab.url.split('?')[0]);
  // console.log("Crawling: ", tab.url);

  let [jsInject] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: extractTabInfo,
  });

  const { html, dependencies } = jsInject.result;
  await downloadHtml(html, dependencies, folderName, dependenciesCollection, tab);

  const { unfilteredReferences } = jsInject.result;
  if (!filter) { 
    filter = await askFilter(unfilteredReferences, tab.url);
  }
  const references = unfilteredReferences.filter((reference) => {
    return reference.toLowerCase().includes(filter)
      && !crawled.has(reference.split('?')[0]);
  });

  var counter = 1;
  const crawlPromises = references.map((reference) => {
    return new Promise((resolve) => {
      chrome.tabs.create(
        { url: reference, active: false, pinned: true },
        async (tabOfReference) => {
          const count = await crawl(
            tabOfReference,
            dependenciesCollection,
            folderName,
            filter,
            crawled
          );
          counter += count;
          resolve();
        }
      );
    });
  });
  await Promise.all(crawlPromises);

  // console.log("Closing: ", tab.url, counter);
  chrome.tabs.remove(tab.id);
  return counter;
}

/**
 * Goes through the dependencies, downloads them to the assets folder.
 * @param {Set<string>} dependenciesCollection the collection of web-resources
 * @param {string} folderName target output directory
 */
export async function downloadDependencies(dependenciesCollection, folderName) {
  const downloadPromises = Array.from(dependenciesCollection).map(async (dependency) => {
    try {
      const fileName = localEncode(dependency);
      const response = await fetch(dependency);
      const blob = await response.blob();
      const dataURL = await blobToDataURL(blob);
      await chrome.downloads.download({
        url: dataURL,
        filename: `${folderName}/assets/${fileName}`,
        saveAs: false,
        conflictAction: "overwrite",
      });
    } catch (error) {
      console.error("download failed! ", dependency, error);
    }
  });
  await Promise.all(downloadPromises);
}