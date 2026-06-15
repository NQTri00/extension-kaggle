console.log("Kaggle Antigravity Sync: Injected script loaded into main page context");

function extractCells() {
    let cells = [];
    
    console.log("Kaggle Antigravity Sync: Attempting to extract cells...");
    
    if (window.monaco) {
        console.log("Kaggle Antigravity Sync: Found window.monaco");
        const models = window.monaco.editor.getModels();
        console.log("Kaggle Antigravity Sync: Found " + models.length + " Monaco models");
        for (let model of models) {
            cells.push({
                cell_type: "code", 
                source: model.getValue()
            });
        }
    } else {
        console.warn("Kaggle Antigravity Sync: window.monaco not found! Trying aggressive DOM fallback...");
        
        let extracted = false;
        
        // Strategy 1: JupyterLab specific (.jp-Cell)
        if (!extracted) {
            const jpCells = document.querySelectorAll('.jp-Cell');
            if (jpCells.length > 0) {
                jpCells.forEach(cell => {
                    const isMarkdown = cell.classList.contains('jp-MarkdownCell');
                    const cmElement = cell.querySelector('.cm-content');
                    
                    if (cmElement) {
                        let sourceLines = Array.from(cmElement.querySelectorAll('.cm-line')).map(line => line.textContent).join('\n');
                        let cellData = {
                            cell_type: isMarkdown ? "markdown" : "code",
                            source: sourceLines || cmElement.innerText || cmElement.textContent || ""
                        };
                        
                        if (!isMarkdown) {
                            cellData.outputs = [];
                            const outputChildren = cell.querySelectorAll('.jp-OutputArea-child');
                            outputChildren.forEach(child => {
                                const outputBody = child.querySelector('.jp-OutputArea-output');
                                if (outputBody) {
                                    const mimeType = outputBody.getAttribute('data-mime-type') || '';
                                    let text = outputBody.textContent || "";
                                    
                                    if (text.trim() !== '') {
                                        cellData.outputs.push({
                                            output_type: "stream",
                                            name: mimeType.includes('stderr') ? "stderr" : "stdout",
                                            text: text
                                        });
                                    }
                                }
                            });
                        }
                        
                        cells.push(cellData);
                    }
                });
                extracted = true;
            }
        }
        
        // Strategy 2: CodeMirror 6 (.cm-content)
        if (!extracted) {
            const cm6 = document.querySelectorAll('.cm-content');
            if (cm6.length > 0) {
                console.log(`Kaggle Antigravity Sync: Found ${cm6.length} CodeMirror 6 editors.`);
                cm6.forEach(container => {
                    cells.push({ cell_type: "code", source: container.innerText || "" });
                });
                extracted = true;
            }
        }
        
        // Strategy 3: CodeMirror 5 (.CodeMirror-code)
        if (!extracted) {
            const cm5 = document.querySelectorAll('.CodeMirror-code');
            if (cm5.length > 0) {
                console.log(`Kaggle Antigravity Sync: Found ${cm5.length} CodeMirror 5 editors.`);
                cm5.forEach(container => {
                    cells.push({ cell_type: "code", source: container.innerText || "" });
                });
                extracted = true;
            }
        }
        
        // Strategy 4: Monaco DOM fallback (.view-lines)
        if (!extracted) {
            const monacoLines = document.querySelectorAll('.view-lines');
            if (monacoLines.length > 0) {
                console.log(`Kaggle Antigravity Sync: Found ${monacoLines.length} Monaco editors.`);
                monacoLines.forEach(container => {
                    cells.push({ cell_type: "code", source: container.innerText || "" });
                });
                extracted = true;
            }
        }
        
        // Strategy 5: Generic contenteditable (often used for editors)
        if (!extracted) {
            // Find contenteditable divs that might be the editor
            const editables = document.querySelectorAll('div[contenteditable="true"]');
            const likelyEditors = Array.from(editables).filter(e => e.innerText && e.innerText.length > 5);
            if (likelyEditors.length > 0) {
                console.log(`Kaggle Antigravity Sync: Found ${likelyEditors.length} generic contenteditable blocks.`);
                likelyEditors.forEach(container => {
                    cells.push({ cell_type: "code", source: container.innerText || "" });
                });
                extracted = true;
            }
        }
        
        if (!extracted) {
            console.warn("Kaggle Antigravity Sync: Could not find ANY known editor elements in the DOM. Dumping HTML to local server for inspection.");
            window.postMessage({
                type: 'KAGGLE_SYNC_DUMP_HTML',
                html: document.body.innerHTML
            }, '*');
        }
    }
    
    console.log("Kaggle Antigravity Sync: Extracted cells:", cells);
    return cells;
}

function updateCells(cellsData) {
    console.log("Kaggle Antigravity Sync: Updating Kaggle UI with cells from local...");
    isUpdatingFromLocal = true;
    
    // This is the hard part - dynamically adding cells or updating existing ones in Kaggle.
    // Since Kaggle uses React, mutating the DOM directly often won't stick or will crash the page.
    // Setting values on Monaco models will work for existing cells.
    
    if (window.monaco) {
        const models = window.monaco.editor.getModels();
        for (let i = 0; i < Math.min(models.length, cellsData.length); i++) {
            // Update existing cell content
            models[i].setValue(cellsData[i].source);
        }
    } else {
        // JupyterLab / CodeMirror 6 DOM-based update
        const jpCells = document.querySelectorAll('.jp-Cell');
        if (jpCells.length > 0) {
            for (let i = 0; i < Math.min(jpCells.length, cellsData.length); i++) {
                const cell = jpCells[i];
                const cm = cell.querySelector('.cm-content');
                if (!cm) continue;
                
                const newText = cellsData[i].source;
                
                // Determine current text to avoid infinite loops and losing cursor focus
                let currentText = Array.from(cm.querySelectorAll('.cm-line')).map(line => line.textContent).join('\n');
                if (!currentText) currentText = cm.innerText || cm.textContent || "";
                
                if (currentText.trim() !== newText.trim()) {
                    console.log(`Kaggle Antigravity Sync: Updating cell ${i} from local change...`);
                    cm.focus();
                    
                    // Ensure we strictly select only this editor's content before replacing
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(cm);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    document.execCommand('insertText', false, newText);
                }
            }
        }
    }
    
    if (cellsData.length > document.querySelectorAll('.jp-Cell, .cm-content').length) {
        console.warn("Kaggle Antigravity Sync: Cannot automatically create new cells yet. Only existing cells were updated.");
    }
    
    // Give it a tiny buffer to absorb React's input event propagation
    setTimeout(() => { isUpdatingFromLocal = false; }, 500);
}

// Listen for messages from content.js
window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'KAGGLE_SYNC_REQUEST_EXTRACT') {
        if (window.__kaggleSyncCooldown && Date.now() < window.__kaggleSyncCooldown) return;
        const cells = extractCells();
        window.postMessage({
            type: 'KAGGLE_SYNC_EXTRACTED_CELLS',
            cells: cells
        }, '*');
    }
    else if (event.data.type === 'KAGGLE_SYNC_UPDATE_KAGGLE') {
        updateCells(event.data.cells);
    }
}, false);

// --- Event-Driven Sync Architecture ---
let syncDebounce = null;
let isUpdatingFromLocal = false; // Flag to prevent infinite loop

function triggerKaggleSync() {
    if (isUpdatingFromLocal) return; // Don't trigger Kaggle->Local sync while Local->Kaggle is typing
    if (window.__kaggleSyncCooldown && Date.now() < window.__kaggleSyncCooldown) return;
    
    if (syncDebounce) clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => {
        if (document.querySelectorAll('.cm-content, .CodeMirror-code, .view-lines, .jp-Cell').length > 0 || window.monaco) {
            const cells = extractCells();
            if (cells.length > 0) {
                window.postMessage({
                    type: 'KAGGLE_SYNC_EXTRACTED_CELLS',
                    cells: cells
                }, '*');
            }
        }
    }, 1500); // 1.5s debounce
}

// 1. Listen for typing in the editor
document.addEventListener('input', triggerKaggleSync, true);
document.addEventListener('keyup', triggerKaggleSync, true);

// 2. Listen for output changes or cell additions/deletions via MutationObserver
const observer = new MutationObserver((mutations) => {
    // Only trigger if we see relevant DOM changes (like output areas being added/modified)
    let shouldSync = false;
    for (let m of mutations) {
        if (m.target.nodeType === 1) { // Element node
            const el = m.target;
            if (el.classList && (el.classList.contains('jp-OutputArea-child') || el.classList.contains('jp-Cell'))) {
                shouldSync = true;
                break;
            }
        }
    }
    if (shouldSync) triggerKaggleSync();
});

// Start observing once the body is available
setTimeout(() => {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log("Kaggle Antigravity Sync: Event-driven MutationObserver attached.");
}, 3000);
