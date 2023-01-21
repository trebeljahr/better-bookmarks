function polling() {
  // console.log("polling");
  setTimeout(polling, 1000 * 30);
}

polling();

chrome.commands.onCommand.addListener((command) => {
  console.log(`Command: ${command}`);
});
