@echo off
setlocal EnableExtensions
title CyriqCap Installer
cd /d "%~dp0"

set "SRC=%~dp0com.cyriq.cyriqcap"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.cyriq.cyriqcap"
set "FONTDIR=%LOCALAPPDATA%\Microsoft\Windows\Fonts"
set "FONTKEY=HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts"

echo.
echo  CyriqCap for After Effects
echo  ---------------------------------------------
echo.

if not exist "%SRC%\CSXS\manifest.xml" (
  echo  The extension folder was not found next to this file.
  echo  Unzip the whole download first, then run this file again.
  goto :fail
)

tasklist /FI "IMAGENAME eq AfterFX.exe" 2>nul | find /I "AfterFX.exe" >nul
if not errorlevel 1 (
  echo  Please close After Effects, then run this file again.
  goto :fail
)

echo  [1/3] Installing the panel...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions" >nul 2>&1
if exist "%DEST%" rmdir /S /Q "%DEST%"
xcopy "%SRC%" "%DEST%\" /E /I /Q /Y /R /H >nul 2>&1
if not exist "%DEST%\CSXS\manifest.xml" (
  echo  The panel could not be copied to:
  echo  %DEST%
  goto :fail
)

echo  [2/3] Allowing the panel to load...
for %%V in (9 10 11 12 13) do (
  reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo  [3/3] Installing fonts...
if not exist "%FONTDIR%" mkdir "%FONTDIR%" >nul 2>&1
pushd "%DEST%\fonts"
for %%F in (*.ttf *.otf) do (
  copy /Y "%%F" "%FONTDIR%\%%~nxF" >nul 2>&1
  reg add "%FONTKEY%" /v "%%~nF (TrueType)" /t REG_SZ /d "%FONTDIR%\%%~nxF" /f >nul 2>&1
)
popd

echo.
echo  Done.
echo.
echo  Open After Effects and choose Window ^> Extensions ^> CyriqCap.
echo  On first launch, choose the CyriqCap-API folder.
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
