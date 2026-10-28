chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "upp-selection",
    title: "Unit price for this",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "upp-selection" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "upp-selection", text: info.selectionText }).catch(() => {});
});
