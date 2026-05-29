@echo off
echo Starting Noah Media Platform...
echo.

REM Kill any existing processes on the ports
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul

echo.
echo Starting API Server on port 4000...
cd apps\api
start "Noah API" cmd /k "set PORT=4000 && npm run dev:simple"

timeout /t 3 /nobreak > nul

echo Starting Web Application on port 3000...
cd ..\web
start "Noah Web" cmd /k "npm run dev"

echo.
echo ====================================
echo Noah Media Platform is starting...
echo ====================================
echo.
echo API Server: http://localhost:4000
echo Web Application: http://localhost:3000
echo.
echo Login with any email/password to test
echo Upload files via the Media Browser
echo.
echo Press any key to open the web application...
pause > nul

start http://localhost:3000