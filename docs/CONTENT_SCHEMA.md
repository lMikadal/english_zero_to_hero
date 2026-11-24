# Content Schema

ไฟล์บทเรียนอยู่ที่ `content/lessons/day-XXX.json` (เลขวัน 3 หลัก) ตัวอย่างดูได้ที่ [day-001.json](../content/lessons/day-001.json)

## Lesson

| field | type | หมายเหตุ |
|---|---|---|
| `day` | number | 1–365 ต้องตรงกับชื่อไฟล์ |
| `phase` | 1–4 | |
| `week` | number | 1–53 |
| `type` | `lesson` \| `review` \| `challenge` \| `checkpoint` | |
| `cefr` | `preA1` \| `A1` \| `A2` \| `B1` \| `B2` | |
| `title` | `{ en, th }` | |
| `objectives` | `{ en, th }[]` | สิ่งที่ผู้เรียนทำได้หลังจบบท |
| `estimatedMinutes` | number | |
| `vocab` | `string[]` | ID ของคำศัพท์ใหม่ของวันนี้ (อ้างถึงคลังใน `content/vocab/`) จะเข้า SRS เมื่อจบบท |
| `sections` | `Section[]` | |

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
