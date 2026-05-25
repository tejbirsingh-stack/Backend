@echo off
title Noah Platform Startup
cls
echo =====================================
echo  Noah Media Platform - Windows Setup
echo =====================================
echo.

REM Kill any existing processes on our ports
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000"') do (
    echo Killing process on port 4000 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)
echo.

REM Navigate to API directory
echo Navigating to API directory...
cd /d "%~dp0apps\api"
if %errorlevel% neq 0 (
    echo ERROR: Could not find apps\api directory
    echo Please ensure you're running this from the noah project root
    pause
    exit /b 1
)
echo Current directory: %cd%
echo.

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)
node --version
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing API dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed
)
echo.

REM Check if tsx is available
echo Checking for tsx package...
call npx tsx --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing tsx globally...
    call npm install -g tsx
)
echo.

REM Start the API server
echo =====================================
echo Starting API Server on port 4000
echo =====================================
echo.
echo API will be available at:
echo   http://localhost:4000
echo   http://localhost:4000/health
echo.
echo Web app is on port 3002:
echo   http://localhost:3002
echo.
echo Press Ctrl+C to stop the server
echo =====================================
echo.

set PORT=4000
call npx tsx src/simple-api.ts