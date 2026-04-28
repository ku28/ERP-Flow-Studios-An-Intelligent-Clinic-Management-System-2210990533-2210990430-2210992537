/**
 * Windows Code Signing Script
 * This script is called by electron-builder to sign the executable
 * 
 * SETUP:
 * 1. Get a code signing certificate (.pfx file) from a Certificate Authority
 * 2. Set environment variables:
 *    - CSC_LINK: Path to your .pfx certificate file
 *    - CSC_KEY_PASSWORD: Password for the certificate
 * 
 * For testing without a certificate, this script will skip signing gracefully.
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(configuration) {
    // Check if certificate is configured
    const certPath = process.env.CSC_LINK;
    const certPassword = process.env.CSC_KEY_PASSWORD;
    
    if (!certPath || !certPassword) {
        console.log('⚠️  Code signing certificate not configured. Skipping signing...');
        console.log('   To enable signing, set CSC_LINK and CSC_KEY_PASSWORD environment variables.');
        console.log('   See CODE_SIGNING.md for instructions.');
        return;
    }

    const filePath = configuration.path;
    console.log(`🔐 Signing: ${path.basename(filePath)}`);

    try {
        // Sign using Windows SignTool (requires Windows SDK)
        const signToolPath = '"C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\signtool.exe"';
        const command = `${signToolPath} sign /f "${certPath}" /p "${certPassword}" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "${filePath}"`;
        
        execSync(command, { stdio: 'inherit' });
        console.log('✅ Signing completed successfully');
    } catch (error) {
        console.error('❌ Signing failed:', error.message);
        console.log('   Build will continue, but executable will be unsigned.');
    }
};
