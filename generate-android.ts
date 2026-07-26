import fs from 'fs';
import path from 'path';
import { ANDROID_CODEBASE } from './src/data/androidCodebase';

// Tạo thư mục và ghi file Android vật lý từ text string
ANDROID_CODEBASE.forEach((file) => {
  const dir = path.dirname(file.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file.path, file.content);
  console.log(`Đã trích xuất thành công: ${file.path}`);
});

// Tạo file cấu hình settings.gradle.kts ở thư mục gốc
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
