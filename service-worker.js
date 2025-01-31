chrome.action.onClicked.addListener(async function (tab) {
  // if (!tab.url.startsWith('http')) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Downloading",
    message: `${tab.url}`,
  });

  let [jsInject] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const findDependencies = (document, attribute, query) => {
        return new Set(Array.from(document
          .querySelectorAll(query))
          .map((htmlElement) => htmlElement[attribute])
          .filter((url) => url&&url.startsWith('http'))
        );
      };
      const hrefDependencies = findDependencies(document, 'href',
        'link[rel="stylesheet"], link[href]');
      const srcDependencies = findDependencies(document, 'src',
        'script[src], img[src], video[src], audio[src], source[src], track[src], iframe[src], frame[src]');

      const dependencies = [...hrefDependencies, ...srcDependencies];

      let html = document.documentElement.outerHTML;
      let references = Array.from(new Set(Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)));
      return { html, references, dependencies };
    }
  });

  function localEncode(path) {
    return path.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  }

  const { html, references, dependencies } = jsInject.result;
  var newHtml = html;

  const url = new URL(tab.url);
  const folderName = localEncode(url.hostname) + "/" + localEncode(url.pathname);
  const assetsFolder = `${folderName}/assets`;

  for (const dependency of dependencies) {
    try {
      const response = await fetch(dependency);
      const blob = await response.blob();
      const dataUrl = await blobToDataURL(blob);
      const fileName = localEncode(dependency);

      chrome.downloads.download({
        url: dataUrl,
        filename: `${assetsFolder}/${fileName}`,
        saveAs: false,
        conflictAction: 'overwrite'
      });
    } catch (error) {
      console.error("download failed! ", dependency, error);
    }
  }

  try {
    const blob = new Blob([newHtml], { type: 'text/html' });
    const dataUrl = await blobToDataURL(blob);
    chrome.downloads.download({
      url: dataUrl,
      filename: `${folderName}/index.html`,
      saveAs: false,
      conflictAction: 'overwrite'
    });
  } catch (error) {
    console.error("html failed to save! ", error);
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Download complete",
    message: `${tab.url}`,
  });
});

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}