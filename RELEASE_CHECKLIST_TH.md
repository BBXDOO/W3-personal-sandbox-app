# ตรวจคู่มือและ build Personal Sandbox

รันคำสั่งจาก root ของรีโป้ W3-personal-sandbox-app

1. อ่าน diff และทบทวนทุกเมนูที่เปลี่ยน รวมข้อมูลเข้า ผลลัพธ์ และข้อจำกัด
2. แก้ต้นฉบับ `web/docs/คู่มือใช้งานภาษาไทย.md`
3. ตั้งรุ่นใน `web/core/appVersion.ts`, `app/build.gradle`, `package.json` และ marker รุ่นทั้งสองในคู่มือให้ตรงกัน
4. รัน `npm run review:manual` หลังอ่านทบทวนเพื่อบันทึก fingerprint และสร้าง `web/public/user-guide.md`
5. รัน `npm run lint`, `npm run check:manual`, `npm run build` และ `npm run verify:release`
6. Commit ซอร์สพร้อม `app/src/main/assets/www/` และ `USER_GUIDE_TH.md` ที่สร้างใหม่ CI จะ rebuild และตรวจ diff ของไฟล์เหล่านี้
7. สร้าง APK ทดสอบด้วย Gradle หรือ GitHub Actions ตรวจหน้าจอ การบันทึก และ JSON round trip บนโทรศัพท์
8. ตรวจคู่มือในแอป ตรวจลายเซ็นเดิม และทดสอบอัปเดตทับก่อนเผยแพร่ Release ด้วยกุญแจเจ้าของ

`check-release.py` ตรวจเวอร์ชันและคู่มือใน APK ก่อน Gradle ส่วน `web/scripts/manual-release.mjs` ตรวจซอร์สและ fingerprint ด้วย

ต้นฉบับคู่มืออยู่ใน web/docs สำเนาใน public และ Android assets สร้างผ่านคำสั่งข้างต้น การทบทวนเนื้อหาต้องทำโดยผู้พัฒนาก่อนบันทึก fingerprint
