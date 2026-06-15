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

IPYNB_FILE = "kaggle_sync.ipynb"
clients = set()
is_writing = False

class NotebookHandler(FileSystemEventHandler):
    def on_modified(self, event):
        global is_writing
        if event.src_path.endswith(IPYNB_FILE) and not is_writing:
            print(f"{IPYNB_FILE} changed locally. Notifying extension...")
            asyncio.run_coroutine_threadsafe(notify_clients(), loop)

async def notify_clients():
    if not clients: return
    try:
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

async def handler(websocket):
    global is_writing
    clients.add(websocket)
    print("Extension connected.")
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "update_from_kaggle":
                print("Received update from Kaggle, saving to local .ipynb")
                is_writing = True
                
                # Dump raw JSON for debugging
                with open('kaggle_debug.json', 'w', encoding='utf-8') as f:
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
                print("Received HTML dump from Kaggle. Saving to kaggle_dump.html")
                with open("kaggle_dump.html", "w", encoding="utf-8") as f:
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
    observer.schedule(NotebookHandler(), path=".", recursive=False)
    observer.start()
    
    async with websockets.serve(handler, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        print(f"Watching for changes on {IPYNB_FILE}...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
