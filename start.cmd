@echo off
setlocal
cd /d "%~dp0"
set "PYBLOCKS_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined PYBLOCKS_NODE set "PYBLOCKS_NODE=%%N"
if not defined PYBLOCKS_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "PYBLOCKS_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined PYBLOCKS_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PYBLOCKS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined PYBLOCKS_NODE (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
"%PYBLOCKS_NODE%" "%~dp0server.mjs"
if errorlevel 1 pause
