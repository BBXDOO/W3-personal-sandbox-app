# W3 Personal Sandbox — v62 (0.62)

ฐานพัฒนา Personal Sandbox รวมซอร์ส React/TypeScript และ Android ไว้ในรีโป้นี้

| ตำแหน่ง | หน้าที่ |
|---|---|
| `web/` | ซอร์ส React/TypeScript, tests, คู่มือ และ lockfile |
| `app/` | Android host, AndroidBridge และไฟล์เว็บสำหรับ APK |
| `sync-web-assets.sh` | Build `web/` และนำผลเข้า Android พร้อมตรวจคู่มือ |
| `check-release.py` | ตรวจเวอร์ชันและคู่มือที่บรรจุใน APK |

## เริ่มพัฒนา

ใช้ Node.js 24, npm และ Python 3 จาก root รีโป้

```sh
npm ci --prefix web
npm run dev
```

## ตรวจและ build

```sh
npm run lint
npm run check:manual
npm run build
npm run verify:release
```

หลังแก้หน้าจอหรือ runtime ให้ตรวจคู่มือที่ได้รับผลกระทบ แล้วรัน `npm run review:manual` ก่อน build และ commit ซอร์สพร้อมไฟล์ที่สร้างใน `app/src/main/assets/www/` กับ `USER_GUIDE_TH.md` ขั้นตอน CI จะ build ซ้ำและตรวจว่าผลตรงกับไฟล์ที่ commit

สร้าง APK ด้วย Android SDK 35, JDK 17 และ Gradle 8.9

```sh
gradle --no-daemon :app:assembleDebug
```

## ที่มาของซอร์ส v57

ย้ายจาก `BBXDOO/W3_HB_team_BXCGICOG` commit `4951ac7a9c64a2dc8ac1b81e255b2bcbc751a21a` พาธ `w3_tool_store/personal_sandbox_template/source/` เมื่อ 22 พฤศจิกายน 2026 ซอร์สเว็บอยู่ใน `web/` และอ้าง Android project ที่ root ผ่าน release checker

ให้พัฒนา Personal Sandbox รุ่นถัดไปในรีโป้นี้ สำเนาใน W3 ใช้อ้างอิงประวัติเดิม ขั้นตอน build ปัจจุบันใช้ซอร์ส `web/` ภายในรีโป้

- [คู่มือภาษาไทย](USER_GUIDE_TH.md)
- [Release checklist](RELEASE_CHECKLIST_TH.md)
- [ดาวน์โหลด APK รุ่นล่าสุด](https://github.com/BBXDOO/W3-personal-sandbox-app/releases/latest)

v58 เพิ่มเมนู 🖥 Terminal ใต้ “รูปแบบ” พร้อมปุ่มเปิด Termux และเตรียม session บริการ PTY ใช้ Python ใน Termux และเชื่อมผ่าน AndroidBridge ที่ `127.0.0.1:8766`

การตั้งค่าครั้งแรกและข้อจำกัดอยู่ในคู่มือหัวข้อ Terminal วิธีเริ่มอัตโนมัติใช้สิทธิ์ RUN_COMMAND และ allow-external-apps ส่วนรุ่นที่ไม่มีบริการนี้ใช้ปุ่มคัดลอกคำสั่งแล้ววางใน Termux ทดสอบ backend บน Linux ด้วย `python3 -m unittest discover -s tools/terminal -p 'test_*.py' -v` ส่วนการเริ่มบริการจาก Android ต้องทดสอบบนเครื่องจริง

รุ่น v59 ตรวจความสามารถ RUN_COMMAND ของ Termux ก่อนขอสิทธิ์ หากไม่มีบริการนั้น จะแสดงปุ่มคัดลอกคำสั่งและเปิด Termux ให้ผู้ใช้วางและเริ่มบริการด้วย Python ได้ รหัสเชื่อมต่อถูกใส่ในคำสั่งโดย native และไม่ส่งเข้า JavaScript ตรวจ template ที่ใช้เริ่มบริการทั้งสองวิธีก่อน build ทุกครั้ง

รุ่น v60 ขยายพื้นที่ Terminal ขึ้นใต้แถบเครื่องมือแถวเดียว เอากล่องคำแนะนำออกจากหน้า Terminal และย้ายช่องเลือกโฟลเดอร์ไปหน้าต่างสร้าง session ข้อความสถานะแสดงทับบนพื้นที่ Terminal และปิดได้

รุ่น v61 จัด Terminal เป็นสามส่วน Explorer ทางซ้าย พื้นที่เปิดดูไฟล์ด้านบน และ shell ด้านล่าง พร้อมพับ Explorer และลากปรับความสูง shell ได้ Explorer อ่านไฟล์จริงใน Termux ผ่าน POST `/sessions/<id>/files` และ `/sessions/<id>/read` โดยใช้ token เดิมจาก native รองรับ UTF-8 ไม่เกิน 32 KiB และแบ่งรายชื่อ 100 รายการต่อหน้า ไม่มี endpoint เขียนไฟล์ การเลือกโฟลเดอร์ไม่เปลี่ยน cwd หรือ branch ของ shell

Health ยังคง protocol 1 และเพิ่ม `capabilities: ["files-v1"]` เพื่อระบุ Explorer บริการเก่ายังใช้ shell ต่อได้และหน้าแอปแสดงปุ่มอัปเดตบริการก่อนใช้ Explorer Bootstrap จะไม่หยุด shell เก่าอัตโนมัติ ต้องหยุดบริการต้นทางใน Termux แล้ววางคำสั่งใหม่ รายละเอียดอยู่ในคู่มือ ทดสอบโครงหน้าจอด้วย `npm run test:terminal` และทดสอบ transport/ไฟล์จริงด้วยชุดทดสอบ Python ข้างต้น

รุ่น v62 เพิ่มปุ่ม **เปิด Qwen3** ใน Terminal หลังเชื่อมต่อ ใช้ session แยกเพื่อรันสคริปต์ค้นหา Qwen3-1.7B-Q8_0.gguf ใน Hugging Face cache แล้วเริ่ม llama-server ที่ 127.0.0.1:8080 context 2048 กดซ้ำเปิด session ที่ยังทำงานอยู่ หรือเริ่มใหม่เมื่อโปรแกรมจบแล้ว ไม่ต้องเปลี่ยนบริการ Terminal เพิ่มเพื่อใช้ปุ่มนี้ ทดสอบ bash quoting/argument และการใช้ session เดิมด้วย `npm run test:terminal` การโหลดโมเดลจริงบน Android ยังต้องทดสอบบนเครื่องผู้ใช้
