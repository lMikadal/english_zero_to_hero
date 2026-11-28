# Findings (known, accepted, for later)

ปัญหาที่รู้แล้วและยอมรับไว้ชั่วคราว ทบทวนเป็นรอบเพื่อหารูปแบบ (ไม่ไล่แก้ทีละจุด)

## การเทียบคำตอบ (grading) และกฎ answer-forms

- **Under-acceptance ที่ยอมรับ:** `'s` พับเป็น `is` เฉพาะเมื่อคำถัดไปไม่ใช่กริยาแน่ๆ (determiner, เลข, คำบุพบท/สถานที่ในรายการปิด, `-ing`, adjective ที่ไม่ใช่ participle) คำอื่นทั้งหมด (adverb, สรรพนาม, คำที่ไม่รู้จัก) ไม่พับ ผู้เรียนที่พิมพ์รูปอีกแบบจะถูกตัดว่าผิด และกฎ `answer-forms` บังคับให้ผู้เขียนใส่ทั้งสองรูป จึงไม่มี over-acceptance โดยโครงสร้าง
- **คำนามทั่วไป + `'s`** (`My mother's a teacher` กับ `My mother is a teacher`) ไม่พับ กฎ `answer-forms` ตรวจเฉพาะกรณีที่ตามด้วย a/an/the/not/คำบุพบทสถานที่ (บริบทที่เป็น possessive ไม่ได้) และบังคับให้ใส่ `X is ...` คำนามทั่วไป + `'s` + บริบทอื่น (`my mother's happy`) ไม่ถูกตรวจ เพราะแยก possessive ไม่ได้แน่
- **`one` กับเลข 1:** สรรพนาม `one` พับกับตัวเลข ทำให้ `the red 1` / `no 1 is here` ถูกรับเมื่อเฉลยคือ `the red one` / `no one is here` เป็นการรับเกิน ที่ยอมรับเพราะพบน้อยมากและแก้ได้ด้วย `strict: true`
- **`'d`** ที่ไม่ใช่ก่อน like/love ไม่พับ (would หรือ had?) ผู้เขียนต้องใส่รูปเต็ม
- dictation รับตัวเลขแทนคำอ่านเลข (`10` แทน `ten`) ซึ่งเป็นการตัดสินใจด้านการสอน รอผู้ใช้ตัดสิน

## Round 4

- **Over-acceptance the next-word test cannot prevent:** possession written as `'s` without `got` (British: `He's no idea`, `He's two cars`, `She's long hair`). After `no`, a number or `many`, `'s` folds to `is`, so the wrong `He is two cars` is accepted. Mitigation: the validator gives a WARNING (not an error) when `he's`/`she's` is followed by no / many / a lot of / a number 2-10 plus a bank noun that is not a unit of time. Authors write possession as `has` / `has got`.
- `He has not finished` is rejected for an accepted `He's not finished` ('s before "not" + participle is not folded); the author lists both forms and the rule asks for it.
- Added to the safe list: weather adjectives, days and months (not `may`/`march`), nationalities/languages, and object/possessive pronouns only after he/she/it. Not added: `half`, pronouns after a wh-word.
