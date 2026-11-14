@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Pour verifier votre sauvegarde S08, glissez le dossier contenant
  echo manifest.json sur ce fichier Verifier-S08-Sauvegarde-Windows.bat
  echo.
  pause
  exit /b 2
)
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 "audit\s08-verify-physical-backup.py" "%~1"
) else (
  python "audit\s08-verify-physical-backup.py" "%~1"
)
echo.
echo Aucun fichier cloud n'a ete modifie.
pause
