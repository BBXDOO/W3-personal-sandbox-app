# W3 Personal Sandbox — v58 (0.58)

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
- [APK v57](https://github.com/BBXDOO/W3-personal-sandbox-app/releases/tag/v57)

v58 เพิ่มเมนู 🖥 Terminal ใต้ “รูปแบบ” พร้อมปุ่มเปิด Termux และเตรียม session บริการ PTY ใช้ Python ใน Termux และเชื่อมผ่าน AndroidBridge ที่ `127.0.0.1:8766`

การตั้งค่าครั้งแรกและข้อจำกัดอยู่ในคู่มือหัวข้อ Terminal ต้องให้สิทธิ์ RUN_COMMAND และเปิด allow-external-apps บน Termux ทดสอบ backend บน Linux ด้วย `python3 -m unittest discover -s tools/terminal -p 'test_*.py' -v` ส่วนการเริ่มบริการจาก Android ต้องทดสอบบนเครื่องจริง
