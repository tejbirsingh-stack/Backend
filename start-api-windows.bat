@echo off
echo ====================================
echo Starting Noah API Server
echo ====================================
echo.

cd /d "C:\Users\don63\OneDrive\Documents\GitHub\noah\apps\api"

echo Checking Node.js installation...
node --version
echo.

echo Installing dependencies if needed...
call npm install
echo.

echo Starting API server on port 4000...
echo.
set PORT=4000
npx tsx src\simple-api.ts

pause