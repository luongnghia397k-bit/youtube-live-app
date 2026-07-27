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
  console.log(`Đã trích xuất: ${filePath}`);
}

// 1. Tạo thư mục và ghi file Android vật lý từ text string
ANDROID_CODEBASE.forEach((file) => {
  let fileContent = file.content;
  
  // Tự động thay thế thư viện FFmpegKit cũ bằng phiên bản cộng đồng duy trì (bản 6.0.1 chuẩn)
  if (file.filename.includes('build.gradle.kts') || file.path.includes('build.gradle.kts')) {
    fileContent = fileContent.replace(
      'com.arthenica:ffmpeg-kit-full:6.0-2',
      'dev.ffmpegkit-maintained:ffmpeg-kit-free:6.0.1'
    );
  }

  // Sửa lỗi thiếu icon và style theme bằng cách trỏ về hệ thống mặc định của Android
  if (file.filename === 'AndroidManifest.xml') {
    fileContent = fileContent
      .replace('@mipmap/ic_launcher', '@android:drawable/sym_def_app_icon')
      .replace('@mipmap/ic_launcher_round', '@android:drawable/sym_def_app_icon')
      .replace(/@style\/Theme\.YTLiveStreamer/g, '@android:style/Theme.DeviceDefault.NoActionBar');
  }

  // Sửa lỗi thiếu Theme tùy chỉnh trong MainActivity (Thay thế bằng MaterialTheme mặc định)
  if (file.filename.includes('MainActivity.kt')) {
    fileContent = fileContent
      .replace("import com.ytlive.rtmpstreamer.ui.theme.YTLiveTheme", "")
      .replace(/YTLiveTheme/g, "MaterialTheme");
  }

  // Sửa lỗi cú pháp trích xuất chuỗi nội suy bằng phương pháp ghi đè dòng (Line-by-line) an toàn tuyệt đối
  if (file.filename.includes('RtmpStreamService.kt')) {
    const lines = fileContent.split('\n');
    const updatedLines = lines.map(line => {
      if (line.includes('FFmpeg Log:')) {
        return '                Log.d(TAG, "FFmpeg Log: ${log.message}")';
      }
      if (line.includes('FFmpeg Stats - Frame:')) {
        return '                Log.d(TAG, "FFmpeg Stats - Frame: ${statistics.videoFrameNumber}, Bitrate: ${statistics.bitrate} kbps")';
      }
      return line;
    });
    fileContent = updatedLines.join('\n');
  }

  // Ghi đè vào đường dẫn gốc (app/src/main/...)
  writeFileSecure(file.path, fileContent);

  // Nhân đôi quá trình: Ghi đè vào đường dẫn lồng nhau dự phòng (app/app/src/main/...)
  if (file.path.startsWith('app/')) {
    const nestedPath = file.path.replace('app/', 'app/app/');
    writeFileSecure(nestedPath, fileContent);
  }
});

// 2. Tạo file libs.versions.toml ở cả 2 cấp độ thư mục
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

// 3. Tạo file build.gradle.kts ở thư mục gốc
const rootBuildContent = `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
`;

writeFileSecure('build.gradle.kts', rootBuildContent);

// 4. Tạo file cấu hình settings.gradle.kts ở cả 2 cấp độ thư mục
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

// 5. Tạo file gradle.properties tối ưu RAM và kích hoạt AndroidX ở cả 2 cấp độ thư mục
const gradlePropertiesContent = `android.useAndroidX=true
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=512m
org.gradle.daemon=false
`;

writeFileSecure('gradle.properties', gradlePropertiesContent);
writeFileSecure('app/gradle.properties', gradlePropertiesContent);
