async function setIconToCorrectVersion(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  console.log(chrome);

  if (tab.url) {
    console.log(tab.url);
    const result = await chrome.storage.local.get(tab.url);
    console.log(result);

    const notYetAddedIcon = "/starEmpty.png";
    const alreadyAddedIcon = "/starFull.png";
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
