@echo off
setlocal enabledelayedexpansion

:: Get root directory
set ROOTDIR=%~dp0
cd /d %ROOTDIR%
echo Root directory is: %CD%
echo.

:: =============================
:: KILL LLAMA3 MODEL (if running)
:: =============================
echo Checking for running Ollama model...
tasklist | findstr /I "ollama" >nul
if %errorlevel%==0 (
    echo Killing Ollama model...
    taskkill /f /im ollama.exe >nul 2>&1
) else (
    echo No Ollama model found running.
)
echo.

:: =============================
:: STOPPING SERVER WINDOWS
:: =============================
echo Attempting to close any open server/terminal windows...
taskkill /f /fi "WINDOWTITLE eq Llama Model" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq node server" >nul 2>&1
echo.

:: =============================
:: DELETE CLIENT/ AND SERVER/ DEPENDENCIES
:: =============================
echo Deleting node_modules and package-locks...

cd server
if exist node_modules (
    rmdir /s /q node_modules
)
if exist package-lock.json (
    del /f /q package-lock.json
)
cd ..

cd client
if exist node_modules (
    rmdir /s /q node_modules
)
if exist package-lock.json (
    del /f /q package-lock.json
)
cd ..

echo.

:: =============================
:: OPTIONAL CLEANUP
:: =============================
if exist .env (
    echo Deleting .env file...
    del /f /q .env
)

if exist logs (
    echo Deleting logs folder...
    rmdir /s /q logs
)

echo.

:: =============================
:: DONE
:: =============================
echo Uninstallation complete. Environment cleaned.
pause
