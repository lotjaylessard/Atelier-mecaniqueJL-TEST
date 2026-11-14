@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 "start-s08-preview.py"
) else (
  python "start-s08-preview.py"
)
if errorlevel 1 (
  echo.
  echo Impossible de demarrer Python. Verifiez l'installation de Python 3.
  pause
)
