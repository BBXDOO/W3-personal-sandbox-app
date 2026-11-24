W3 Personal Sandbox — Android v65 (0.65)

ฐานพัฒนารวมอยู่ในรีโป้ BBXDOO/W3-personal-sandbox-app
ซอร์ส React/TypeScript อยู่ใน web/ และ Android project อยู่ที่ root
ไฟล์เว็บที่ build แล้วอยู่ใน app/src/main/assets/www และข้อมูลเก็บในพื้นที่แอปแต่ละเครื่อง
แอปขอ INTERNET สำหรับตรวจรุ่นและดาวน์โหลด APK จาก GitHub

เริ่มจาก root รีโป้:
1. ใช้ Node.js 24, Python 3, JDK 17, Android SDK 35 และ Gradle 8.9
2. รัน npm ci --prefix web
3. รัน npm run lint และ npm run check:manual
4. รัน npm run build และ npm run verify:release
5. เปิด root รีโป้ใน Android Studio หรือรัน gradle --no-daemon :app:assembleDebug
6. APK ทดสอบอยู่ที่ app/build/outputs/apk/debug/app-debug.apk

สร้างผ่าน GitHub Actions ได้ที่ Build W3 Sandbox APK
workflow ตรวจซอร์สและ build เว็บในรีโป้นี้ก่อนสร้าง APK
การอัปเดต Release ต้องใช้ applicationId และ signing key เดิม
สำรอง JSON ผ่านแอปก่อนทดสอบติดตั้งหรือย้ายข้อมูลระหว่าง Chrome กับ APK
รายละเอียดการพัฒนาและรุ่นปัจจุบันอยู่ใน README.md

Release APK สำหรับใช้ส่วนตัว (เจ้าของถือกุญแจเอง):
1. ใน Termux ติดตั้ง OpenJDK: pkg install openjdk-17
2. สร้างกุญแจเพียงครั้งเดียวในพื้นที่ส่วนตัวของเครื่อง:
   keytool -genkeypair -v -keystore ~/w3-personal-release.jks -alias w3personal -keyalg RSA -keysize 3072 -validity 10000
   ตั้งรหัสผ่านและจดเก็บอย่างปลอดภัย อย่าส่งไฟล์ .jks หรือรหัสผ่านทางแชท/ใส่ในรีโป
3. สำรองไฟล์ .jks และรหัสผ่านแยกจากโทรศัพท์ หากหาย จะอัปเดตแอปเดิมด้วยกุญแจเดิมไม่ได้
4. ในรีโป Android GitHub > Settings > Secrets and variables > Actions เพิ่ม secrets สี่ค่า:
   W3_RELEASE_KEYSTORE_BASE64 = ผลของคำสั่ง base64 -w 0 ~/w3-personal-release.jks
   W3_RELEASE_STORE_PASSWORD = รหัสผ่าน keystore
   W3_RELEASE_KEY_ALIAS = w3personal
   W3_RELEASE_KEY_PASSWORD = รหัสผ่าน key (หากใช้รหัสเดียวกันให้ใส่ค่าเดียวกัน)
   คัดลอก base64 เข้าช่อง secret โดยตรง อย่าพิมพ์ผลลงในแชทหรือ commit ลง Git
5. Actions > Build W3 Sandbox APK > Run workflow > package_type: release
   ดาวน์โหลด Artifact แล้วตรวจว่าได้ app-release.apk
6. ถ้าเครื่องติดตั้ง app-debug.apk อยู่: เปิดแอปเดิมและ Export JSON ก่อน
   ตรวจว่าไฟล์ JSON มีข้อมูล จากนั้นถอนการติดตั้ง Debug แล้วติดตั้ง Release และ Import JSON
   การถอนติดตั้งจะลบข้อมูลเฉพาะในแอปเดิม จึงต้องมีไฟล์สำรองก่อน
7. การอัปเดตครั้งถัดไป: เพิ่ม versionCode และสร้าง Release ด้วยกุญแจชุดเดิม
   ติดตั้งทับ Release เดิม แล้วตรวจว่าข้อมูลยังอยู่ (ทดสอบกับข้อมูลตัวอย่างก่อน)

หมายเหตุ: การตั้ง GitHub Secrets ต้องทำโดยเจ้าของบัญชี ห้ามเผยแพร่ไฟล์กุญแจ
การมี workflow รองรับ Release ไม่ได้สร้างกุญแจหรือเปลี่ยน APK ที่ติดตั้งอยู่โดยอัตโนมัติ
