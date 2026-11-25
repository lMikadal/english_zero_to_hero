# Content Schema

ไฟล์บทเรียนอยู่ที่ `content/lessons/day-XXX.json` (เลขวัน 3 หลัก) ตัวอย่างดูได้ที่ [day-001.json](../content/lessons/day-001.json)

## Lesson

| field | type | หมายเหตุ |
|---|---|---|
| `day` | number | 1–365 ต้องตรงกับชื่อไฟล์ |
| `phase` | 1–4 | |
| `week` | number | 1–53 |
| `type` | `lesson` \| `review` \| `challenge` \| `checkpoint` | |
| `cefr` | `preA1` \| `A1` \| `A2` \| `B1` \| `B2` \| `C1` | `C1` ใช้ในเฟส 4 ที่สอนคำ Oxford 5000 |
| `title` | `{ en, th }` | |
| `objectives` | `{ en, th }[]` | สิ่งที่ผู้เรียนทำได้หลังจบบท |
| `estimatedMinutes` | number | |
| `vocab` | `string[]` | ID ของคำศัพท์ใหม่ของวันนี้ (อ้างถึงคลังใน `content/vocab/`) จะเข้า SRS เมื่อจบบท |
| `sections` | `Section[]` | |

## ข้อกำหนดที่ schema ตีความไว้ (`src/lib/content/schema.ts`)

ทุก object เป็นแบบ **strict**: key ที่ไม่รู้จักถือว่าผิด (กันพิมพ์ผิด) และ string ต้องไม่ว่าง

- `cefr` ของบทเรียนรับ `C1` ด้วย (เฟส 4 สอนคำ Oxford 5000 ระดับ C1)
- **ข้อความทุกช่อง** ต้องไม่ว่าง ไม่เป็นช่องว่างล้วน และไม่มีช่องว่างหน้า/หลังข้อความ (รวม `accept`, `answer`, `words`, `choices`)
- **ทุกช่อง `th`** (`title.th`, `objectives[].th`, `instruction.th`, `question.th`, `tipTh`, `translate_th_en.th`, `glossary` (ค่า), `th` และ `examples[].th` ของคำศัพท์) ต้องมีตัวอักษรไทยอย่างน้อย 1 ตัว (U+0E00–U+0E7F)
- `objectives` และ `sections` ต้องมีอย่างน้อย 1 รายการ; `vocab` เป็น array ว่างได้ (วัน review / checkpoint); `exercises` ในแต่ละ section ต้องมีอย่างน้อย 1
- `id` ของ exercise ต้องตรง `^d\d{3}-[a-z]+-\d{2}$` ส่วน `<skill>` ต้องเป็นหนึ่งใน `pron` `listen` `speak` `read` `write` `vocab` (ไม่บังคับให้ตรงกับ `skill` ของ section)
- `instruction` = `{ th, en? }`; `th` จำเป็น
- `question` ของ `listen_choose` และ `read_passage.questions[]` เป็น `{ en, th }`; `choices` เป็น `string[]` อย่างน้อย 2 ตัว; `answer` เป็นเลข index (เริ่มที่ 0) ของ `choices`
- `minimal_pair.pairs[].answer` เป็น `"a"` หรือ `"b"`
- `roleplay`: `scenario` เป็น `{ en, th }`, `aiRole` เป็น string (อังกฤษ, ใช้เป็นคำสั่งให้ AI), `goals` เป็น `{ en, th }[]` อย่างน้อย 1
- `free_write`: `prompt` เป็น string, `minWords` เป็นจำนวนเต็มบวก, `rubric` เป็น `string[]` (เกณฑ์ให้ AI ตรวจ) ใส่หรือไม่ก็ได้
- `read_passage.glossary` เป็น `{ [word]: คำแปลไทย }`
- `vocab_match.pairs` ต้องมีอย่างน้อย 2 คู่; `vocabId` ทุกที่ต้องตรง `^v-[a-z0-9]+(-[a-z0-9]+)*$`
- `arrange_words.words` อย่างน้อย 2 คำ; `answer` เป็นประโยคเดียว (string)
- `fill_blank.answer` เป็น array ของคำตอบ **หนึ่งตัวต่อหนึ่ง `___`** ตามลำดับ
- ใน VocabItem `forms` เป็น `{ [ชื่อรูปผัน]: string }` ชื่อใดก็ได้ (ไม่จำกัดแค่ตัวอย่าง) และ `topics` ต้องเป็น slug ในรายการของ VOCABULARY.md หัวข้อ 3 เท่านั้น ห้ามซ้ำ
- `oxford`: list `"3000"` ใช้ระดับ A1–B2, list `"5000"` ใช้ระดับ B2–C1

## การเทียบคำตอบ (`src/lib/answers/normalize.ts`)

คำตอบที่พิมพ์ (`dictation`, `translate_th_en`, `arrange_words`, `fill_blank`) ถูก normalise ทั้งสองฝั่งก่อนเทียบ ด้วยกติกาเดียวกันเป๊ะ:

1. แปลงเป็นตัวพิมพ์เล็ก
2. เปลี่ยน apostrophe โค้ง `’` `‘` เป็น `'` (แป้นพิมพ์ iPhone พิมพ์ "I’m")
3. ลบ `.` `!` `?` `,` ทุกตำแหน่ง (แทนด้วยช่องว่าง)
4. ยุบช่องว่างซ้ำและตัดหัวท้าย

ตัวอย่าง: `"B, U, S"` กับ `"b u s"` ตรงกัน แต่ `"B-U-S"` ไม่ตรงกับ `"B U S"` (ขีดกลางไม่ถูกลบ) และ `"I am"` ไม่ตรงกับ `"I'm"`

**แนวทางเขียน `accept`**
- ไม่ต้องใส่รูปที่ต่างกันแค่ตัวพิมพ์ใหญ่เล็ก หรือเครื่องหมาย `. ! ? ,` (`"Nice to meet you"` ครอบคลุม `"nice to meet you!"`)
- ต้องใส่รูปที่ต่างจริง: คำย่อกับคำเต็ม (`"I'm from Bangkok"` และ `"I am from Bangkok"`) และขีดกลาง (`"b-u-s"`)
- `dictation`: `audioText` ถือเป็นคำตอบที่รับเสมอ จึงไม่ต้องซ้ำใน `accept` และถ้าไม่มี `accept` จะใช้ `audioText` อย่างเดียว
- ข้อความว่าง (หลัง normalise) ไม่ถือว่าตรงกับอะไรเลย

## กฎที่ `content:validate` ตรวจเพิ่ม

เกินกว่าที่ schema ตรวจได้ในไฟล์เดียว (รันด้วย `make validate`):
- `day` ตรงกับชื่อไฟล์ `day-XXX.json`
- exercise ID ไม่ซ้ำทั้ง repo และเลข `XXX` ใน ID เท่ากับ `day` ของบทนั้น
- `listen_choose.answer` และ `read_passage.questions[].answer` เป็น index ที่มีอยู่ใน `choices`
- `arrange_words.answer` ใช้คำใน `words` ครบและไม่เกิน (นับซ้ำด้วย แยกคำด้วยช่องว่าง เทียบตรงตัว รวมตัวพิมพ์ใหญ่และเครื่องหมายวรรคตอน)
- `fill_blank`: ช่องว่างคือ `___` (underscore 3 ตัวพอดี) ห้ามมี underscore ยาวอย่างอื่น และจำนวนช่องเท่ากับจำนวน `answer`
- `arrange_words`: เทียบ token ของ `answer` (แยกด้วยช่องว่าง) กับ token ของ `words` (ป้ายที่มีหลายคำ เช่น `"New York"` ถูกแยกเป็น 2 token) และ `answer` ต้องเว้นวรรคเดียวระหว่างคำ
- `choices` ของ `listen_choose` และ `read_passage.questions[]` ห้ามซ้ำ (เทียบแบบตัดช่องว่าง ไม่สนตัวพิมพ์); `minimal_pair` ต้องมี `a` ไม่เท่ากับ `b`; `vocab_match` ห้ามมี `vocabId` ซ้ำ
- `week` = `ceil(day / 7)`; `phase`: 1 = วัน 1–60, 2 = 61–150, 3 = 151–270, 4 = 271–365; `type: "checkpoint"` ใช้ได้เฉพาะวันที่ `day % 30 === 0`
- exercise `vocab_match` / `spell_word` / `use_in_sentence` อ้างได้เฉพาะคำที่ถูกสอนเป็นคำใหม่ (อยู่ใน `vocab`) ในบทเดียวกันหรือวันก่อนหน้า
- ไฟล์ใน `content/lessons/` ต้องเป็นไฟล์ปกติชื่อ `day-XXX.json` เท่านั้น (ไม่มีโฟลเดอร์ย่อย ไฟล์ `.bak` หรือไฟล์อื่น), ไฟล์ใน `content/vocab/` ต้องเป็น `.json` เท่านั้น, ต้องมีโฟลเดอร์ `lessons/` และ `vocab/` และมีบทเรียนกับคำศัพท์อย่างน้อยอย่างละ 1
- ไฟล์คำศัพท์ตรวจทีละคำ: คำที่ผิดจะถูกรายงานด้วยชื่อไฟล์ ลำดับ และ id ส่วนคำอื่นในไฟล์ยังถูกใช้ตรวจต่อ
- รันกับสำเนาอื่นได้ด้วย `pnpm content:validate <dir>` (ค่าเริ่มต้น `./content`)
- กฎเรื่องคำศัพท์ทั้งหมดอยู่ที่ [VOCABULARY.md หัวข้อ 6](VOCABULARY.md#6-กฎการตรวจ-pnpm-contentvalidate)

## VocabItem

คลังคำศัพท์อยู่ที่ `content/vocab/oxford-3000/<level>.json` และ `content/vocab/oxford-5000/b2-c1.json` แต่ละไฟล์เป็น array ของ VocabItem รายละเอียดแผนคำศัพท์ดูได้ที่ [VOCABULARY.md](VOCABULARY.md)

| field | type | หมายเหตุ |
|---|---|---|
| `id` | string | `v-<word>` ถ้าคำเดียวกันมีหลายชนิดให้ต่อท้ายด้วย pos เช่น `v-book-verb` |
| `word` | string | headword ตามรายการ Oxford |
| `pos` | string | ชนิดของคำตามรายการ Oxford (noun, verb, adjective, ...) |
| `oxford` | `{ list: "3000" \| "5000", level: "A1" \| "A2" \| "B1" \| "B2" \| "C1" }` | |
| `ipa` | `{ us, uk }` | |
| `th` | string | คำแปลไทย (เขียนเอง) |
| `topics` | `string[]` | อย่างน้อย 1 หมวด ตามรายการใน VOCABULARY.md |
| `examples` | `{ en, th }[]` | ประโยคตัวอย่าง (เขียนเอง) อย่างน้อย 1 ประโยค |
| `collocations` | `string[]?` | กลุ่มคำที่มักใช้ด้วยกัน |
| `forms` | `object?` | รูปผัน เช่น `plural`, `past`, `pastParticiple`, `comparative`, `superlative` |

```json
{ "id": "v-meet", "word": "meet", "pos": "verb",
  "oxford": { "list": "3000", "level": "A1" },
  "ipa": { "us": "/miːt/", "uk": "/miːt/" },
  "th": "พบ, เจอ, ได้รู้จัก", "topics": ["greetings"],
  "examples": [{ "en": "Nice to meet you, Ann.", "th": "ยินดีที่ได้รู้จักนะ แอน" }],
  "forms": { "past": "met", "pastParticiple": "met" } }
```

## Section

```json
{ "skill": "pronunciation" | "listening" | "speaking" | "reading" | "writing",
  "title": { "en": "...", "th": "..." },
  "exercises": [Exercise] }
```

## Exercise types

ทุก exercise ต้องมี `id` ที่ไม่ซ้ำกันทั้ง repo (รูปแบบ `dXXX-<skill>-NN`), `type` และ `instruction: { th, en? }`

| type | field เพิ่มเติม | ทำอะไร |
|---|---|---|
| `phoneme_intro` | `phoneme`, `ipa`, `tipTh`, `examples[]` | แนะนำเสียงใหม่ |
| `minimal_pair` | `pairs: [{a, b, answer}]` | ฟังแล้วเลือกคำที่ได้ยิน |
| `repeat_after_me` | `text`, `ipa?` | ฟังแล้วพูดตาม (อัดเสียง / ให้คะแนน) |
| `listen_choose` | `audioText`, `question`, `choices[]`, `answer` | ฟังแล้วตอบคำถาม |
| `dictation` | `audioText`, `accept[]?` | ฟังแล้วพิมพ์ตาม |
| `shadowing` | `lines[]` | พูดตามทันทีทีละบรรทัด |
| `speak_answer` | `prompt`, `sampleAnswer`, `keywords[]?` | ตอบคำถามด้วยเสียง |
| `roleplay` | `scenario`, `aiRole`, `goals[]` | คุยกับ AI |
| `read_passage` | `text`, `glossary?`, `questions[]` | อ่านแล้วตอบคำถาม |
| `arrange_words` | `words[]`, `answer` | เรียงคำให้เป็นประโยค |
| `fill_blank` | `text` (ใช้ `___`), `answer[]` | เติมคำ |
| `translate_th_en` | `th`, `accept[]` | แปลไทยเป็นอังกฤษ |
| `free_write` | `prompt`, `minWords`, `rubric?` | เขียนอิสระ (AI ตรวจ) |
| `vocab_match` | `pairs: [{ vocabId }]` | จับคู่คำกับความหมายไทย |
| `spell_word` | `vocabId` | ฟังเสียงแล้วสะกดคำ |
| `use_in_sentence` | `vocabId`, `prompt` | แต่งประโยคด้วยคำที่กำหนด (AI ตรวจ) |

**ข้อความที่ต้องมีเสียง** (`text`, `audioText`, `lines`, `examples`, รวมถึง `word` และ `examples[].en` ในคลังคำศัพท์ ทั้งเสียง US และ UK) จะถูกสร้างเป็นไฟล์ TTS โดยอัตโนมัติด้วย `pnpm audio:generate`
