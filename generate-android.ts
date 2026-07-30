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
  let fileContent = file.content;
  
  // Tự động thay thế thư viện FFmpegKit cũ bằng phiên bản cộng đồng duy trì (bản 6.0.1 chuẩn)
  if (file.filename.includes('build.gradle.kts') || file.path.includes('build.gradle.kts')) {
    fileContent = fileContent.replace(
      'com.arthenica:ffmpeg-kit-full:6.0-2',
      'dev.ffmpegkit-maintained:ffmpeg-kit-free:6.0.1'
    );
    
    // Thêm cấu hình bắt buộc giải nén jniLibs để tránh lỗi dlopen RELRO Out of Memory trên một số dòng máy
    fileContent = fileContent.replace(
      'buildTypes {',
      'packaging {\n' +
      '        jniLibs {\n' +
      '            useLegacyPackaging = true\n' +
      '        }\n' +
      '    }\n\n' +
      '    buildTypes {'
    );
  }

  // Sửa lỗi thiếu icon và style theme bằng cách trỏ về hệ thống mặc định của Android và ép giải nén thư viện
  if (file.filename === 'AndroidManifest.xml') {
    fileContent = fileContent
      .replace('<application', '<application android:extractNativeLibs="true"')
      .replace('@mipmap/ic_launcher', '@android:drawable/sym_def_app_icon')
      .replace('@mipmap/ic_launcher_round', '@android:drawable/sym_def_app_icon')
      .replace(/@style\/Theme\.YTLiveStreamer/g, '@android:style/Theme.DeviceDefault.NoActionBar');
  }

  // Sửa lỗi văng app trên Android 11+ (Tự động copy file vào thư mục Cache an toàn)
  if (file.filename.includes('MainActivity.kt')) {
    const originalLauncher = `    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            selectedVideoUri = it
            selectedVideoName = it.lastPathSegment ?: "Selected Video.mp4"
            Toast.makeText(context, "Video selected!", Toast.LENGTH_SHORT).show()
        }
    }`;

    const newLauncher = `    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            val cachePath = copyUriToCache(context, it)
            if (cachePath != null) {
                selectedVideoUri = Uri.parse(cachePath)
                selectedVideoName = "Selected Video (Cached)"
                Toast.makeText(context, "Video prepared!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Failed to process video!", Toast.LENGTH_SHORT).show()
            }
        }
    }`;

    fileContent = fileContent.replace(originalLauncher, newLauncher);
    
    // Ghi hàm helper copyUriToCache vào rìa ngoài cùng cuối tệp (Package-level function) để truy cập tự do
    const helperFunction = `\n\nfun copyUriToCache(context: android.content.Context, uri: android.net.Uri): String? {
    try {
        val inputStream = context.contentResolver.openInputStream(uri) ?: return null
        val tempFile = java.io.File(context.cacheDir, "temp_stream.mp4")
        if (tempFile.exists()) tempFile.delete()
        val outputStream = java.io.FileOutputStream(tempFile)
        inputStream.use { input ->
            outputStream.use { output ->
                input.copyTo(output)
            }
        }
        return tempFile.absolutePath
    } catch (e: Exception) {
        e.printStackTrace()
        return null
    }
}`;
    
    fileContent = fileContent + helperFunction;
  }

  // Sửa lỗi đường dẫn videoInput và lỗi tương thích chạy ngầm trên Android 11 trong RtmpStreamService.kt
  if (file.filename.includes('RtmpStreamService.kt')) {
    // 1. Đọc trực tiếp đường dẫn cache video từ MainActivity
    fileContent = fileContent.replace(
      'val videoInput = Uri.parse(videoUriStr).path ?: videoUriStr',
      'val videoInput = videoUriStr'
    );

    // 2. Thay thế lệnh dừng chạy ngầm bằng hàm tương thích với mọi Android cũ
    fileContent = fileContent.replace(/stopForeground\(STOP_FOREGROUND_REMOVE\)/g, 'stopForeground(true)');

    // 3. Tối ưu hóa lệnh khởi tạo dịch vụ chạy ngầm và cài UncaughtExceptionHandler cho service
    const originalServiceOnCreate = `    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }`;

    const newServiceOnCreate = `    override fun onCreate() {
        super.onCreate()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val file = java.io.File(cacheDir, "crash_log.txt")
                file.writeText(throwable.stackTraceToString())
            } catch (e: Exception) {}
            System.exit(1)
        }
        createNotificationChannel()
    }`;
    fileContent = fileContent.replace(originalServiceOnCreate, newServiceOnCreate);

    fileContent = fileContent.replace(
      'startForeground(NOTIFICATION_ID, notification)',
      'if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {\n' +
      '                        startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)\n' +
      '                    } else {\n' +
      '                        startForeground(NOTIFICATION_ID, notification)\n' +
      '                    }'
    );
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

// 5. Tạo file gradle.properties kích hoạt AndroidX và cấp 3GB RAM tối ưu ở cả 2 cấp độ thư mục
const gradlePropertiesContent = `android.useAndroidX=true
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=512m
org.gradle.daemon=false
org.gradle.caching=false
kotlin.incremental=false
android.bundle.enableUncompressedCpuLibs=false
`;

writeFileSecure('gradle.properties', gradlePropertiesContent);
writeFileSecure('app/gradle.properties', gradlePropertiesContent);


// 6. HÀM ROBOT QUÉT VÀ SỬA TOÀN BỘ WORKSPACE (DỰ PHÒNG THÊM)
function scanAndFixAllFiles(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    
    if (file === 'node_modules' || file === '.git' || file === '.github' || file === 'build-out' || file === 'gradle' || file === '.gradle') {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndFixAllFiles(fullPath);
    } else {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

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
        
        // Robot dự phòng tự động đổi lệnh dừng dịch vụ ngầm tương thích với Android cũ
        content = content.replace(/stopForeground\(STOP_FOREGROUND_REMOVE\)/g, 'stopForeground(true)');
        changed = true;
      }

      if (file === 'MainActivity.kt') {
        if (content.includes('import com.ytlive.rtmpstreamer.ui.theme.YTLiveTheme') || content.includes('YTLiveTheme')) {
          content = content
            .replace("import com.ytlive.rtmpstreamer.ui.theme.YTLiveTheme", "")
            .replace(/YTLiveTheme/g, "MaterialTheme");
          changed = true;
        }
      }

      // ĐẢM BẢO GIỮ LẠI CỜ ÉP BUỘC GIẢI NÉN TRONG MANIFEST KHI ROBOT QUÉT QUA
      if (file === 'AndroidManifest.xml') {
        if (content.includes('@mipmap/ic_launcher') || content.includes('@style/Theme.YTLiveStreamer') || !content.includes('android:extractNativeLibs="true"')) {
          content = content
            .replace('<application', '<application android:extractNativeLibs="true"')
            .replace('@mipmap/ic_launcher', '@android:drawable/sym_def_app_icon')
            .replace('@mipmap/ic_launcher_round', '@android:drawable/sym_def_app_icon')
            .replace(/@style\/Theme\.YTLiveStreamer/g, '@android:style/Theme.DeviceDefault.NoActionBar');
          changed = true;
        }
      }

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

console.log("=== Bắt đầu quét và sửa toàn bộ workspace ===");
scanAndFixAllFiles('.');
console.log("=== Hoàn tất quét dọn ===");
