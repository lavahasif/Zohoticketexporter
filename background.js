var YOUR_ORGANIZATION_ID = "";

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    // console.log(details.url);
    if (details.url.includes("api/v1/tickets")) {
      const orgId = details.requestHeaders.find(
        (header) => header.name.toLowerCase() === "orgid"
      )?.value;

      if (orgId) {
        var YOUR_ORGANIZATION_ID = orgId;
        // console.log(orgId);
        // console.log(Object.keys(orgId));

        chrome.storage.local.get(["savedOrgId"], function (rs) {
          const currentOrgId = rs.savedOrgId;

          // Check if savedOrgId is not an object and is defined
          if (typeof currentOrgId !== "object" && currentOrgId !== undefined) {
            if (currentOrgId > 0) {
              console.log("Current Org ID exists:", currentOrgId);
            } else {
              console.log("Invalid Org ID, replacing it with:", orgId);
              chrome.storage.local.set({ savedOrgId: orgId }, function () {
                console.log("Organization ID saved:", orgId);
              });
            }
          } else {
            console.log(
              "savedOrgId is either an object or undefined. Replacing it with:",
              orgId
            );
            chrome.storage.local.set({ savedOrgId: orgId }, function () {
              console.log("Organization ID saved:", orgId);
            });
          }
        });
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Reload functionality
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.reload(tab.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-popup") {
    chrome.action.openPopup(); // Opens the popup HTML
  }
});

function convertJsonToCsv(jsonData) {
  if (!jsonData || jsonData.length === 0) return "";

  const headers = Object.keys(jsonData[0]);

  const csvRows = [
    headers.join(","),
    ...jsonData.map((row) =>
      headers.map((header) => JSON.stringify(row[header] || "")).join(",")
    ),
  ];

  return csvRows.join("\n");
}

async function fetchWithCookies(url, cookies) {
  console.log(cookies);
  const cookieHeader = cookies
    .map((c) => {
      c.name;
    })
    .join("; ");
  // debugger;
  const response = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  return response.json();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startProcess") {
    chrome.storage.local.get(["savedOrgId"], function (result) {
      YOUR_ORGANIZATION_ID = result.savedOrgId;
    });
    chrome.windows.getCurrent((w) => {
      // Get the current URL

      chrome.tabs.query({ active: true, windowId: w.id }, async (tabs) => {
        const currentTab = tabs[0];

        const url = currentTab.url;

        // Extract the desired segment using regex
        const match = url.match(/\/agent\/([^\/]+)/);
        var orgid = "";
        // Check if the segment exists and display it
        if (match && match[1]) {
          orgid = match[1];
          console.log("Extracted Value:", match[1]);
        } else {
          console.log("Value not found in the URL.");
        }

        if (tabs.length > 0) {
          const url = new URL(tabs[0].url);
          const domain = url.hostname;

          try {
            // Get cookies for the current tab's domain
            const cookies = await chrome.cookies.getAll({ domain });

            // Build the cookie header string
            const cookieHeader = cookies
              .map((cookie) => `${cookie.name}=${cookie.value}`)
              .join("; ");
            // debugger;
            console.log("Formatted Cookie Header:", cookieHeader);

            let count = await FetchTotalTicketCount(cookieHeader, orgid);
            let pages = count / 100;
            let from = 1;
            var tickets_list = [];
            for (let index = 0; index < pages; index++) {
              from = 1 + index * 100;
              // 1+0=1
              // 1+100=101
              // 101+100=201
              let tickets = await FetchTicketlist(cookieHeader, from, orgid);

              var tagged_list = [];
              tickets.data.forEach((element) => {
                // let tag = await Fetchtags(cookieHeader, element.id);
                element["tag"] = "";
                // if (tag.data != null && tag.data?.length > 0)
                //   element.tag = tag[0]["name"];
                tagged_list.push(element);
              });
              tickets_list.push(...tagged_list);

              // Calculate progress percentage
              let progress = ((index + 1) / pages) * 100;

              // Send the progress update to popup.js
              chrome.runtime.sendMessage({
                type: "update-progress",
                progress: progress,
                count: count,
                from: from,
              });
            }
            // console.log(count + count);

            let mycsv = createCSV(tickets_list);
            // downloadCSV(mycsv);
            // debugger;
            downloadChunkedCSV(mycsv, "All ticket.csv");

            // console.log(tickets);
            console.log(count);
            // Use this string in your API request
          } catch (error) {
            console.error("Error fetching cookies:", error);
          }
        } else {
          console.error("No active tab found.");
        }
      });
    });
  }
  const CHUNK_SIZE = 50000; // Number of records per chunk

  function downloadChunkedCSV(data, filename) {
    let processedCount = 0;
    let totalSize = data.length;
    let blob = null;
    let blobParts = [];

    return new Promise((resolve, reject) => {
      try {
        function processChunk() {
          const chunkEnd = Math.min(processedCount + CHUNK_SIZE, totalSize);
          const chunk = data.slice(processedCount, chunkEnd);

          // Add chunk to blob parts
          blobParts.push(new Blob([chunk], { type: "text/csv" }));

          processedCount = chunkEnd;

          // Calculate and report progress
          const progress = Math.round((processedCount / totalSize) * 100);
          chrome.runtime.sendMessage({
            action: "downloadProgress",
            progress: progress,
          });

          // Check if processing is complete
          if (processedCount >= totalSize) {
            // Combine all chunks into final blob
            blob = new Blob(blobParts, { type: "text/csv;charset=utf-8;" });

            // Convert blob to base64
            const reader = new FileReader();
            reader.onload = function () {
              const base64data = reader.result.split(",")[1];
              debugger;
              // Trigger download
              chrome.downloads.download(
                {
                  url: `data:text/csv;base64,${base64data}`,
                  filename: filename,
                  saveAs: true,
                },
                (downloadId) => {
                  if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                  } else {
                    resolve(downloadId);
                  }
                }
              );
            };

            reader.onerror = function () {
              reject(new Error("Failed to convert blob to base64"));
            };

            reader.readAsDataURL(blob);
          } else {
            // Process next chunk
            setTimeout(processChunk, 0);
          }
        }

        // Start processing
        processChunk();
      } catch (error) {
        reject(error);
        chrome.runtime.sendMessage({
          action: "downloadError",
          error: error.message,
        });
      }
    });
  }

  // Function to create CSV content
  function createCSV(ticketData) {
    let csvContent =
      "Ticket Number,Subject,Status,Status Type,Created Time,Due Date,On Hold Time,Contact ID,Contact Name,Assignee ID,Assignee Name,Product ID,Product Name,Id,tag\n";

    ticketData.forEach((ticket) => {
      const subject = ticket.subject || "";
      const status = ticket.status || "";
      const statusType = ticket.statusType || "";
      const createdTime = ticket.createdTime || "";
      const dueDate = ticket.dueDate || "N/A";
      const onHoldTime = ticket.onholdTime || "N/A";

      const contactId = ticket.contact?.id || "";
      const contactFirstName = ticket.contact?.firstName || "";
      const contactLastName = ticket.contact?.lastName || "";

      const assigneeId = ticket.assignee?.id || "";
      const assigneeFirstName = ticket.assignee?.firstName || "";
      const assigneeLastName = ticket.assignee?.lastName || "";

      const productId = ticket.product?.id || "";
      const productName = ticket.product?.productName || "";
      const id = ticket.id || "";
      const tag = ticket.tag || "";

      // Add row to CSV content
      csvContent += `${ticket.ticketNumber},"${subject}","${status}","${statusType}","${createdTime}","${dueDate}","${onHoldTime}","${contactId}","${contactFirstName} ${contactLastName}","${assigneeId}","${assigneeFirstName} ${assigneeLastName}","${productId}","${productName}","${id}","${tag}"\n`;
    });

    return csvContent;
  }

  // Function to download the CSV file
  function downloadCSV(csvContent) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    // const url = URL.createObjectURL(blob);

    // Create the download
    chrome.downloads.download(
      {
        url: "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent),
        filename: "ticket_data.csv",
        saveAs: true,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Download error:", chrome.runtime.lastError);
        } else {
          console.log("Download started with ID:", downloadId);
        }
      }
    );

    // chrome.downloads.download({
    //   url: url,
    //   filename: "ticket_data.csv",
    //   saveAs: true,
    //   conflictAction: "uniquify",
    // });
  }

  async function FetchTicketlist(header, from, orgid) {
    const myHeaders = new Headers();
    myHeaders.append("accept", "*/*");
    myHeaders.append("accept-language", "en-US,en;q=0.9");
    myHeaders.append("content-type", "application/json");
    myHeaders.append("cookie", header);
    myHeaders.append("currentdepartmentid", "352352000000006907");
    myHeaders.append(
      "featureflags",
      "multiLayout,agentDeptOpt,pvtThread,ticketTeam,commentAttachment,spamDetails,taskReminder,showI18NFields,onholdTicketStatus,Blueprint,timeTracking,sharedDepartments,secondaryContacts,truncateContent,customChannels,apiName,blockQuoteContent,reactChanges,newHistoryFormat,getVisitorInfo,sanitizedName,sanitizedDeptNameOpt,handleClosedStatusPermission,providePHIDetails,contact,showIsNested,requestFromNewClient,lookUp,"
    );
    myHeaders.append("orgid", YOUR_ORGANIZATION_ID);
    myHeaders.append("priority", "u=1, i");
    myHeaders.append("referer", "https://desk.zoho.com/agent/");
    myHeaders.append(
      "sec-ch-ua",
      '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"'
    );
    myHeaders.append("sec-ch-ua-mobile", "?0");
    myHeaders.append("sec-ch-ua-platform", '"Windows"');
    myHeaders.append("sec-fetch-dest", "empty");
    myHeaders.append("sec-fetch-mode", "cors");
    myHeaders.append("sec-fetch-site", "same-origin");
    myHeaders.append(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
    );
    // myHeaders.append(
    //   "x-zcsrf-token",
    //   "crmcsrfparam=f4e26974bfb0ce8a2e5b22124a93149a2af44d0444bb2da649fecf18e08767d1b4db9d30ecb77e44071e095be7999b1b5dbf652283b324c880ce2dd3082a4ce2"
    // );

    const requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow",
    };
    let tickets = null;

    try {
      let tickets_data = await fetch(
        `https://desk.zoho.com/supportapi/zd/${orgid}/api/v1/tickets?include=contacts,products,assignee,team,isRead&departmentId=352352000000006907&viewId=352352000000007523&limit=100&sortBy=-recentThread&filters=%7B%22criteria%22%3A%7B%22fieldConditions%22%3A%5B%5D%7D%7D&from=` +
          from,
        requestOptions
      );
      tickets = await tickets_data.json();
    } catch (error) {}

    return tickets;
  }
  async function Fetchtags(header, ticket_id) {
    const myHeaders = new Headers();
    myHeaders.append("accept", "*/*");
    myHeaders.append("accept-language", "en-US,en;q=0.9");
    myHeaders.append("content-type", "application/json");
    myHeaders.append("cookie", header);
    myHeaders.append("currentdepartmentid", "352352000000006907");
    myHeaders.append(
      "featureflags",
      "multiLayout,agentDeptOpt,pvtThread,ticketTeam,commentAttachment,spamDetails,taskReminder,showI18NFields,onholdTicketStatus,Blueprint,timeTracking,sharedDepartments,secondaryContacts,truncateContent,customChannels,apiName,blockQuoteContent,reactChanges,newHistoryFormat,getVisitorInfo,sanitizedName,sanitizedDeptNameOpt,handleClosedStatusPermission,providePHIDetails,contact,showIsNested,requestFromNewClient,lookUp,"
    );
    myHeaders.append("orgid", YOUR_ORGANIZATION_ID);
    myHeaders.append("priority", "u=1, i");
    myHeaders.append("referer", `https://desk.zoho.com/agent/`);
    myHeaders.append(
      "sec-ch-ua",
      '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"'
    );
    myHeaders.append("sec-ch-ua-mobile", "?0");
    myHeaders.append("sec-ch-ua-platform", '"Windows"');
    myHeaders.append("sec-fetch-dest", "empty");
    myHeaders.append("sec-fetch-mode", "cors");
    myHeaders.append("sec-fetch-site", "same-origin");
    myHeaders.append(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
    );
    // myHeaders.append(
    //   "x-zcsrf-token",
    //   "crmcsrfparam=f4e26974bfb0ce8a2e5b22124a93149a2af44d0444bb2da649fecf18e08767d1b4db9d30ecb77e44071e095be7999b1b5dbf652283b324c880ce2dd3082a4ce2"
    // );

    const requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow",
    };
    let tickets = null;

    try {
      let tickets_data = await fetch(
        "https://desk.zoho.com/supportapi/zd/flyingcolourtaxconsultant/api/v1/tickets?include=contacts,products,assignee,team,isRead&departmentId=352352000000006907&viewId=352352000000007523&limit=100&sortBy=-recentThread&filters=%7B%22criteria%22%3A%7B%22fieldConditions%22%3A%5B%5D%7D%7D&from=" +
          from,
        requestOptions
      );
      tickets = await tickets_data.json();
    } catch (error) {}

    return tickets;
  }

  async function FetchTotalTicketCount(header, orgid) {
    const myHeaders = new Headers();
    myHeaders.append("accept", "*/*");
    myHeaders.append("accept-language", "en-US,en;q=0.9");
    myHeaders.append("content-type", "application/json");
    myHeaders.append("cookie", header);
    myHeaders.append(
      "featureflags",
      "multiLayout,agentDeptOpt,pvtThread,ticketTeam,commentAttachment,spamDetails,taskReminder,showI18NFields,onholdTicketStatus,Blueprint,timeTracking,sharedDepartments,secondaryContacts,truncateContent,customChannels,apiName,blockQuoteContent,reactChanges,newHistoryFormat,getVisitorInfo,sanitizedName,sanitizedDeptNameOpt,handleClosedStatusPermission,providePHIDetails,contact,showIsNested,requestFromNewClient"
    );
    myHeaders.append("orgid", YOUR_ORGANIZATION_ID);
    myHeaders.append("priority", "u=1, i");
    myHeaders.append("referer", "https://desk.zoho.com/agent/");
    myHeaders.append(
      "sec-ch-ua",
      '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"'
    );
    myHeaders.append("sec-ch-ua-mobile", "?0");
    myHeaders.append("sec-ch-ua-platform", '"Windows"');
    myHeaders.append("sec-fetch-dest", "empty");
    myHeaders.append("sec-fetch-mode", "cors");
    myHeaders.append("sec-fetch-site", "same-origin");
    myHeaders.append(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
    );
    // myHeaders.append(
    //   "x-zcsrf-token",
    //   "crmcsrfparam=f4e26974bfb0ce8a2e5b22124a93149a2af44d0444bb2da649fecf18e08767d1b4db9d30ecb77e44071e095be7999b1b5dbf652283b324c880ce2dd3082a4ce2"
    // );

    const requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow",
    };
    let count = 0;
    try {
      const response = await fetch(
        `https://desk.zoho.com/supportapi/zd/${orgid}/api/v1/tickets/count?departmentId=352352000000006907&viewId=352352000000007523&receivedInDays=-1&filter=%7B%22criteria%22%3A%7B%22fieldConditions%22%3A%5B%5D%7D%7D`,
        requestOptions
      );
      const result = await response.json();
      return result.count; // Assuming the result has a `count` field
    } catch (error) {
      console.error(error);
      return null; // If there's an error, return null
    }
  }
});
