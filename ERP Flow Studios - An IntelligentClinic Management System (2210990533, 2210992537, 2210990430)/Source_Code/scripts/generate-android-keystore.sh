#!/bin/bash
# Android Keystore Generation Script
# Run this once to create your signing keystore

echo "🔐 Android Keystore Generator for ERP Flow Studios"
echo "=================================================="
echo ""

KEYSTORE_FILE="erpflowstudios-release.keystore"
KEY_ALIAS="erpflowstudios"

if [ -f "$KEYSTORE_FILE" ]; then
    echo "❌ Keystore already exists: $KEYSTORE_FILE"
    echo "   To regenerate, delete the existing file first."
    exit 1
fi

echo "Creating keystore..."
echo ""
echo "You will be asked for:"
echo "  1. Keystore password (remember this!)"
echo "  2. Key password (can be same as keystore password)"
echo "  3. Your name/organization details"
echo ""

keytool -genkeypair \
    -v \
    -storetype PKCS12 \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Keystore created successfully: $KEYSTORE_FILE"
    echo ""
    echo "⚠️  IMPORTANT - Keep this file safe and backup!"
    echo "   - Store passwords in a secure location"
    echo "   - Never commit this file to git"
    echo "   - You'll need it to sign all future updates"
    echo ""
    echo "Next steps:"
    echo "1. Move $KEYSTORE_FILE to a secure location"
    echo "2. Update gradle.properties with keystore details"
    echo "3. See CODE_SIGNING.md for complete instructions"
else
    echo ""
    echo "❌ Keystore generation failed"
fi
