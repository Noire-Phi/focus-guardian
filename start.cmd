@echo off
rem Double-click to run Focus Guardian: installs packages when needed, starts the
rem development server and opens the app in your browser. Close this window to stop it.
title Focus Guardian
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get version 24 or newer from https://nodejs.org
  echo then double-click this file again.
  pause
  exit /b 1
)

rem Install on the first run, and again whenever package-lock.json changes: the lock file's
rem hash is saved in node_modules after each install and compared here
set "STAMP=node_modules\.focus-guardian-lock"
node -e "const f=require('fs'),h=require('crypto').createHash('sha1').update(f.readFileSync('package-lock.json')).digest('hex');let s='';try{s=f.readFileSync(process.argv[1],'utf8')}catch{};process.exit(s===h?0:1)" "%STAMP%"
if errorlevel 1 (
  echo Installing packages, this takes a minute the first time...
  call npm ci
  if errorlevel 1 (
    echo Installing failed. See the messages above.
    pause
    exit /b 1
  )
  node -e "const f=require('fs');f.writeFileSync(process.argv[1],require('crypto').createHash('sha1').update(f.readFileSync('package-lock.json')).digest('hex'))" "%STAMP%"
)

call npm start
if errorlevel 1 pause
