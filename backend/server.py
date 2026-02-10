"""
This is a shim that forwards all requests to the Node.js backend.
The actual backend is in /app/backend-node
"""
import subprocess
import os
import sys
import signal
import time

# Start Node.js backend
node_process = None

def start_node():
    global node_process
    os.chdir('/app/backend-node')
    node_process = subprocess.Popen(
        ['node', 'server.js'],
        stdout=sys.stdout,
        stderr=sys.stderr,
        cwd='/app/backend-node'
    )
    return node_process

def signal_handler(signum, frame):
    if node_process:
        node_process.terminate()
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

if __name__ == '__main__':
    proc = start_node()
    proc.wait()
