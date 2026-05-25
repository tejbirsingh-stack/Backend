@echo off
cls
echo =====================================
echo  Noah Media Platform - Full Start
echo =====================================
echo.
echo Web App will run on: http://localhost:3002
echo API will run on: http://localhost:4000
echo.

REM Kill existing processes
echo Cleaning up any existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000"') do taskkill /F /PID %%a 2>nul

echo.
echo [1/2] Starting API Server...
cd /d "%~dp0apps\api"
start "Noah API Server" cmd /c "set PORT=4000 && npx tsx src/simple-api.ts"

echo Waiting for API to start...
timeout /t 3 /nobreak >nul

echo.
echo [2/2] Starting Web Application...
cd /d "%~dp0apps\web"
start "Noah Web App" cmd /c "npm run dev"

echo.
echo =====================================
echo  Services are starting...
echo =====================================
echo.
echo API Server:     http://localhost:4000
echo Health Check:   http://localhost:4000/health
echo Web App:        http://localhost:3002
echo.
echo Login: Use ANY email and password
echo.
echo Opening web app in 5 seconds...
timeout /t 5 /nobreak >nul

start http://localhost:3002

echo.
echo Press any key to stop all services...
pause >nul

REM Kill the services
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002"') do taskkill /F /PID %%a 2>nul

echo Services stopped.