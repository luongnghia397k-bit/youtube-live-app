import fs from 'fs';
import path from 'path';
import { ANDROID_CODEBASE } from './src/data/androidCodebase';

// Hàm phụ trợ ghi file và tự tạo thư mục lồng nhau nếu chưa có
function writeFileSecure(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

// 1. Tạo thư mục và ghi file Android vật lý từ text string ban đầu
ANDROID_CODEBASE.forEach((file) => {
  writeFileSecure(file.path, file.content);
  if (file.path.startsWith('app/')) {
    const nestedPath = file.path.replace('app/', 'app/app/');
    writeFileSecure(nestedPath, file.content);
  }
});

// 2. Tạo cấu hình Gradle phụ trợ
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
writeFileSecure('gradle/libs.versions.toml', libsVersionsContent);
writeFileSecure('app/gradle/libs.versions.toml', libsVersionsContent);

const rootBuildContent = `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
`;
writeFileSecure('build.gradle.kts', rootBuildContent);

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
writeFileSecure('settings.gradle.kts', settingsContent);
writeFileSecure('app/settings.gradle.kts', settingsContent);

const gradlePropertiesContent = `android.useAndroidX=true
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=512m
org.gradle.daemon=false
`;
writeFileSecure('gradle.properties', gradlePropertiesContent);
writeFileSecure('app/gradle.properties', gradlePropertiesContent);


// 3. HÀM ROBOT QUÉT VÀ SỬA TOÀN BỘ WORKSPACE (BẮT THEO TÊN BIẾN CỐT LÕI)
function scanAndFixAllFiles(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    
    // Bỏ qua các thư mục hệ thống để tránh quét chậm
    if (file === 'node_modules' || file === '.git' || file === '.github' || file === 'build-out' || file === 'gradle' || file === '.gradle') {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndFixAllFiles(fullPath);
    } else {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // Vá lỗi RtmpStreamService.kt bằng cách tìm kiếm chính xác tên biến lõi
      if (file === 'RtmpStreamService.kt') {
        const lines = content.split('\n');
        const updatedLines = lines.map(line => {
          if (line.includes('log.message')) {
            changed = true;
            return '                Log.d(TAG, "FFmpeg Log: ${log.message}")';
          }
          if (line.includes('statistics.videoFrameNumber') || line.includes('statistics.bitrate')) {
            changed = true;
            return '                Log.d(TAG, "FFmpeg Stats - Frame: ${statistics.videoFrameNumber}, Bitrate: ${statistics.bitrate} kbps")';
          }
          return line;
        });
        content = updatedLines.join('\n');
      }

      // Sửa lỗi Theme tùy chỉnh trong MainActivity.kt
      if (file === 'MainActivity.kt') {
        if (content.includes('import com.ytlive.rtmpstreamer.ui.theme.YTLiveTheme') || content.includes('YTLiveTheme')) {
          content = content
            .replace("import com.ytlive.rtmpstreamer.ui.theme.YTLiveTheme", "")
            .replace(/YTLiveTheme/g, "MaterialTheme");
          changed = true;
        }
      }

      // Sửa lỗi thiếu icon và style theme trong AndroidManifest.xml
      if (file === 'AndroidManifest.xml') {
        if (content.includes('@mipmap/ic_launcher') || content.includes('@style/Theme.YTLiveStreamer')) {
          content = content
            .replace('@mipmap/ic_launcher', '@android:drawable/sym_def_app_icon')
            .replace('@mipmap/ic_launcher_round', '@android:drawable/sym_def_app_icon')
            .replace(/@style\/Theme\.YTLiveStreamer/g, '@android:style/Theme.DeviceDefault.NoActionBar');
          changed = true;
        }
      }

      // Sửa lỗi build.gradle.kts để đổi thư viện FFmpegKit
      if (file === 'build.gradle.kts') {
        if (content.includes('com.arthenica:ffmpeg-kit-full:6.0-2')) {
          content = content.replace(
            'com.arthenica:ffmpeg-kit-full:6.0-2',
            'dev.ffmpegkit-maintained:ffmpeg-kit-free:6.0.1'
          );
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`-> Robot đã vá thành công tệp tin tại: ${fullPath}`);
      }
    }
  }
}

// Kích hoạt trình quét dọn toàn diện
console.log("=== Bắt đầu quét và sửa toàn bộ workspace ===");
scanAndFixAllFiles('.');
console.log("=== Hoàn tất quét dọn ===");
