#!/bin/bash
# Generate checksums for release artifacts
# Run this after building Windows and Android releases

echo "========================================"
echo "Release Checksum Generator"
echo "ERP Flow Studios"
echo "========================================"
echo ""

WINDOWS_SETUP="dist/ERPFlowStudios-Setup.exe"
ANDROID_APK="android/app/build/outputs/apk/release/ERPFlowStudios.apk"
OUTPUT="RELEASE_CHECKSUMS.txt"

echo "Generating checksums..."
echo ""

# Check if files exist
if [ ! -f "$WINDOWS_SETUP" ]; then
    echo "WARNING: Windows setup not found: $WINDOWS_SETUP"
    echo "Run: npm run build-desktop"
    echo ""
fi

if [ ! -f "$ANDROID_APK" ]; then
    echo "WARNING: Android APK not found: $ANDROID_APK"
    echo "Run: cd android && ./gradlew assembleRelease"
    echo ""
fi

# Generate checksums
{
    echo "# ERP Flow Studios Release Checksums"
    echo "Generated: $(date)"
    echo ""
} > "$OUTPUT"

if [ -f "$WINDOWS_SETUP" ]; then
    {
        echo "## Windows Desktop Setup"
        echo "File: ERPFlowStudios-Setup.exe"
        echo -n "SHA256: "
        if command -v sha256sum &> /dev/null; then
            sha256sum "$WINDOWS_SETUP" | awk '{print $1}'
        elif command -v shasum &> /dev/null; then
            shasum -a 256 "$WINDOWS_SETUP" | awk '{print $1}'
        fi
        echo ""
    } >> "$OUTPUT"
    
    echo "[Windows] SHA256:"
    if command -v sha256sum &> /dev/null; then
        sha256sum "$WINDOWS_SETUP"
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$WINDOWS_SETUP"
    fi
    echo ""
fi

if [ -f "$ANDROID_APK" ]; then
    {
        echo "## Android APK"
        echo "File: ERPFlowStudios.apk"
        echo -n "SHA256: "
        if command -v sha256sum &> /dev/null; then
            sha256sum "$ANDROID_APK" | awk '{print $1}'
        elif command -v shasum &> /dev/null; then
            shasum -a 256 "$ANDROID_APK" | awk '{print $1}'
        fi
        echo ""
    } >> "$OUTPUT"
    
    echo "[Android] SHA256:"
    if command -v sha256sum &> /dev/null; then
        sha256sum "$ANDROID_APK"
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$ANDROID_APK"
    fi
    echo ""
fi

if [ -f "$OUTPUT" ]; then
    echo "========================================"
    echo "Checksums saved to: $OUTPUT"
    echo "========================================"
    echo ""
    echo "Copy these hashes to:"
    echo "  1. GitHub release notes"
    echo "  2. Download page"
    echo "  3. SECURITY_VERIFICATION.md"
    echo ""
    cat "$OUTPUT"
else
    echo "ERROR: No release artifacts found!"
fi
