@echo off
setlocal enabledelayedexpansion

REM Chrome Monitor - Desktop Application Launcher

title Chrome Monitor

echo.
echo ========================================
echo        Chrome Monitor - Starting
echo ========================================
echo.

cd /d "%~dp0app"

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing Node.js...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    ) else (
        echo [!] Please install Node.js from https://nodejs.org/
        pause
        exit /b 1
    )
    REM Refresh PATH
    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=%%b;%PATH%"
)
echo [OK] Node.js

REM Check Chrome
set CHROME_OK=0
if exist "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" set CHROME_OK=1
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME_OK=1

if %CHROME_OK%==0 (
    echo [*] Installing Chrome...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    )
)
echo [OK] Chrome

REM Install dependencies
echo [*] Installing dependencies...
call npm install --silent >nul 2>&1
echo [OK] Ready

echo.
echo Starting Chrome Monitor...
echo.

REM Run the app
call npm start
