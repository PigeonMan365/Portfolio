#!/bin/bash

# Get root directory
ROOTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$ROOTDIR"
echo "Root directory is: $PWD"
echo

# =============================
# INSTALL SERVER DEPENDENCIES
# =============================
echo "Installing server dependencies..."
cd server
npm install
npm install pg dotenv
npm install @supabase/supabase-js

cd "$ROOTDIR"
echo

# =============================
# INSTALL CLIENT DEPENDENCIES
# =============================
echo "Installing client dependencies..."
cd client
npm install
cd "$ROOTDIR"
echo

# =============================
# PULL & START LLaMA MODEL
# =============================
echo "Pulling the llama3 model via Ollama..."
if ! ollama pull llama3; then
    echo "Ollama pull failed. Make sure Ollama is installed."
    read -p "Press Enter to exit..."
    exit 1
fi
echo

echo "Starting the llama3 model in a new terminal..."
osascript -e 'tell application "Terminal" to do script "cd '"$ROOTDIR"' && ollama run llama3"'
echo

# =============================
# START SERVER
# =============================
echo "Starting the server in a new terminal..."
osascript -e 'tell application "Terminal" to do script "cd '"$ROOTDIR"'/server && node index.js"'
echo

# =============================
# START CLIENT
# =============================
echo "Starting the client in a new terminal..."
osascript -e 'tell application "Terminal" to do script "cd '"$ROOTDIR"'/client && npm start"'
echo

echo "All processes have been launched."
read -p "Press Enter to continue..."