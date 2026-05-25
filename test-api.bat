@echo off
echo Testing Noah API Server...
echo.

cd /d "%~dp0apps\api"

echo Starting API on port 4000...
set PORT=4000
npx tsx src/simple-api.ts