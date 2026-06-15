console.log("Kaggle Antigravity Sync: content script loaded");

// Inject script into main page to access Monaco editor API
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// WebSocket connection to local server
let ws = null;
let isConnected = false;

function connectWebSocket() {
    ws = new WebSocket("ws://localhost:8765");
    
    ws.onopen = function() {
        console.log("Kaggle Antigravity Sync: Connected to local sync server.");
        isConnected = true;
        // Request an initial push to Kaggle just in case
    };
    
    ws.onmessage = function(event) {
        let data = JSON.parse(event.data);
        if (data.type === 'update_from_local') {
            console.log("Kaggle Antigravity Sync: Received update from local file.", data.cells);
            
            // Send to injected script to update Monaco editor
            window.postMessage({
                type: 'KAGGLE_SYNC_UPDATE_KAGGLE',
                cells: data.cells
            }, '*');
        }
    };
    
    ws.onclose = function() {
        console.log("Kaggle Antigravity Sync: Disconnected. Reconnecting in 3s...");
        isConnected = false;
        setTimeout(connectWebSocket, 3000);
    };
}

connectWebSocket();

// Listen for messages from injected script (extracting Kaggle cells)
window.addEventListener("message", (event) => {
    // We only accept messages from ourselves
    if (event.source !== window) return;

    if (event.data.type && (event.data.type === "KAGGLE_SYNC_EXTRACTED_CELLS")) {
        if (isConnected) {
            console.log("Kaggle Antigravity Sync: Sending Kaggle cells to local server.");
            ws.send(JSON.stringify({
                type: 'update_from_kaggle',
                cells: event.data.cells
            }));
        }
    }
    else if (event.data.type && (event.data.type === "KAGGLE_SYNC_DUMP_HTML")) {
        if (isConnected) {
            console.log("Kaggle Antigravity Sync: Sending HTML dump to local server.");
            ws.send(JSON.stringify({
                type: 'dump_html',
                html: event.data.html
            }));
        }
    }
    else if (event.data.type && (event.data.type === "KAGGLE_SYNC_ADD_CELL")) {
        console.log("Kaggle Antigravity Sync: Attempting to create a new cell on Kaggle.");
        // Kaggle disables right-click so we'll just aggressively search for the Add Code button
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
        const addCodeBtn = buttons.find(b => {
            const text = (b.innerText || b.textContent || "").toLowerCase();
            return text.includes('+ code') || text.includes('add code') || b.getAttribute('aria-label')?.toLowerCase().includes('add code');
        });
        
        if (addCodeBtn) {
            console.log("Kaggle Antigravity Sync: Found Add Code button! Clicking it.", addCodeBtn);
            addCodeBtn.click();
        } else {
            console.error("Kaggle Antigravity Sync: Could not find the + Code button in the parent window.");
        }
    }
}, false);

