@echo off
cd /d "%~dp0"
echo Starting local server at http://localhost:8080
echo Open this URL in Chrome or Edge, then allow microphone.
start http://localhost:8080
python -m http.server 8080
