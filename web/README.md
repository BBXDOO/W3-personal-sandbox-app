# Personal Sandbox web source — 0.59

ซอร์ส React/TypeScript สำหรับแอปอยู่ในโฟลเดอร์นี้ Android project อยู่ที่ root รีโป้เดียวกัน

จาก root ใช้ `npm ci --prefix web` เพื่อติดตั้ง dependency แล้วใช้ `npm run dev` เพื่อพัฒนา

ก่อน commit รัน `npm run lint`, `npm run check:manual`, `npm run build` และ `npm run verify:release`

- [คำสั่งและโครงสร้างปัจจุบัน](../README.md)
- [ขั้นตอนออกแต่ละรุ่น](../RELEASE_CHECKLIST_TH.md)
- [คู่มือผู้ใช้](docs/คู่มือใช้งานภาษาไทย.md)
- [ซอร์สและบันทึก checkpoint ก่อนย้ายรีโป้](https://github.com/BBXDOO/W3_HB_team_BXCGICOG/tree/4951ac7a9c64a2dc8ac1b81e255b2bcbc751a21a/w3_tool_store/personal_sandbox_template/source)

ชุดทดสอบเดิมอยู่ใน tests/ ครอบคลุม authoring, battle, board และเอกสาร ตัวแอปใช้ React 19 และ Vite 6
