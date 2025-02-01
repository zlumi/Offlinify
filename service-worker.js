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

      const getAbsoluteOuterHTML = () => {
        const docClone = document.documentElement.cloneNode(true);
        const baseURL = window.location.origin;
    
        function makeAbsolute(node, attr) {
            if (node.hasAttribute(attr)) {
                const url = node.getAttribute(attr);
                if (url && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('javascript:')) {
                    node.setAttribute(attr, new URL(url, baseURL).href);
                }
            }
        }
    
        docClone.querySelectorAll('[href]').forEach(el => makeAbsolute(el, 'href'));
        docClone.querySelectorAll('[src]').forEach(el => makeAbsolute(el, 'src'));
    
        return docClone.outerHTML;
      }
      const html = getAbsoluteOuterHTML();
      
      let references = Array.from(new Set(Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)));

      return { html, references, dependencies };
    }
  });

  function localEncode(path) {
    return path.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  }

  const { html, references, dependencies } = jsInject.result;

  const url = new URL(tab.url);
  const folderName = localEncode(url.hostname) + "/" + localEncode(url.pathname);

  var newHtml = html;

  for (const dependency of dependencies) {
    try {
      const response = await fetch(dependency);
      const blob = await response.blob();
      const dataUrl = await blobToDataURL(blob);
      const fileName = localEncode(dependency.split('?')[0]);

      chrome.downloads.download({
        url: dataUrl,
        filename: `${folderName}/assets/${fileName}`,
        saveAs: false,
        conflictAction: 'overwrite'
      });
      newHtml = newHtml.replace(dependency, `assets/${fileName}`);
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