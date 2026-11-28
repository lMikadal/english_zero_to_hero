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
- `dictation`, `translate_th_en`, `fill_blank` มี `strict: boolean` (ไม่บังคับ) ปิดการพับคำย่อ/ตัวเลขของข้อนั้น
- `arrange_words.words` อย่างน้อย 2 คำ; `answer` เป็นประโยคเดียว (string); `accept` (ไม่บังคับ) เป็น `string[]` อย่างน้อย 1 รายการ; `statementOnly` (ไม่บังคับ, boolean) บอกกฎ `arrange-question` ว่าข้อนี้รับเฉพาะประโยคบอกเล่า
- `fill_blank.answer` เป็น array ของคำตอบ **หนึ่งตัวต่อหนึ่ง `___`** ตามลำดับ
- ใน VocabItem `forms` เป็น `{ [ชื่อรูปผัน]: string }` ชื่อใดก็ได้ (ไม่จำกัดแค่ตัวอย่าง) และ `topics` ต้องเป็น slug ในรายการของ VOCABULARY.md หัวข้อ 3 เท่านั้น ห้ามซ้ำ
- `oxford`: list `"3000"` ใช้ระดับ A1–B2, list `"5000"` ใช้ระดับ B2–C1

## การเทียบคำตอบ (`src/lib/answers/normalize.ts`)

คำตอบที่พิมพ์ (`dictation`, `translate_th_en`, `arrange_words`, `fill_blank`) ถูก normalise ทั้งสองฝั่งก่อนเทียบ ด้วยกติกาเดียวกันเป๊ะ:

1. ตัดอักขระความกว้างศูนย์ (U+200B–U+200D, U+FEFF)
2. เปลี่ยน apostrophe ที่หน้าตาคล้ายกัน `’` `‘` `ʼ` `´` `` ` `` เป็น `'` (แป้นพิมพ์ iPhone พิมพ์ "I’m")
3. Unicode NFKC (แปลง `？！，` เต็มความกว้างเป็น `?!,` และตัว `…` เป็น `...`)
4. แปลงเป็นตัวพิมพ์เล็ก
5. ลบ `.` `!` `?` `,` ทุกตำแหน่ง (แทนด้วยช่องว่าง)
6. ยุบช่องว่างซ้ำและตัดหัวท้าย

7. (เฉพาะตอนเทียบ ไม่ใช่ตอนแสดงผล) พับรูปที่ผู้เรียนเลือกเขียนได้อิสระให้เป็นรูปเดียว ทั้งสองฝั่ง (`src/lib/answers/equivalents.ts`) ใช้กับ `dictation`, `translate_th_en`, `fill_blank` และ `arrange_words` ผ่านฟังก์ชันเดียวกันที่ client, server และตัวสุ่มแผ่นป้าย และ **ปิดได้เป็นรายข้อด้วย `strict: true`** (ดูข้างล่าง)

| พับให้เท่ากัน (เขียนรูปเดียวพอ) | ไม่พับ (ต้องใส่ทุกรูปใน `accept` หรือตั้ง `strict: true`; ตัวตรวจกฎ `answer-forms` บังคับ) |
|---|---|
| คำย่อที่มีความหมายเดียว: `I'm`=`I am`, `you're`, `isn't`, `aren't`, `don't`..., และ `he's`/`she's`/`it's`/`that's`/`what's`... = `... is` **เฉพาะเมื่อคำถัดไป (ข้าม `not` ได้หนึ่งคำ แล้วข้าม `very` ได้หนึ่งคำ เช่น `She's very happy` = `She is very happy`) เป็น a/an/the/my/your..., เลข, `in/at/on/from/here/there...`, คำ `-ing`, หรือ adjective ในรายการ `ADJECTIVES`** (รายการปิดใน `equivalents.ts`: `He's a teacher`, `She's happy`, `It's in the bag`, `He's reading`), `isn't`, `aren't`, `don't`, `doesn't`, `can't`=`cannot`, `won't`, `I'll`... (ตาราง `CONTRACTIONS`) | `'s` ก่อนคำอื่นทุกคำ เช่น adverb (`He's never been`, `She's just finished`), สรรพนาม (`What's he done`) หรือคำที่ไม่รู้จัก, และก่อน past participle (ตาราง `PARTICIPLES` ใน `equivalents.ts`: `come`, `had`, `sat`, `bought`... ทุกคำที่ผันไม่ปกติ) หรือคำ `-ed` ตั้งแต่ 5 ตัวอักษร (`He's tired`, `He's gone`: is หรือ has?) `very` โปร่งใสเพราะไม่มี perfect ตามหลัง `very` ได้ (หลัง `very` ใช้การตรวจ adjective/participle แบบเดียวกับหลัง `not`: `He's very tired` ยังไม่พับ) แต่ `very much` (`He's very much done it`), `really`, `so`, `too`, `quite` **ไม่** โปร่งใส (`He's really done it` เป็น perfect ได้) ทั้งสองทิศทาง: `He's come home` ไม่เท่ากับ `He has come home` และไม่เท่ากับ `He is come home` (ผิดไวยากรณ์ จึงตรวจว่าไม่ถูกรับ) |
| `'s` ก่อน `been`/`got` = `has` (`He's been` = `He has been`; ไม่เท่ากับ `He is been`) | `'d` ยกเว้นก่อน `like`/`love` (`I'd like` = `I would like`) |
| `name's` (`My name's Ann` = `My name is Ann`) | ชื่อ + `'s` (`Sam's from Japan` อาจเป็น possessive) ต้องใส่รูปเต็ม `Sam is ...` หรือ `strict`; กลับทิศก็เหมือนกัน: `Sam is happy` ไม่เท่ากับ `Sam's happy`, `He has finished` ไม่เท่ากับ `He's finished`, `I would go` ไม่เท่ากับ `I'd go` |
| ตัวเลข 1–20, 30–90, 100: `10`=`ten`, `a hundred`=`one hundred`=`100` | ลำดับที่ทุกตัว (`first`/`1st`, `twenty-first`/`21st`, `thirtieth`/`30th`), `zero`/`0`, เลข 101 ขึ้นไป, เลขที่มี `:` `,` `.` (`3:30`, `1,000`), เลขนำหน้าด้วย 0 |
| 21–99: `21`=`twenty-one`=`twenty one` | `a 100` (ไม่เท่ากับ `100`), `110` (ไม่เท่ากับ `ten`) |
| `its` ≠ `it's`, `his` ≠ `he's` (ไม่แตะ) | |

8. (เฉพาะตอนเทียบ) **สะกดแบบอังกฤษ/อเมริกันพับเป็นคำเดียวกัน** (`src/lib/answers/spelling.ts`): `colour`=`color`, `grey`=`gray`, `favourite`=`favorite`, `centre`=`center`, `mum`=`mom`, `neighbour`, `travelling`/`traveling`, `practise`/`practice`, `organise`/`organize`, `pyjamas`/`pajamas`, `jewellery`/`jewelry`, `aeroplane`/`airplane` ... รวมรูปผันที่มีจริง (`colours`, `coloured`) ใช้ **ตารางปิดของคู่คำ** ไม่ใช้กฎต่อท้าย (`-our`→`-or` จะทำให้ `four`/`hour`/`your` กลายเป็นคำอื่น) และไม่ใส่คู่ที่อีกฝั่งเป็นคนละคำ (`check`/`cheque`, `story`/`storey`, `whisky`/`whiskey`) ผู้เขียนเขียนรูปเดียวพอ ไม่ต้องใส่อีกสะกดใน `accept` ปิดได้ด้วย `strict: true` ข้อควรรู้: `practise` (กริยา) กับ `practice` (นาม) ถูกพับเป็นคำเดียวกัน

**`strict: true`** (ไม่บังคับ) ใช้ได้กับ `dictation`, `translate_th_en`, `fill_blank` ปิดการพับ เหลือเพียงตัวพิมพ์เล็กใหญ่/เครื่องหมาย/ช่องว่าง ตัวอย่างข้อที่ต้องใช้: คำตอบของ `fill_blank` ที่เป็นคำย่อหรือตัวเลข (`answer: ["ten"]`) **ต้องตั้ง `strict` ให้ชัด** (`true` = รับ `ten` เท่านั้น, `false` = รับ `10` ด้วย) กฎ `answer-forms` บังคับ

ตัวอย่าง: `"B, U, S"` กับ `"b u s"` ตรงกัน, `"Nice to meet you…"` ตรงกับ `"Nice to meet you."`, `"He's 10"` ตรงกับ `"He is ten"` แต่ `"B-U-S"` ไม่ตรงกับ `"B U S"` (ขีดกลางไม่ถูกลบ) และ `"Its a door"` ไม่ตรงกับ `"It's a door"`

**แนวทางเขียน `accept`**
- ไม่ต้องใส่รูปที่ต่างกันแค่ตัวพิมพ์ใหญ่เล็ก หรือเครื่องหมาย `. ! ? ,` (`"Nice to meet you"` ครอบคลุม `"nice to meet you!"`)
- **ไม่ต้องใส่** รูปที่ตัวตรวจพับให้ (คอลัมน์ซ้ายของตารางข้อ 7: `I'm` / `I am`, `10` / `ten`, `21` / `twenty-one`) เขียนรูปเดียวพอ แต่รูปในคอลัมน์ขวา (`'s` + participle, ชื่อ + `'s`, ลำดับที่, เลขใหญ่, zero) **ต้องใส่ทุกรูป** หรือตั้ง `strict: true`
- ต้องใส่รูปที่ต่างจริง: คำพ้อง (`"Pleased to meet you"`) ลำดับคำที่ถูกอีกแบบ และขีดกลาง (`"b-u-s"`)
- `dictation`: `audioText` ถือเป็นคำตอบที่รับเสมอ จึงไม่ต้องซ้ำใน `accept` และถ้าไม่มี `accept` จะใช้ `audioText` อย่างเดียว
- `arrange_words`: ถ้าแผ่นป้ายต่อเป็นประโยคถูกต้องได้มากกว่าหนึ่งแบบ ให้ใส่แบบอื่นใน `accept` (เช่น `answer: "My name is Sam"`, `accept: ["Sam is my name"]`) validator ตรวจว่าทุกรายการใช้แผ่นป้ายครบพอดี เทียบตัวพิมพ์เล็กใหญ่แบบไม่สนใจ เพราะตัวพิมพ์ของแผ่นป้ายตามประโยคใน `answer` (เช่น ป้าย `This` กับคำตอบ `Is this my pen`) และต้องเว้นวรรคเดียวระหว่างคำ ตอนแสดงผล player แสดงแผ่นป้ายเป็นตัวพิมพ์เล็กเสมอ เพื่อไม่ให้ตัวพิมพ์ใหญ่บอกใบ้คำแรก ยกเว้น `I` (และ `I'm` ฯลฯ) และคำที่ขึ้นต้นด้วยตัวพิมพ์ใหญ่กลางประโยคใน `answer` หรือ `accept` ข้อใดข้อหนึ่ง (ชื่อเฉพาะ เช่น `Sam`) แผ่นแรกในแถวคำตอบแสดงตัวพิมพ์ใหญ่ เป็นการแสดงผลเท่านั้น: ข้อความที่ส่งตรวจใช้คำตามต้นฉบับใน `words` และการตรวจไม่สนตัวพิมพ์ ดังนั้นใน `words` ใส่ตัวพิมพ์ตามที่ขึ้นต้นประโยคใน `answer` ได้ตามเดิม
- `fill_blank`: ช่องหนึ่งรับคำตอบที่ถูกได้หนึ่งสตริง (ข้อจำกัดที่ทราบแล้ว)
- ข้อความว่าง (หลัง normalise) ไม่ถือว่าตรงกับอะไรเลย

**`phonemes` (ไม่บังคับ ทุกชนิด)** `phonemes: string[]` รหัสเสียง (ชุดเดียวกับ `phoneme_intro.phoneme` เช่น `"ae"`) ที่ exercise นี้ฝึก ถ้ามีจะกำหนด tag `phoneme:<p>` ของ attempt ตรงๆ ถ้าไม่มี ระบบใช้กฎเดิม (รหัสของ `phoneme_intro` ในบทเดียวกัน สำหรับ section pronunciation และ `minimal_pair`/`phoneme_intro`) ใช้กับวันทบทวนที่ไม่มี `phoneme_intro` ยังไม่ได้ใส่ใน content ปัจจุบัน

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

## กฎที่ตัวตรวจบังคับ

กฎชุดนี้อยู่ที่ `src/lib/content/rules/` (หนึ่งไฟล์ต่อหนึ่งกลุ่มกฎ) รันพร้อม `make validate` และบล็อก CI ตัวตรวจพิมพ์ปัญหาเป็นกลุ่มตามชื่อกฎ (`== rule taught-words (3) ==`) แต่ละบรรทัดบอกไฟล์ และ `[exercise id หรือ vocab id]` อ่านกฎเหล่านี้ก่อนเขียนบทเรียน

### `taught-words`: ใช้เฉพาะคำที่สอนแล้ว
- **ประโยคตัวอย่างของคำ (`examples[].en`)** ใช้ได้เฉพาะคำที่สอนแล้ว *ภายในวันเดียวกับที่คำนั้นถูกสอน* หรือก่อนหน้า
- **ข้อความอังกฤษที่ผู้เรียนเห็น/ได้ยินใน exercise** (`text`, `audioText`, `lines`, `prompt`, `sampleAnswer`, `choices`, `answer`, เฉลยแรกของ `translate_th_en`) ใช้ได้เฉพาะคำที่สอนภายในวันของบทนั้นหรือก่อนหน้า
- รูปผันถือเป็นคำเดียวกัน: พหูพจน์/`-s`/`-es`/`-ing`/`-ed` ปกติ รูปใน `forms` ของคำ (`am / is / are` ของ `be`) และคำย่อ (`I'm` = I + am) `Sam's` นับเป็น `Sam`
- **ได้รับยกเว้น:** คำใน `src/lib/content/rules/allowlists.ts`: `FUNCTION_WORDS` (a, an, the, and, or, but, of, to, at, baht), `A1_WORDS_WITHOUT_ENTRY_YET` (I, you, it, this, that, my, your, what, who, have, too: คำ A1 ที่ยังไม่มี entry), `NUMBER_WORDS_WITHOUT_ENTRY` (11–19 และสิบๆ), `PROPER_NAMES`, ตัวอักษร a–z, และ `USED_BEFORE_TAUGHT` (คำที่มี entry แต่เนื้อหาใช้ก่อนวันสอน: คำ → วันสุดท้ายที่ยังใช้ได้ เช่น `is: 7`) คำที่อธิบายไทยไว้ใน `glossary` ของบทอ่านนั้น ข้อความ `{ en, th }` ที่มีไทยกำกับ (`question`, `scenario`, `goals`), `prompt` ของ `free_write`/`use_in_sentence` (instruction ไทยบอกงานซ้ำอยู่แล้ว) และคำฝึกเสียงล้วน (`phoneme_intro.examples`, `minimal_pair`)
- รายการใน `allowlists.ts` ต้อง **หดลง**: เทสต์ `allowlists.stale.test.ts` ล้มเมื่อคำในรายการ (ยกเว้นชื่อและตัวอักษร) มี entry ในคลังแล้ว หรือเมื่อคำใน `USED_BEFORE_TAUGHT` ไม่มี entry, ไม่ถูกใช้ก่อนวันสอนอีกแล้ว หรือวันจำกัดไม่ตรงกับการใช้จริง ห้ามเพิ่มคำเพื่อให้ผ่านโดยไม่คิด: สอนคำก่อน หรือเขียนประโยคใหม่

```
ERROR content/lessons/day-009.json [d009-speak-02]: uses words not taught by day 9: "count" in prompt. Teach the word earlier, rewrite the text, or (names, function words) add it to src/lib/content/rules/allowlists.ts.
ERROR content/vocab/oxford-3000/a1.json [v-fine]: examples[1] "My dog is fine." uses words not taught by day 2 (the day v-fine is first taught): "dog". ...
```

### `cast-props` (warning): ของของตัวละครมีสีเดียวตลอดสัปดาห์
ภายในสัปดาห์เดียวกัน เจ้าของคนเดียวกัน + สิ่งของเดียวกันต้องมีสีเดียวกัน ถ้าพบสองสี **เตือน (warning)** ระบุทั้งสองตำแหน่ง (ใช้ warning เพราะตัวละครซื้อของใหม่ได้ เช่น แนนซื้อกระเป๋าสีชมพูวัน 26) สีมาจากรายการปิด `COLOUR_WORDS` (คำสีในคลังคำ; `grey`=`gray`) รูปที่อ่านได้แน่:
- `Nan's umbrella is orange` · `Nan has a green umbrella` (รวมรายการ `a red bag, a blue pen and an orange umbrella`)
- `I am Nan. I have a green umbrella` / `My bag is brown` / `My pink bag is new` เมื่อข้อความมีผู้พูดชื่อเดียว (`I am Nan`) หรือใช้ป้ายบทสนทนา `Nan: My bag is pink.`

**ตรวจไม่ได้:** `I have an umbrella. It is orange.`, `Her/His bag is brown` (ต้องอ้างถึงสรรพนาม), นามพหูพจน์ที่ไม่มีเจ้าของ (`The chairs are white`), นามที่มี adjective คั่น (`Nan's big bag is red`), ของของ `we`

```
WARN content/lessons/day-028.json [d028-read-01]: "Nan"'s umbrella has two colours in days 22-28: orange in content/lessons/day-023.json [d023-read-01] text ("Nan's umbrella is orange") but green in content/lessons/day-028.json [d028-read-01] text ("I have a green umbrella"). Within one week a character's thing keeps its colour: change one of them (or use another noun or name if these are different things).
```

### `grammar-not-yet`: รูปคำที่ต้องใช้ไวยากรณ์ที่ยังไม่สอน
`taught-words` ถือว่ารูปผันเป็นคำเดียวกับคำที่สอน (`lives` = `live`) ซึ่งถูกสำหรับคำถามว่า "ผู้เรียนเคยเจอคำนี้หรือยัง" แต่ไม่รู้ว่า `He lives ...` ต้องใช้ -s บุรุษที่สามของ Present Simple ที่หลักสูตรสอนสัปดาห์ 6 (วัน 36–42) จึงแยกเป็นกฎของตัวเอง (เป็นประตูไวยากรณ์ "รูปนี้ใช้ได้ตั้งแต่วันไหน" พร้อมคำแนะนำของตัวเอง ไม่ปนกับเรื่องคำศัพท์) ตารางอยู่ที่ `GRAMMAR_NOT_BEFORE` ใน `src/lib/content/rules/grammar-not-yet.ts` (รูป → วันแรกที่ใช้ได้ ตาม `docs/CURRICULUM.md` หัวข้อ 4):
- `has` ไม่ก่อนวัน 29 (สัปดาห์ 5 have/has); `does`, `goes` ไม่ก่อนวัน 36
- รูป -s บุรุษที่สามที่สร้างจากกริยา (`pos: verb`) ทุกคำในคลังคำ (`lives`, `loves`, `works`, ...) ไม่ก่อนวัน 36 ข้ามคำที่มี entry เป็นคำนามด้วย (`play`) และรูปที่ตามหลัง determiner/เลข (`their lives`, `two works` อ่านเป็นคำนาม)
- `do not` / `don't` (ปฏิเสธด้วย do) ไม่ก่อนวัน 36 (Present Simple) ส่วนคำถาม `Do you ...?` / `How do you spell it` ใช้ได้ตั้งแต่วัน 5
- ไม่สร้างรูปที่เป็นคำในตัวเอง (`thanks` ไม่ใช่ -s ของ `thank`) หรือที่เป็นคำในคลัง/รายการยกเว้นอยู่แล้ว
- `but` ไม่ก่อนวัน 36 เป็น **warning** เพราะหลักสูตรยังไม่ระบุวันของ `but` (36 เป็นค่าชั่วคราว รอเจ้าของหลักสูตรตัดสิน) รายการอื่นเป็น **error**
- ตรวจข้อความอังกฤษที่ผู้เรียนเห็นหรือได้ยินทุกช่อง รวม `accept` ทุกรายการของ `translate_th_en`/`dictation`/`arrange_words` (ฟังก์ชัน `checkedEnglish`; ไม่รวมคำฝึกเสียงและข้อความคำถามที่มีคำแปลไทยกำกับ) และ `examples` ของคำ (ที่วันที่สอนคำนั้น)
- **ยกเว้นเมื่อ** `glossary` ของ `read_passage` ในข้อนั้นอธิบายรูปนั้นไว้ (คำ → คำแปลไทย) ไม่มี allow-list อื่น

```
ERROR content/lessons/day-019.json [d019-read-01]: text "My mother lives in Bangkok." uses a form of a grammar point not taught yet by day 19: "lives" is the third-person -s form of "live"; first allowed on day 36. Rewrite the sentence with I / you / we / they and the base verb (for example "They live in Bangkok"), or explain the form in the `glossary` of a read_passage.
```

### `vocab-used`: คำใหม่ต้องถูกใช้ในวันนั้น
ทุก id ใน `vocab` ของบทต้องปรากฏ (รวมรูปผัน) ในข้อความอังกฤษที่ผู้เรียนเห็นของ exercise อย่างน้อยหนึ่งข้อในบทเดียวกัน (นับรวมคำฝึกเสียง แต่ไม่นับ `vocab_match` ที่แสดงแค่คู่คำ) คำหลายคำเช่น `wake up` ถือว่าใช้เมื่อคำหลัก (`wake` และรูปผัน `wakes`/`waking`/`woke`) ปรากฏ ส่วนคำเสริมเดี่ยว ๆ (`up`) ไม่นับ

```
ERROR content/lessons/day-005.json [v-letter]: vocab[1]: "letter" is taught on day 5 but no exercise of this lesson uses it (looked for "letter" or an inflected form in the learner-facing English). Use it in an exercise or move it to the day that does.
```

### `gloss-unique`: คำแปลบนแฟลชการ์ดต้องไม่ซ้ำ
การ์ดไทย→อังกฤษแสดง `th` ทั้งสตริง จึงเทียบ *สิ่งที่ผู้เรียนเห็น*: รายการคำแปล (แยกด้วยจุลภาคนอกวงเล็บ รวมข้อความในวงเล็บ ปรับเป็น NFC ยุบช่องว่าง ตัดอักขระความกว้างศูนย์) ถ้าสองคำที่สอนแล้วมีรายการเหมือนกันเป๊ะ การ์ดแยกไม่ได้ **error** ไม่มีทางหนี: แก้คำแปลให้ต่างกัน (เช่น เติมวงเล็บอธิบาย) ส่วนรายการที่เหมือนกันเฉพาะเมื่อไม่นับวงเล็บ (`ไม่ (คำตอบ)` กับ `ไม่ (วางหลัง is)`) เป็นการ์ดคนละใบ จึงผ่าน แต่พิมพ์ **WARN** (`near-clash`) ให้ผู้ตรวจดู ไม่ทำให้ตรวจไม่ผ่าน

```
ERROR content/vocab/oxford-3000/a1.json [v-nice]: th "ดี, น่ายินดี": the gloss item "ดี" is also a gloss item of v-good ("ดี"); the Thai->English flashcards cannot tell them apart. Rewrite one gloss to disambiguate it (e.g. add a qualifier in parentheses or a distinguishing word).
WARN content/vocab/oxford-3000/a1.json [v-not]: near-clash: the gloss item "ไม่ (วางหลัง is)" matches "ไม่" in v-no ("ไม่ (คำตอบ)") once the parenthetical qualifiers are removed. ...
```

### `pronunciation`: ความสอดคล้องของข้อฝึกออกเสียง
- `repeat_after_me` ที่มี `ipa`: จำนวนคำใน `ipa` ต้องเท่ากับจำนวนคำใน `text` (กัน IPA ของประโยคอื่น)
- `minimal_pair`: ห้ามใช้คำที่ออกเสียงได้หลายแบบตามความหมาย (`HETERONYMS` ใน `pronunciation.ts`: live, read, lead, wind, tear, close, bow, row, use, present, record, object, minute ...) เพราะ TTS อ่านไม่แน่นอน
- ถ้า `instruction` ของ `repeat_after_me`/`phoneme_intro` เอ่ยสัญลักษณ์ IPA ระหว่างเครื่องหมาย `/ /` (เช่น `/ɔː/` จะติดกับตัวอักษรไทยก็ได้) สัญลักษณ์นั้นต้องอยู่ใน `ipa` **ในฐานะหน่วยเสียงเต็ม** (`/ɪ/` ไม่ตรงกับ `aɪ`, `/e/` ไม่ตรงกับ `eɪ`, `/t/` ไม่ตรงกับ `tʃ`) ของข้อนั้น (หรือของคำตัวอย่างใน `examples` ที่มีในคลัง) `tipTh` ของ `phoneme_intro` เอ่ยเสียงอื่นเพื่อเทียบได้ จึงไม่ถูกตรวจ ข้อ `repeat_after_me` ที่เอ่ยสัญลักษณ์แต่ไม่มี `ipa` ก็ผิด

```
ERROR content/lessons/day-010.json [d010-pron-03]: ipa "/ɪˈlevn twelv/" has 2 word(s) but text "Eleven, twelve, thirteen, fourteen, fifteen." has 5 word(s); the IPA probably belongs to another sentence.
ERROR content/lessons/day-010.json [d010-speak-03]: the instruction names /ɔː/ but the item's ipa "/ˌsɪksˈtiːn .../" does not contain it. Practise the sound ...
```

### `sound-words`: เสียงที่เอ่ยถึงต้องอยู่ในคำที่ยกมา
เมื่อ `instruction.th`, `instruction.en` หรือ `tipTh` ของ exercise ใดเขียนว่า `/x/ ใน w1, w2 และ w3` (หรือ `/x/ in w1, w2 and w3`) ทุกคำในรายการที่มี entry ในคลังคำต้องมี `/x/` (เป็นหน่วยเสียงเต็ม เหมือนกฎ `pronunciation`) ใน IPA แบบ US หรือ UK อย่างใดอย่างหนึ่ง ถ้าไม่มี เป็น **error** (เหตุการณ์จริง: "ระวังเสียง /v/ ใน five, seven, sixteen และ seventeen" ทั้งที่ sixteen ไม่มี /v/) ถ้าคำไม่มี entry ในคลัง ตรวจไม่ได้ จึงเป็น **warning** บอกให้ผู้เขียนตรวจ IPA เอง (หรือเพิ่มคำนั้นเข้าคลัง)
- รายการคำหยุดเมื่อเจอคำที่ไม่ใช่ตัวอักษรละติน: `/w/ ใน we กับ /v/ ใน live และ very` อ่านเป็นสองข้อความ (`we` | `live, very`) และ `/v/ ใน eleven, twelve และ /θ/ ใน thirteen` ก็เช่นกัน
- รายการภาษาอังกฤษหยุดที่ `not` / `unlike` / `but` (`/θ/ in three, not in this` อ่านเป็น three) เทียบ IPA โดยรวมตัวสะกดที่พิมพ์ต่างกัน (`g`=`ɡ`, `ʧ`=`tʃ`, `ʤ`=`dʒ`, `ɹ`=`r`) และ `/ɑ/ /ɔ/ /ɜ/` ที่ไม่มี `ː` ตรงกับสระยาวของคลัง (`/i/` ไม่ตรงกับ `iː`)
- ไม่นับเป็นข้อความอ้าง (ข้าม): เสียงที่เขียนหลัง `ไม่ใช่`/`ต่างจาก`/`not` (เป็นเสียงที่คำ *ไม่มี* เพื่อเทียบ) และรายการที่ขึ้นต้นด้วย `the/a/an/word`
- คำที่เป็นรูปผันของ entry (เช่น `women` ของ `woman`) ถือว่าไม่มี entry เพราะ IPA ของรูปผันต่างจากคำฐาน: ถ้าอยากให้ตรวจได้ ให้เพิ่มเป็น entry เอง
- ไม่ตรวจ: ชื่อเสียงที่เขียนแบบอื่น (เช่น "เสียง v" ไม่มี `/ /`), ชื่อบท/objectives, คำที่ยกมาโดยไม่มีคำว่า ใน/in ติดหลังเสียง

```
ERROR content/lessons/day-017.json [d017-speak-03]: the text names /v/ in a list of words, but the vocab bank's IPA says "sixteen" (ipa /ˌsɪksˈtiːn/) does not contain /v/. Remove that word from the list, or name the sound the word really has.
WARN content/lessons/day-021.json [d021-pron-02]: the text names /ð/ in a list of words, but "them" has no vocab entry, so the sound could not be checked. Check the IPA yourself, or add the word to the vocab bank.
```

### `phoneme-tags`: section ที่สอนหลายเสียงต้องติดแท็กเสียงให้ทุกข้อ
ใน section `pronunciation` ที่มี `phoneme_intro` ถ้า section นั้นสอนเสียงมากกว่าหนึ่งเสียง ทุก `minimal_pair` และ `repeat_after_me` ใน section ต้องมี `phonemes` (array ของรหัสเสียง ชุดเดียวกับ `phoneme_intro.phoneme` เช่น `["th", "dh"]`) ไม่เช่นนั้นข้อนั้นจะได้แท็กตั้งต้นเป็นรหัสของ `phoneme_intro` ตัวแรกเท่านั้น (ดู `src/lib/attempts/derive.ts`) และการพลาดเสียง /ð/ จะถูกนับเป็นพลาดเสียง /θ/ เป็น **error** เพราะวิธีแก้คือเติม array อย่างเดียว

"สอนหลายเสียง" ตัวตรวจรู้ได้จาก 3 อย่างเท่านั้น: `ipa` ของ `phoneme_intro` เอ่ยสัญลักษณ์ 2 ตัวขึ้นไป (`"/θ/ /ð/"`), section มี `phoneme_intro` มากกว่า 1 ข้อ, หรือมีข้อใดใน section ที่ติด `phonemes` ไว้ 2 รหัสขึ้นไปแล้ว (คู่เทียบ เช่น `["v", "w"]`) **ตรวจไม่ได้:** section ที่ intro เอ่ยเสียงเดียว และคู่เสียงเทียบที่ไม่มีข้อไหนติดแท็ก 2 รหัสเลย ผู้เขียนต้องคิดเอง (ถ้า `minimal_pair` เทียบสองเสียง ให้ติด `phonemes` ทั้งสองเสียงเสมอ) ข้อใน section อื่น (เช่น `speaking`) ไม่ถูกตรวจ

```
ERROR content/lessons/day-018.json [d018-pron-02]: this pronunciation section teaches more than one sound (/θ/ and /ð/), but this minimal_pair has no "phonemes", so it would be tagged only "th" (the first phoneme_intro's code) and a miss on the other sound is counted against the wrong one. Add "phonemes": [...] with the code(s) of the sound(s) it practises, the same codes as phoneme_intro.phoneme.
```

### `cast-consistency` (warning): ตัวละครเดียวกันอายุเท่าเดิมตลอดสัปดาห์
ภายในสัปดาห์เดียวกัน (วัน 7k+1 ถึง 7k+7) ชื่อเดียวกัน (ต้องอยู่ใน `PROPER_NAMES`) ต้องมีอายุเดียวกัน ถ้าพบสองอายุ ตัวตรวจ **เตือน (warning)** หนึ่งข้อต่อชื่อ ระบุทั้งสองตำแหน่งและอายุ (warning ไม่ทำให้ check ล้ม แต่ขึ้นใน job summary ของ CI) ใช้ warning เพราะคนสองคนอาจใช้ชื่อเดียวกันได้ ถ้าเป็นคนละคนให้เปลี่ยนชื่อคนใดคนหนึ่ง ตัวตรวจอ่านรูปเหล่านี้ในข้อความอังกฤษที่ผู้เรียนเห็นและ `examples` ของคำ (นับที่วันที่สอนคำนั้น):
- `Ann is thirteen` / `Ann's 13` / `Ben is 14 years old` (ชื่อ + is/'s + เลข 1–120 ที่ตามด้วยจบประโยค, `years old`, and หรือ but)
- บทสนทนา `Ann: No, I am not. I am thirty.` ป้ายชื่อหน้าบรรทัดเป็นผู้พูดของ `I am N` ในบรรทัดนั้น และถูกตัดออกก่อนอ่านรูปอื่น
- `I am Ann ... I am nineteen` / `My name is Sam. I'm 12` เฉพาะเมื่อข้อความนั้นมีชื่อผู้พูดเพียงชื่อเดียว
- `This is my friend, Ann. She is eight.` (`He/She is N` ที่ตามหลังประโยคที่มีชื่อเพียงชื่อเดียว)

**ตรวจไม่ได้** (ผู้เขียนต้องระวังเอง): อายุที่เขียนแบบอื่น (`Ann has ... birthday`, ปีเกิด), `How old is Ann?` + คำตอบที่อยู่คนละประโยค, `They are ten`, ข้อความที่มีผู้พูดสองคน (`Ann: I am ten` / `Ben: I am nine` ในบทสนทนา), ชื่อที่ไม่อยู่ใน `PROPER_NAMES`, และข้ามสัปดาห์ (สัปดาห์ใหม่เปลี่ยนตัวละครได้)

```
WARN content/lessons/day-010.json [d010-listen-02]: "Ann" has two different ages in days 8-14: 10 in content/lessons/day-009.json [d009-write-02] text ("Ann is ten") but 15 in content/lessons/day-010.json [d010-listen-02] audioText ("Ann is fifteen"). Within one week a character keeps one age: change one of them (or use another name if these are two different people).
```

### `arrange-words`: ชื่อเฉพาะต้องตรงกับที่ UI แสดง
UI (`tile-label.ts`) แสดงแผ่นป้ายเป็นตัวพิมพ์เล็กทั้งหมด ยกเว้น `I` และคำที่ขึ้นต้นตัวใหญ่ *กลางประโยค* ใน `answer` หรือ `accept` กฎจึงบังคับว่า
- คำขึ้นต้นตัวใหญ่กลางประโยค (ไม่ใช่ `I`) ต้องอยู่ใน `PROPER_NAMES` (`allowlists.ts`)
- ชื่อใน `PROPER_NAMES` ที่ขึ้นต้นประโยคอย่างเดียวในทุกประโยคที่รับ จะถูกแสดงเป็นตัวเล็ก (`sam`) ให้เพิ่ม `accept` ที่ชื่ออยู่กลางประโยค (เช่น `"My friend is Sam"`) หรือเรียบเรียงใหม่

```
ERROR content/lessons/day-001.json [d001-write-01]: "Sam" is a proper name that only starts a sentence here, so the tile UI shows it in lower case ("sam"). Add an accepted sentence with "Sam" in the middle ...
```



### `arrange-question`: ประโยคบอกเล่าที่สลับเป็นคำถามได้ต้องรับคำถามด้วย
`arrange_words` ที่ `answer` เป็น `<Subject> is/are/am ...` (หรือ `<Subject> can/could/should/must/will/would ...`) ใช้แผ่นป้ายชุดเดียวกันต่อเป็นคำถาม Yes/No ได้ (`Is <subject> ...`) ผู้เรียนต่อแบบไหนก็ได้ จึงต้องมีประโยคคำถามนั้นใน `accept` (เทียบแบบเดียวกับตอนตรวจคำตอบ: ไม่สนตัวพิมพ์ใหญ่เล็กและเครื่องหมายวรรคตอน) ถ้าข้อนั้นตั้งใจรับเฉพาะประโยคบอกเล่า ให้ตั้ง `"statementOnly": true` เป็น **error** เพราะประโยคคำถามที่กฎสร้างให้เป็นภาษาอังกฤษที่ถูกเสมอ และมีทางหนีด้วย `statementOnly`

ตัวตรวจสร้างประโยคคำถามเฉพาะเมื่อทุกอย่างก่อนกริยาเป็นประธานที่รู้จักแน่ๆ: สรรพนาม, determiner/possessive (`my`, `Tom's`), เลข, adjective/คำนามในคลัง, ชื่อใน `PROPER_NAMES` (หรือ `Mr/Mrs/Ms/Miss/Dr` + ชื่อ), เชื่อมด้วย `and`, และวลีบอกที่ในประธาน (`The cat in the box is big`) คำอื่นก่อนประธาน (`Tomorrow we will ...`, `Maybe she is ...`, `Usually I am ...`, `Of course he is ...`) หรือคำที่คลังไม่รู้จัก ทำให้ไม่สร้างคำถามเลย (ประโยคกลับด้านจะไม่ใช่ภาษาอังกฤษ)

กฎ **ข้าม** (ตั้งใจให้แคบและแม่น): ประโยคปฏิเสธ (`I am not ...`), wh-question (`How are you`), `Yes, ...`/`No, ...`, ประโยคที่มีเครื่องหมายจุลภาค, สองอนุประโยค (มี is/are/modal ตัวที่สอง หรือ and/but/or/because/so/if/when หลังกริยา), `Here is ...`, คำสั่ง/คำเปิด (`Please be ...`), คำย่อ (`She's ...`) และกรณีที่แผ่นป้ายต่อประโยคคำถามนั้นไม่ได้

```
ERROR content/lessons/day-017.json [d017-write-01]: "My baby is very happy" has the same tiles as the yes/no question "Is my baby very happy", so a learner can build the question, but it is not in accept and would be marked wrong. Add "Is my baby very happy" to accept, or set "statementOnly": true if only the statement may be accepted.
```

### `answer-forms`: รูปคำตอบที่ตัวตรวจไม่พับให้
ตรวจ `accept`/`audioText`/`answer` ของ `dictation`, `translate_th_en`, `fill_blank` (ข้ามข้อที่ตั้ง `strict: true`) ตามตารางข้อ 7 ของหัวข้อการเทียบคำตอบ: ถ้ามีรูปที่ไม่พับ ต้องใส่รูปคู่กันใน `accept` ด้วย หรือตั้ง `strict: true` และ `fill_blank` ที่เฉลยเป็นคำย่อ/คำเต็ม/ตัวเลข ต้องตั้ง `strict` ให้ชัด
- `'s` ก่อน participle หรือคำ `-ed`, `X has + participle`, `X is + participle` (X = he/she/it/that/there/here/what/where/who/how/name หรือชื่อ), `pronoun would` (ไม่ใช่ก่อน like/love), `Name is`, `'d`: ต้องมีทั้งสองรูป ข้อความของตัวตรวจ **ไม่ยกประโยคตัวอย่างที่อาจผิดไวยากรณ์** ให้เลือกรูปเต็มที่ถูกเอง: `X has ...` (perfect) หรือ `X is ...` (adjective/passive)
- possessive: `Name's` ตามด้วยคำนามจากคลังคำ (หรือ adjective + คำนาม) ถือเป็นความเป็นเจ้าของ ไม่ผิด (`It is Ann's pen`); ตามด้วย a/the/from/in/not/adjective ล้วน ถือเป็นคำย่อ ต้องใส่ `Name is ...`; พหูพจน์ `students'` ผ่าน
- ลำดับที่ 1st–100th และ `twenty first` = `twenty-first`

```
ERROR content/lessons/day-020.json [d020-write-03]: "He's tired": "he's" before "tired" is ambiguous ("he is" or "he has"), so grading does not fold it. Also accept whichever full form is correct: "X has ..." (perfect) or "X is ..." (adjective or passive), or set "strict": true on this exercise (then only the listed spellings are accepted).
ERROR content/lessons/day-021.json [d021-write-02]: answer "ten" is a contraction, a full form or a number; grading would fold it with its other spelling. Decide explicitly: set "strict": true (only "ten") or "strict": false (the other spelling is accepted too).
```

### `answer-forms`: ข้อสังเกตเพิ่ม
- `'s` พับเฉพาะในบริบทที่แน่ใจว่าไม่ใช่กริยา (allow-list) คำที่ไม่รู้จักจึงทำให้เข้มขึ้นเท่านั้น ไม่เคยทำให้รับคำตอบผิด; กฎและการตรวจคำตอบใช้ฟังก์ชัน `sReading` ตัวเดียวกัน
- คำนามทั่วไป + `'s` + a/an/the/not/คำบุพบท (`My mother's a teacher`) ต้องใส่ `My mother is ...` ด้วย
- `Name's` + คำที่เป็นทั้งคำนามและ adjective/adverb (`Tom's home`, `Ann's back`) ถือเป็นคำย่อ; adjective สูงสุด 2 คำ + คำนาม (`Ann's big red bag`) ถือเป็น possessive

- เขียนความเป็นเจ้าของด้วย `has` / `has got` ห้ามเขียนเป็น `'s` (`He's two cars` ผิด): ตัวตรวจเตือน (warning) เมื่อ `he's`/`she's` ตามด้วย no/many/a lot of/เลข 2-10 + คำนามในคลังคำ ที่ไม่ใช่หน่วยเวลา
- ท้ายประโยคย่อย (`Yes, he is.`) และสรรพนามเดี่ยวหลัง `is` (`Where is he?`) ไม่ต้องมีรูปย่อ

### `thai-names`: ชื่อตัวละครเขียนเป็นภาษาไทยแบบเดียวทุกบท
`THAI_NAMES` ใน `src/lib/content/rules/allowlists.ts` เก็บการสะกดภาษาไทยของ **ทุกคน** ใน `PROPER_NAMES` (สถานที่ไม่ต้องมี) **ชื่อใหม่ต้องเพิ่มที่นี่ในวันที่เริ่มใช้** (เช่น `Mali: "มาลี"`) แล้วเขียนแบบเดียวกันทุกบท
- ชื่อที่อยู่ในข้อความอังกฤษของบท แต่ยังไม่มีใน `THAI_NAMES` เป็น **warning**: `add the Thai spelling of "Kate" to THAI_NAMES in src/lib/content/rules/allowlists.ts ...`
- ในข้อความไทยของบทนั้น (ทุกช่อง ยกเว้น `tipTh` ที่อธิบายเสียง) คำที่ต่างจากการสะกดที่ลงทะเบียนไว้ 1–2 ตัวอักษร (`ลีโอว` แทน `ลีโอ`, `นัน` แทน `แนน`) เป็น **error** เพราะผู้เขียนแก้ได้ทางเดียว: เขียนตามตาราง
- ภาษาไทยไม่มีช่องว่าง ตัวตรวจจึงตั้งใจให้แคบ: คำที่เข้าข่ายต้องอยู่ระหว่าง (ต้นข้อความ หรือ `ของ/กับ/และ/คือ/ว่า/ถาม/ชื่อ...`) กับ (ท้ายข้อความ หรือ `อายุ/อยู่/เป็น/สี/ราคา/เท่า...`), ห่างจากการสะกด 1–2 ตัวอักษรและมีตัวอักษรเหมือนกันตามลำดับอย่างน้อยความยาว−1, และไม่ใช่การสะกดของชื่ออื่น (`แอน` ห่างจาก `แนน` 1 ตัว) กับไม่อยู่ใน `NOT_A_NAME` (คำสามัญที่ห่างชื่อหนึ่งตัว เช่น `เบา`~`เบน` เพิ่มได้เฉพาะเมื่อกฎยิงใส่คำนั้นจริงในเนื้อหา)
- ชื่อที่การสะกดไทยเป็นคำสามัญอยู่แล้ว (`Mai`=ไหม, `Nok`=นก, `Lek`=เล็ก, `Fon`=ฝน; รายการ `THAI_NAME_IS_A_WORD`) ไม่ถูกตรวจการสะกดผิด
- **ตรวจไม่ได้:** การสะกดผิดที่อยู่ติดคำที่ไม่อยู่ในรายการ `BEFORE`/`AFTER` ใน `thai-names.ts`, ชื่อที่สะกดถูกแต่สลับคน, ชื่อไทยในบทที่ไม่มีชื่ออังกฤษคู่กัน

```
ERROR content/lessons/day-027.json [d027-listen-01]: "ลูกบอลของลีโอวอยู่ที่ไหน" writes "ลีโอว", which looks like a misspelling of the name "Leo" (its Thai spelling is "ลีโอ", THAI_NAMES in src/lib/content/rules/allowlists.ts). Write "ลีโอ" everywhere; if "ลีโอว" is a different word, reword the sentence.
```

### `vocab-spelling`: หัวคำที่มีสะกดสองแบบต้องบอกอีกแบบใน `forms`
หัวคำ (คำเดียว) ที่อยู่ในตารางอังกฤษ/อเมริกัน (`spelling.ts`) ต้องมีสะกดอีกแบบใน `forms`: `usSpelling` สำหรับหัวคำแบบอังกฤษ (`colour` → `"usSpelling": "color"`) หรือ `ukSpelling` สำหรับหัวคำแบบอเมริกัน เป็น **error** เพราะตารางเป็นตัวตัดสิน ไม่มีดุลยพินิจ (ค่าผิดหรือใช้คีย์ผิดฝั่งก็ error) หัวคำหลายคำไม่ถูกตรวจ

```
ERROR content/vocab/oxford-3000/a1.json [v-colour]: "colour" is a UK spelling in the UK/US table (src/lib/answers/spelling.ts), but forms has no usSpelling. Add "usSpelling": "color" to its forms (and remove "ukSpelling" if it is there).
```

### `vocab-forms`: adjective ต้องลงรูปเปรียบเทียบ
adjective ทุกคำใน `forms` ต้องมี `comparative` และ `superlative` (ให้ `taught-words` รู้ว่า `bigger` คือ `big`) หรือ `"gradable": "no"` ถ้าเทียบไม่ได้ (`dead`)

```
ERROR content/vocab/oxford-3000/a1.json [v-tall]: adjective "tall" has no forms.comparative / forms.superlative. Add them (e.g. "comparative": "bigger", "superlative": "biggest") or, for an adjective that cannot be compared, "gradable": "no".
```

เมื่อ `taught-words` พบคำที่ดูเหมือนรูปผันของคำที่สอนแล้ว (เช่น `bigger`, `hopping`) ข้อความจะบอกให้เติมรูปนั้นใน `forms` ของ entry ไม่ใช่ใส่ allowlist

### รายงานใน CI
`make validate` เขียนรายงาน (จำนวนและ warning) ลง `.content-validate-summary.md` และ CI ต่อท้ายไฟล์นี้ใน job summary ของ GitHub เพื่อให้ผู้ตรวจ PR เห็น warning (warning ไม่ทำให้ check ล้ม) เมื่อรันนอก CI ตั้งตัวแปร `CONTENT_VALIDATE_SUMMARY=<ไฟล์>` หรือ `GITHUB_STEP_SUMMARY` ได้เอง

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
| `forms` | `object?` | รูปผัน เช่น `plural`, `past`, `pastParticiple`, `comparative`, `superlative`; สะกดอีกแบบ `usSpelling` (หัวคำเป็นอังกฤษ: `colour` → `"color"`) หรือ `ukSpelling` (หัวคำเป็นอเมริกัน: `mom` → `"mum"`) ซึ่งนับเป็นรูปของคำนี้ใน `taught-words` เหมือน `plural`; `gradable: "no"` เป็นเครื่องหมาย ไม่ใช่รูปคำ UI ของแฟลชการ์ดไม่แสดง `forms` |

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
| `arrange_words` | `words[]`, `answer`, `accept[]?`, `statementOnly?` | เรียงคำให้เป็นประโยค (`accept` = ประโยคอื่นที่ถูก) |
| `fill_blank` | `text` (ใช้ `___`), `answer[]` | เติมคำ |
| `translate_th_en` | `th`, `accept[]` | แปลไทยเป็นอังกฤษ |
| `free_write` | `prompt`, `minWords`, `rubric?` | เขียนอิสระ (AI ตรวจ) |
| `vocab_match` | `pairs: [{ vocabId }]` | จับคู่คำกับความหมายไทย |
| `spell_word` | `vocabId` | ฟังเสียงแล้วสะกดคำ |
| `use_in_sentence` | `vocabId`, `prompt` | แต่งประโยคด้วยคำที่กำหนด (AI ตรวจ) |

**ข้อความที่ต้องมีเสียง** (`text`, `audioText`, `lines`, `examples`, รวมถึง `word` และ `examples[].en` ในคลังคำศัพท์ ทั้งเสียง US และ UK) จะถูกสร้างเป็นไฟล์ TTS โดยอัตโนมัติด้วย `pnpm audio:generate`
