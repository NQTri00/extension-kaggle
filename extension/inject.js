console.log("Kaggle Antigravity Sync: Injected script loaded into main page context");

// Helper to find Jupyter Notebook 7 / JupyterLab application
function getJupyterApp() {
    return window.app || window.jupyterapp || window.jupyterlab;
}

// Helper to find the active Notebook panel widget
function getNotebookWidget() {
    const app = getJupyterApp();
    if (!app || !app.shell) return null;
    
    // 1. Try shell.currentWidget
    let widget = app.shell.currentWidget;
    if (widget && widget.model && widget.model.sharedModel && widget.content && typeof widget.content.activeCell !== 'undefined') {
        return widget;
    }
    
    // 2. Try iterating over all widgets in the shell
    if (app.shell.widgets) {
        const widgets = Array.from(app.shell.widgets());
        for (const w of widgets) {
            if (w.model && w.model.sharedModel && w.content && typeof w.content.activeCell !== 'undefined') {
                return w;
            }
        }
    }
    return null;
}

function extractCells() {
    let cells = [];
    console.log("Kaggle Antigravity Sync: Attempting to extract cells...");
    
    // Method 1: Jupyter sharedModel (Notebook 7 / JupyterLab 4)
    const widget = getNotebookWidget();
    if (widget && widget.model && widget.model.sharedModel) {
        console.log("Kaggle Antigravity Sync: Extracting cells via Jupyter sharedModel");
        const sharedModel = widget.model.sharedModel;
        const sharedCells = sharedModel.cells || [];
        for (let i = 0; i < sharedCells.length; i++) {
            const cell = sharedCells[i];
            cells.push({
                cell_type: cell.cell_type,
                source: cell.getSource() || ""
            });
        }
        console.log("Kaggle Antigravity Sync: Extracted via sharedModel:", cells);
        return cells;
    }
    
    // Method 2: Monaco
    if (window.monaco) {
        console.log("Kaggle Antigravity Sync: Found window.monaco");
        const models = window.monaco.editor.getModels();
        for (let model of models) {
            cells.push({
                cell_type: "code", 
                source: model.getValue()
            });
        }
        return cells;
    }
    
    // Method 3: DOM Fallback
    console.warn("Kaggle Antigravity Sync: No programmatic model found. Falling back to DOM...");
    const jpCells = document.querySelectorAll('.jp-Cell');
    if (jpCells.length > 0) {
        jpCells.forEach(cell => {
            const isMarkdown = cell.classList.contains('jp-MarkdownCell');
            const cmElement = cell.querySelector('.cm-content');
            if (cmElement) {
                let sourceLines = Array.from(cmElement.querySelectorAll('.cm-line')).map(line => line.textContent).join('\n');
                cells.push({
                    cell_type: isMarkdown ? "markdown" : "code",
                    source: sourceLines || cmElement.innerText || cmElement.textContent || ""
                });
            }
        });
        return cells;
    }
    
    return cells;
}

function updateCells(cellsData) {
    console.log("Kaggle Antigravity Sync: Updating Kaggle UI with cells from local...");
    isUpdatingFromLocal = true;
    
    // Method 1: Jupyter sharedModel (Notebook 7 / JupyterLab 4)
    const widget = getNotebookWidget();
    if (widget && widget.model && widget.model.sharedModel) {
        console.log("Kaggle Antigravity Sync: Updating via Jupyter sharedModel");
        const sharedModel = widget.model.sharedModel;
        
        // Cooldown to prevent recursive sync loop
        window.__kaggleSyncCooldown = Date.now() + 1000;
        
        // Update existing cells or insert new ones
        for (let i = 0; i < cellsData.length; i++) {
            const newCell = cellsData[i];
            if (i < sharedModel.cells.length) {
                const currentCell = sharedModel.cells[i];
                if (currentCell.cell_type !== newCell.cell_type) {
                    sharedModel.deleteCell(i);
                    sharedModel.insertCell(i, {
                        cell_type: newCell.cell_type,
                        source: newCell.source
                    });
                } else {
                    const currentText = currentCell.getSource() || "";
                    if (currentText !== newCell.source) {
                        currentCell.setSource(newCell.source);
                    }
                }
            } else {
                sharedModel.insertCell(i, {
                    cell_type: newCell.cell_type,
                    source: newCell.source
                });
            }
        }
        
        // Remove extra cells
        while (sharedModel.cells.length > cellsData.length) {
            sharedModel.deleteCell(cellsData.length);
        }
        
        setTimeout(() => { isUpdatingFromLocal = false; }, 500);
        return;
    }
    
    // Method 2: Monaco
    if (window.monaco) {
        console.log("Kaggle Antigravity Sync: Updating via Monaco");
        const models = window.monaco.editor.getModels();
        for (let i = 0; i < Math.min(models.length, cellsData.length); i++) {
            if (models[i].getValue() !== cellsData[i].source) {
                models[i].setValue(cellsData[i].source);
            }
        }
        setTimeout(() => { isUpdatingFromLocal = false; }, 500);
        return;
    }
    
    // Method 3: DOM Fallback
    console.warn("Kaggle Antigravity Sync: No programmatic model found. Updating via DOM...");
    const jpCells = document.querySelectorAll('.jp-Cell');
    if (jpCells.length > 0) {
        for (let i = 0; i < Math.min(jpCells.length, cellsData.length); i++) {
            const cell = jpCells[i];
            const newText = cellsData[i].source;
            const cm = cell.querySelector('.cm-content');
            if (!cm) continue;
            
            let currentText = Array.from(cm.querySelectorAll('.cm-line')).map(line => line.textContent).join('\n');
            if (!currentText) currentText = cm.innerText || cm.textContent || "";
            
            if (currentText.trim() !== newText.trim()) {
                cm.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(cm);
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('insertText', false, newText);
            }
        }
    }
    
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
let isUpdatingFromLocal = false;

function triggerKaggleSync() {
    if (isUpdatingFromLocal) return;
    if (window.__kaggleSyncCooldown && Date.now() < window.__kaggleSyncCooldown) return;
    
    if (syncDebounce) clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => {
        const cells = extractCells();
        if (cells.length > 0) {
            window.postMessage({
                type: 'KAGGLE_SYNC_EXTRACTED_CELLS',
                cells: cells
            }, '*');
        }
    }, 1500); // 1.5s debounce
}

// 1. Listen for typing in the editor (fallback if model events are not active)
document.addEventListener('input', triggerKaggleSync, true);
document.addEventListener('keyup', triggerKaggleSync, true);

// 2. Listen for output changes or cell additions/deletions via MutationObserver
const observer = new MutationObserver((mutations) => {
    let shouldSync = false;
    for (let m of mutations) {
        if (m.target.nodeType === 1) {
            const el = m.target;
            if (el.classList && (el.classList.contains('jp-OutputArea-child') || el.classList.contains('jp-Cell'))) {
                shouldSync = true;
                break;
            }
        }
    }
    if (shouldSync) triggerKaggleSync();
});

setTimeout(() => {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log("Kaggle Antigravity Sync: Event-driven MutationObserver attached.");
}, 3000);

// 3. Programmatic Model Signals binding (Jupyter sharedModel)
function setupModelListeners() {
    const widget = getNotebookWidget();
    if (widget && widget.model && widget.model.sharedModel) {
        const sharedModel = widget.model.sharedModel;
        
        if (sharedModel.__kaggleSyncBound) return;
        sharedModel.__kaggleSyncBound = true;
        
        console.log("Kaggle Antigravity Sync: Binding to Jupyter sharedModel changes.");
        
        const handleChange = () => {
            triggerKaggleSync();
        };
        
        if (sharedModel.changed && typeof sharedModel.changed.connect === 'function') {
            sharedModel.changed.connect(handleChange);
        }
    }
}

// Scan periodically to bind to newly opened notebooks or model re-initializations
setInterval(setupModelListeners, 2000);
