import { notify } from "./interactions.js";

function localEncode(path) {
  return path
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.]/gi, "_")
    .toLowerCase();
}

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function crawl(tab, dependenciesCollection, folderName, filter = null) {
  let [jsInject] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // 1 - Find all dependencies

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


      // 2 - Get the HTML of the page without relative URLs

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

      console.log(html, dependencies);

      const unfilteredReferences = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => a.href)

      return { html, unfilteredReferences, dependencies };
    },
  });

  const { unfilteredReferences } = jsInject.result;

  if (!filter) { 
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
      };

      chrome.runtime.onMessage.addListener(filterSubmissionListener);

      chrome.windows.onRemoved.addListener(function windowCloseListener(windowId) {
        if (windowId === popupWindowId) {
          chrome.runtime.onMessage.removeListener(filterSubmissionListener);
          chrome.windows.onRemoved.removeListener(windowCloseListener);
          if (!filter) {
            notify("Offlinifying", "Cancelled (no filter selected)");
            return;
          } else {
            notify("Offlinifying", `Filter: ${filter}`, tab.url);
          }
        }
      });
    });

    while (!filter) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  console.log(filter);

  // TODO:
  // FILTER,
  // CRAWL RECURSIVELY (WHILE DOWNLOADING THE HTMLS& REPATHING DEPENDENCIES),
  // DOWNLOAD DEPENDENCIES
}

export async function downloadDependencies(dependenciesCollection, folderName) {
  for (const dependency of dependenciesCollection) {
    try {
      const fileName = localEncode(dependency);
      chrome.downloads.download({
        url: await blobToDataURL(await await fetch(dependency).blob()),
        filename: `${folderName}/assets/${fileName}`,
        saveAs: false,
        conflictAction: "overwrite",
      });
    } catch (error) {
      console.error("download failed! ", dependency, error);
    }
  }
}