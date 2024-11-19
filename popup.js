document.getElementById("startProcess").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "startProcess" });
});
// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "update-progress") {
    // Update the progress bar based on the received progress
    updateProgressBar(message.progress, message.count, message.from);
  }
});

function updateProgressBar(progress, count, from) {
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const pcount = document.getElementById("count");

  // Set progress width and text
  progressBar.style.width = progress + "%";

  progressText.textContent = Math.round(progress) + "%";
  pcount.innerText = count + "-" + from;
}

// popup.js
document.getElementById("reload2").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.reload(tabs[0].id);
  });
});

// Display stored orgId
chrome.storage.local.get(["savedOrgId"], function (result) {
  document.getElementById("orgId").textContent =
    result.savedOrgId || "None stored";
});
