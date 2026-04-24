@echo off
REM Generate checksums for release artifacts
REM Run this after building Windows and Android releases

echo ========================================
echo Release Checksum Generator
echo ERP Flow Studios
echo ========================================
echo.

set WINDOWS_SETUP=dist\ERPFlowStudios-Setup.exe
set ANDROID_APK=android\app\build\outputs\apk\release\ERPFlowStudios.apk
set OUTPUT=RELEASE_CHECKSUMS.txt

echo Generating checksums...
echo.

REM Check if files exist
if not exist "%WINDOWS_SETUP%" (
    echo WARNING: Windows setup not found: %WINDOWS_SETUP%
    echo Run: npm run build-desktop
    echo.
)

if not exist "%ANDROID_APK%" (
    echo WARNING: Android APK not found: %ANDROID_APK%
    echo Run: cd android ^&^& gradlew assembleRelease
    echo.
)

REM Generate checksums
echo # ERP Flow Studios Release Checksums > %OUTPUT%
echo Generated: %date% %time% >> %OUTPUT%
echo. >> %OUTPUT%

if exist "%WINDOWS_SETUP%" (
    echo ## Windows Desktop Setup >> %OUTPUT%
    echo File: ERPFlowStudios-Setup.exe >> %OUTPUT%
    for /f "tokens=*" %%i in ('certutil -hashfile "%WINDOWS_SETUP%" SHA256 ^| findstr /v "SHA256 CertUtil"') do echo SHA256: %%i >> %OUTPUT%
    echo. >> %OUTPUT%
    echo [Windows] SHA256:
    certutil -hashfile "%WINDOWS_SETUP%" SHA256 | findstr /v "SHA256 CertUtil"
    echo.
)

if exist "%ANDROID_APK%" (
    echo ## Android APK >> %OUTPUT%
    echo File: ERPFlowStudios.apk >> %OUTPUT%
    for /f "tokens=*" %%i in ('certutil -hashfile "%ANDROID_APK%" SHA256 ^| findstr /v "SHA256 CertUtil"') do echo SHA256: %%i >> %OUTPUT%
    echo. >> %OUTPUT%
    echo [Android] SHA256:
    certutil -hashfile "%ANDROID_APK%" SHA256 | findstr /v "SHA256 CertUtil"
    echo.
)

if exist "%OUTPUT%" (
    echo ========================================
    echo Checksums saved to: %OUTPUT%
    echo ========================================
    echo.
    echo Copy these hashes to:
    echo   1. GitHub release notes
    echo   2. Download page
    echo   3. SECURITY_VERIFICATION.md
    echo.
    type %OUTPUT%
) else (
    echo ERROR: No release artifacts found!
)

echo.
pause
