# Offlinifyer

This lightweight Chrome extension is used to make websites accessible offline.

Creating this with the intention of allowing study resources to be accessible on trains, on internet-poor areas, on remote corners of the earth.

Enjoy!

## Installation

The extension calls `chrome.debugger.attach()` on a tab to capture network events when you click the extension's action button. The response data is logged in the developer console, to demonstrate extracting a network response's data such as the request headers and URL.

## Running this extension

1. Clone this repository.
2. Load this directory in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked).
3. Pin the extension to the browser's taskbar and click on the action button to save it to your downloads folder.

### Using the Offline Website

Right click & open the index.html in your browser.