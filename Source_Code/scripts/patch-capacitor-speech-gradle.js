const fs = require('fs');
const path = require('path');

const pluginPath = path.join(__dirname, '..', 'node_modules', '@capacitor-community', 'speech-recognition', 'android', 'build.gradle');

if (fs.existsSync(pluginPath)) {
  let gradleContent = fs.readFileSync(pluginPath, 'utf8');

  // Replace 'proguard-android.txt' with 'proguard-android-optimize.txt'
  if (gradleContent.includes("getDefaultProguardFile('proguard-android.txt')")) {
    gradleContent = gradleContent.replace(
      "getDefaultProguardFile('proguard-android.txt')",
      "getDefaultProguardFile('proguard-android-optimize.txt')"
    );
    fs.writeFileSync(pluginPath, gradleContent, 'utf8');
    console.log('Successfully patched speech-recognition build.gradle for AGP compatibility.');
  } else {
    console.log('Speech recognition build.gradle is already patched or does not contain the target text.');
  }
} else {
  console.warn('Could not find speech-recognition build.gradle at:', pluginPath);
}
