# Kaggle Antigravity Sync

A real-time, two-way synchronization tool designed to link a local Jupyter Notebook (`kaggle_sync.ipynb`) directly with a Kaggle notebook editor in your browser. 

This project consists of:
1. A **Local WebSocket Server** (`server/sync_server.py`) that watches for local notebook changes and hosts the websocket connection.
2. A **Chrome Extension** (`extension/`) that injects a script into the Kaggle tab, listens to editor changes, and synchronizes the code cells and outputs bidirectionally.

---

## Features

- **Real-Time Two-Way Sync:** Changes in your local `kaggle_sync.ipynb` are immediately pushed to Kaggle, and updates/run outputs from Kaggle are written back locally.
- **Robust Editor Support:** Targets the Monaco editor used by Kaggle, with fallback strategies for JupyterLab/CodeMirror 5/6 and generic text areas.
- **Smart Debouncing:** Event-driven synchronization prevents save loops and keeps the cursor focused during typing.
- **Clean Logs:** Handshake noise from background port probes (such as IDE port-forwarding helpers) is automatically suppressed.

---

## Installation & Setup

### 1. Run the Local Server
Navigate to the server directory, install dependencies, and start the sync server:

```bash
cd server
pip install -r requirements.txt
python sync_server.py
```

*The server will create an empty `kaggle_sync.ipynb` in the `server/` directory if it does not already exist and begin listening on `ws://localhost:8765`.*

### 2. Install the Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `extension/` folder in this repository.

---

## How to Use

1. Start your local server (`python sync_server.py`).
2. Open your target notebook on Kaggle in Chrome.
3. The Chrome extension will automatically connect to your local server. Look at the console logs in the tab's Developer Tools to verify:
   > `Kaggle Antigravity Sync: Connected to local sync server.`
4. Open the generated `server/kaggle_sync.ipynb` in your favorite local Jupyter environment (e.g. VS Code, JupyterLab).
5. **Editing:**
   - Any edits made locally will be automatically pushed and updated in the Kaggle UI cells.
   - Any edits or output changes (after running a cell) in Kaggle will be written back to `kaggle_sync.ipynb` locally.