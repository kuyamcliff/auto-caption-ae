@echo off
setlocal EnableExtensions
title CyriqCap Uninstaller
cd /d "%~dp0"

set "DEST=%APPDATA%\Adobe\CEP\extensions\com.cyriq.cyriqcap"
set "FONTDIR=%LOCALAPPDATA%\Microsoft\Windows\Fonts"
set "FONTKEY=HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts"

echo.
echo  Remove CyriqCap from After Effects
echo  ---------------------------------------------
echo.

tasklist /FI "IMAGENAME eq AfterFX.exe" 2>nul | find /I "AfterFX.exe" >nul
if not errorlevel 1 (
  echo  Please close After Effects, then run this file again.
  echo.
  pause
  exit /b 1
)

set "ANS=N"
set /p "ANS= Also remove the CyriqCap fonts? (Y/N): "
set "ANS=%ANS:~0,1%"

if /I "%ANS%"=="Y" if exist "%DEST%\fonts" (
  pushd "%DEST%\fonts"
  for %%F in (*.ttf *.otf) do (
    reg delete "%FONTKEY%" /v "%%~nF (TrueType)" /f >nul 2>&1
    del /F /Q "%FONTDIR%\%%~nxF" >nul 2>&1
  )
  popd
)

if exist "%DEST%" rmdir /S /Q "%DEST%"

echo.
echo  CyriqCap was removed. The CyriqCap-API folder was not changed;
echo  delete it yourself if you no longer need it.
echo.
pause
exit /b 0
