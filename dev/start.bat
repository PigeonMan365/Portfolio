@echo off
setlocal enabledelayedexpansion

:: Get root directory
set ROOTDIR=%~dp0
cd /d %ROOTDIR%
echo Root directory is: %CD%
echo.

:: =============================
:: INSTALL SERVER DEPENDENCIES
:: =============================
echo Installing server dependencies...
cd server
call npm install
call npm install pg dotenv
call npm install @supabase/supabase-js

cd /d %ROOTDIR%
echo.

:: =============================
:: INSTALL CLIENT DEPENDENCIES
:: =============================
echo Installing client dependencies...
cd client
call npm install
call npm install @spotify/web-playback-sdk-types
cd /d %ROOTDIR%
echo.

:: =============================
:: PULL & START LLaMA MODEL
:: =============================
echo Pulling the llama3 model via Ollama...
call ollama pull llama3 || (
    echo Ollama pull failed. Make sure Ollama is installed.
    pause
    exit /b
)
echo.

echo Starting the llama3 model in a new window...
start "Llama Model" cmd /k "ollama run llama3"
echo.

:: =============================
:: START SERVER
:: =============================
echo Starting the server in a new window...
start "Server" cmd /k "cd /d %ROOTDIR%server && node index.js"
echo.

:: =============================
:: START CLIENT
:: =============================
echo Starting the client in a new window...
start "Client" cmd /k "cd /d %ROOTDIR%client && npm start"
echo.

echo All processes have been launched.
pause
