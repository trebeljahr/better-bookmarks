async function setIconToCorrectVersion(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  console.log(chrome);

  if (tab.url) {
    console.log(tab.url);
    const result = await chrome.storage.local.get(tab.url);
    console.log(result);

    const notYetAddedIcon = {
      "16": "/empty16.png",
      "32": "/empty32.png",
      "48": "/empty48.png",
      "128": "/empty128.png",
    };
    const alreadyAddedIcon = {
      "16": "/full16.png",
      "32": "/full32.png",
      "48": "/full48.png",
      "128": "/full128.png",
    };
    if (tab.url in result) {
      chrome.action.setIcon({ path: alreadyAddedIcon });
    } else {
      chrome.action.setIcon({ path: notYetAddedIcon });
    }
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  setIconToCorrectVersion(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
  setIconToCorrectVersion(tabId);
});
