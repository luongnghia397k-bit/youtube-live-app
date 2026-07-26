import fs from 'fs';
import path from 'path';
import { ANDROID_CODEBASE } from './src/data/androidCodebase';

// 1. Tạo thư mục và ghi file Android vật lý từ text string
ANDROID_CODEBASE.forEach((file) => {
  const dir = path.dirname(file.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let fileContent = file.content;
  // Tự động thay thế thư viện FFmpegKit cũ bằng phiên bản cộng đồng duy trì (bản 6.0.1 chuẩn)
  if (file.filename.includes('build.gradle.kts') || file.path.includes('build.gradle.kts')) {
    fileContent = fileContent.replace(
      'com.arthenica:ffmpeg-kit-full:6.0-2',
      'dev.ffmpegkit-maintained:ffmpeg-kit-free:6.0.1'
    );
  }

  fs.writeFileSync(file.path, fileContent);
  console.log(`Đã trích xuất: ${file.path}`);
});

// 2. Tạo thư mục gradle/ và ghi file libs.versions.toml
const gradleDir = 'gradle';
if (!fs.existsSync(gradleDir)) {
  fs.mkdirSync(gradleDir, { recursive: true });
}

const libsVersionsContent = `[versions]
agp = "8.4.0"
kotlin = "2.0.0"

[libraries]
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version = "2024.04.01" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
`;

fs.writeFileSync(path.join(gradleDir, 'libs.versions.toml'), libsVersionsContent);
console.log('Đã tạo gradle/libs.versions.toml');

// 3. Tạo file build.gradle.kts ở thư mục gốc
const rootBuildContent = `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
`;

fs.writeFileSync('build.gradle.kts', rootBuildContent);
console.log('Đã tạo build.gradle.kts ở thư mục gốc');

// 4. Tạo file cấu hình settings.gradle.kts ở thư mục gốc
const settingsContent = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "YTLiveStreamer"
include(":app")
`;

fs.writeFileSync('settings.gradle.kts', settingsContent);
console.log('Đã tạo settings.gradle.kts');

// 5. Tạo file gradle.properties kích hoạt AndroidX ở thư mục gốc
const gradlePropertiesContent = `android.useAndroidX=true
`;

fs.writeFileSync('gradle.properties', gradlePropertiesContent);
console.log('Đã tạo gradle.properties thành công');
