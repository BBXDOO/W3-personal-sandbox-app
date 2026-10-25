W3 Personal Sandbox — โครงการสร้างแอป Android สำหรับทดสอบ v40

ไฟล์เว็บใน app/src/main/assets/www อยู่ใน APK เปิดได้โดยไม่ต้องใช้ Termux หรือเซิร์ฟเวอร์
ข้อมูลแต่ละเครื่องเก็บในพื้นที่แอปของ Android เครื่องนั้น

สร้าง APK ด้วย Android Studio:
1. เปิดโฟลเดอร์ android-app เป็น Android Studio project
2. ให้ Android Studio ติดตั้ง Android SDK 35, JDK 17 และ Gradle ตามที่แจ้ง
3. เลือก Build > Build Bundle(s) / APK(s) > Build APK(s)
4. APK สำหรับทดสอบอยู่ใน app/build/outputs/apk/debug/app-debug.apk

สร้างบน GitHub โดยไม่ต้องมีคอมพิวเตอร์:
1. สร้างรีโปส่วนตัวใหม่สำหรับแซนด์บ็อกซ์ ไม่ใช้รีโป W3 ต้นฉบับ
2. อัปโหลดเนื้อหาในโฟลเดอร์ android-app ไปที่รากของรีโปใหม่
   ให้เห็น app/, build.gradle, settings.gradle และ .github/workflows/build-apk.yml
3. เปิดแท็บ Actions > Build W3 Sandbox APK > Run workflow
4. เมื่อสำเร็จ ดาวน์โหลด Artifact ที่ workflow สร้าง (ชื่ออาจระบุรุ่นทดสอบก่อนหน้า)
5. แตก ZIP ของ Artifact แล้วเปิด app-debug.apk เพื่อติดตั้งทดสอบ

ห้ามใช้ APK ทดสอบนี้เป็นรุ่นแจกจริง เพราะ GitHub สร้างกุญแจ debug ใหม่
ในแต่ละการรันและจะติดตั้งอัปเดตทับโดยรักษาข้อมูลไม่ได้

APK ทดสอบติดตั้งได้ แต่หากจะแจกต่อและอัปเดตแบบรักษาข้อมูลในเครื่อง
ให้สร้าง release APK ที่ลงนามด้วย signing key เดิมทุกครั้ง
การเปลี่ยนกุญแจหรือ applicationId ทำให้ติดตั้งทับเวอร์ชันเดิมไม่ได้

การนำข้อมูลจากเว็บเก่า: ใน Chrome เปิด W3 > Export Data > บันทึกไฟล์ JSON
จากนั้นเปิด APK > หน้าโครงการ > นำเข้าไฟล์ JSON
ข้อมูลของ Chrome จะไม่ย้ายเข้า APK อัตโนมัติ

ข้อจำกัด: นี่คือ source project สำหรับสร้าง APK ทดสอบ
รุ่น v40 แก้หน้าแรกให้เลื่อนลงได้และย่อการ์ดโครงการ ต้องตรวจการใช้งานจริงบนโทรศัพท์หลังติดตั้ง

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
