// Intercept fetch and XHR calls
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);

  // Monitor specific API calls
  if (args[0].includes("api/v1/tickets")) {
    const clonedResponse = response.clone();
    const headers = [...clonedResponse.headers.entries()];
    const orgidHeader = headers.find(([key]) => key.toLowerCase() === "orgid");
    console.log(orgidHeader);
    if (orgidHeader) {
      const orgid = orgidHeader[1];
      console.log("OrgID Extracted:", orgid);

      // Save orgid to local storage
      chrome.storage.local.set({ orgid }, () => {
        console.log("OrgID saved to local storage.");
      });
    }
  }

  return response;
};
