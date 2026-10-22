@echo off
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies for the first time, please wait...
  call npm install
)

rem Make sure only one server runs at a time.
set STATUS=
for /f %%i in ('curl -s -o NUL -w "%%{http_code}" http://localhost:3000/api/score 2^>nul') do set STATUS=%%i

if "%STATUS%"=="200" (
  echo A server is already running on port 3000.
  echo Close that terminal window first if you want to restart it.
  pause
  exit
)

echo Starting overlay server. Closing this window will stop the server.
echo.
node server.js
