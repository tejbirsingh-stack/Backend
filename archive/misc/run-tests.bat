@echo off
echo ====================================
echo Noah Platform - Test Suite Runner
echo ====================================
echo.

REM Kill any existing processes
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul

echo.
echo Starting API Server for testing...
cd apps\api
start "Noah API Test" cmd /k "set PORT=4000 && npm run dev:simple"

timeout /t 3 /nobreak > nul

echo.
echo ====================================
echo API Server started on port 4000
echo ====================================
echo.
echo Opening test suite in browser...
echo.
echo Test Instructions:
echo 1. Click "Run All Tests" to test everything
echo 2. Or run individual test groups
echo 3. Check the logs for detailed results
echo.

start test-suite.html

echo Press any key to stop the test server...
pause > nul

REM Kill the test server
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /F /PID %%a 2>nul

echo.
echo Test server stopped.