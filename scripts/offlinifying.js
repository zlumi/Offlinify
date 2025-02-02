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

export async function crawl(tab, dependenciesCollection, folderName, filter = null, crawled = new Set()) {
  while (tab.status !== "complete") {
    await new Promise(resolve => setTimeout(resolve, 250));
    tab = await chrome.tabs.get(tab.id);
  }
  crawled.add(tab.url.split('?')[0]);
  console.log("Crawling: ", tab.url);

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

      const unfilteredReferences = Array.from(new Set(
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => a.href)
          .filter((href) => href.startsWith("http"))
      ));

      return { html, unfilteredReferences, dependencies };
    },
  });

  // 3 - Filter the references

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
            await notify("Offlinifying", `Filter: ${filter}`, tab.url);
          }
        }
      });
    });

    while (!filter) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  // var { html, dependencies } = jsInject.result;

  // for (const dependency of dependencies) {
  //   try {
  //     const fileName = localEncode(dependency);
  //     html = html.replace(dependency, `assets/${fileName}`);
  //     if (!dependenciesCollection.has(dependency)) dependenciesCollection.add(dependency);
  //   } catch (error) {
  //     console.error("download failed! ", dependency, error);
  //   }
  // }

  // try {
  //   const blob = new Blob([html], { type: "text/html" });
  //   const dataUrl = await blobToDataURL(blob);
  //   chrome.downloads.download({
  //     url: dataUrl,
  //     filename: `${folderName}/${localEncode(dataUrl)}.html`,
  //     saveAs: false,
  //     conflictAction: "overwrite",
  //   });
  // } catch (error) {
  //   console.error(`${tab.url} failed to save `, error);
  // }

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
  console.log("Closing: ", tab.url, counter);
  chrome.tabs.remove(tab.id);
  return counter;
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