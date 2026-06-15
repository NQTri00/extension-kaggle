import asyncio
import websockets
import json
import os
import nbformat
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Silence websockets handshake and connection tracebacks from port probing
logging.getLogger("websockets").setLevel(logging.CRITICAL)

# Force print to flush instantly for real-time console logs in Git Bash / MINGW64
import builtins
def print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    builtins.print(*args, **kwargs)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IPYNB_FILE = os.path.join(SCRIPT_DIR, "kaggle_sync.ipynb")
clients = set()
is_writing = False

class NotebookHandler(FileSystemEventHandler):
    def on_modified(self, event):
        global is_writing
        src_path = os.path.normcase(os.path.abspath(event.src_path))
        target_path = os.path.normcase(os.path.abspath(IPYNB_FILE))
        if not event.is_directory and src_path.endswith('.ipynb'):
            print(f"Watchdog detected change: {event.src_path} (normalized: {src_path})")
            print(f"Watching for target: {IPYNB_FILE} (normalized: {target_path})")
        if src_path == target_path and not is_writing:
            print(f"kaggle_sync.ipynb changed locally. Notifying extension...")
            asyncio.run_coroutine_threadsafe(notify_clients(), loop)

async def notify_clients():
    if not clients: return
    try:
        # Wait 100ms to allow the editor to finish writing and release its lock
        await asyncio.sleep(0.1)
        with open(IPYNB_FILE, 'r', encoding='utf-8') as f:
            nb = nbformat.read(f, as_version=4)
        
        cells_data = []
        for cell in nb.cells:
            # We join lines if it's a list, otherwise just use the string
            source = cell.source
            if isinstance(source, list):
                source = "".join(source)
                
            cells_data.append({
                "cell_type": cell.cell_type,
                "source": source
            })
            
        message = json.dumps({"type": "update_from_local", "cells": cells_data})
        websockets.broadcast(clients, message)
    except Exception as e:
        print(f"Error reading notebook: {e}")

async def send_local_to_client(websocket):
    try:
        if not os.path.exists(IPYNB_FILE):
            return
        with open(IPYNB_FILE, 'r', encoding='utf-8') as f:
            nb = nbformat.read(f, as_version=4)
        
        cells_data = []
        for cell in nb.cells:
            source = cell.source
            if isinstance(source, list):
                source = "".join(source)
            cells_data.append({
                "cell_type": cell.cell_type,
                "source": source
            })
            
        message = json.dumps({"type": "update_from_local", "cells": cells_data})
        await websocket.send(message)
        print("Sent initial local notebook state to extension.")
    except Exception as e:
        print(f"Error sending initial notebook: {e}")

async def handler(websocket):
    global is_writing
    clients.add(websocket)
    print("Extension connected.")
    await send_local_to_client(websocket)
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "update_from_kaggle":
                print("Received update from Kaggle, saving to local .ipynb")
                is_writing = True
                
                # Dump raw JSON for debugging
                debug_path = os.path.join(SCRIPT_DIR, 'kaggle_debug.json')
                with open(debug_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
                
                nb = nbformat.v4.new_notebook()
                for cell_data in data["cells"]:
                    if cell_data["cell_type"] == "markdown":
                        nb.cells.append(nbformat.v4.new_markdown_cell(cell_data["source"]))
                    else:
                        code_cell = nbformat.v4.new_code_cell(cell_data["source"])
                        if "outputs" in cell_data:
                            for out in cell_data["outputs"]:
                                if out.get("text"):
                                    code_cell.outputs.append(
                                        nbformat.v4.new_output("stream", name=out.get("name", "stdout"), text=out["text"])
                                    )
                        nb.cells.append(code_cell)
                
                with open(IPYNB_FILE, 'w', encoding='utf-8') as f:
                    nbformat.write(nb, f)
                
                # Small delay to prevent echo back from watchdog
                await asyncio.sleep(0.5)
                is_writing = False
            elif data["type"] == "dump_html":
                html_path = os.path.join(SCRIPT_DIR, "kaggle_dump.html")
                print(f"Received HTML dump from Kaggle. Saving to {html_path}")
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(data["html"])
    except websockets.exceptions.ConnectionClosed:
        print("Extension disconnected.")
    finally:
        clients.remove(websocket)

async def main():
    global loop
    loop = asyncio.get_running_loop()
    
    # Initialize empty notebook if it doesn't exist
    if not os.path.exists(IPYNB_FILE):
        nb = nbformat.v4.new_notebook()
        with open(IPYNB_FILE, 'w', encoding='utf-8') as f:
            nbformat.write(nb, f)
            
    observer = Observer()
    observer.schedule(NotebookHandler(), path=SCRIPT_DIR, recursive=False)
    observer.start()
    
    async with websockets.serve(handler, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        print(f"Watching for changes on {os.path.basename(IPYNB_FILE)} in {SCRIPT_DIR}...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
