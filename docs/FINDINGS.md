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

## Round 5 (validator rules from the week-3 review)

Rules added: `arrange-question`, `sound-words`, `phoneme-tags`, `cast-consistency` (warning), `grammar-not-yet`; `very` folds in `'s` grading. What they cannot see:

- **arrange-question** skips negatives (`I am not ...`), wh-questions, `Yes, ...`, sentences with a comma, two clauses, `Here is ...`, contractions (`She's ...`) and `do/does` statements. It also skips a statement with `and/but/or` after the verb (`He is a teacher and a doctor`), so some valid questions are not demanded (false negatives). `Is my name Sam` is odd but correct English and was added on day 1 (use `statementOnly` if an author disagrees).
- **sound-words** only reads `/x/ ใน w1, w2 และ w3` / `/x/ in w1, w2 and w3`. Other wordings ("เสียง v ใน five") and section titles/objectives are not read. Words with no entry (and inflected forms such as `women`, `them`) are a warning only. A name list inside quotes works, a list after `ไม่ใช่`/`ต่างจาก`/`not` is skipped.
- **phoneme-tags** cannot know that a minimal pair contrasts two sounds when the intro names one sound and no item is tagged with two codes yet. Idea: a `phonemes` field on `phoneme_intro` for the contrast set, or derive the sounds of a pair from IPA.
- **cast-consistency** reads `Name is N`, `I am Name ... I am N` (one speaker only) and `He/She is N` after a one-name sentence. Cannot detect: ages in other wording, `How old is Ann?` + a far answer, `They are ten`, speaker-labelled dialogues (`Ann: I am ten`), names missing from `PROPER_NAMES`, and different weeks. It also treats two different people sharing a name as one (it is a warning for that reason). Week 2 had Ann at 8/9/10/15/20 and Ben at 7/9/10/13/30; fixed (children renamed Nok and Jim, ages made consistent).
- **grammar-not-yet**: the table has `has` (day 29), `does`, `goes`, regular third-person -s of every bank verb, `but` (all day 36). **Open decision for the curriculum owner:** `docs/CURRICULUM.md` gives no day for `but` (it is in `FUNCTION_WORDS`, so taught-words allows it everywhere); 36 is a placeholder and the entry is a warning only. Not yet in the table (add when a lesson needs it): `-ing` continuous contrast, past forms (`was/were`), `can`, comparatives, plural `-s` of nouns is fine. Forms inside a bilingual question text (`What does Ann say?`) and sound drills are not checked.
- **'very' in `'s` folding:** `really`, `so`, `too`, `quite` and `very much` are deliberately NOT transparent (`He's really done it`, `He's very much done it` are perfects). `He's very tired` stays unfolded like `He's not tired`: authors list both forms.
- **Ideas, not done:** check minimal pairs against a pronunciation dictionary (do the two words really differ by the named phonemes?); warn when a vocab word used in a sound claim has no entry (add `them`, `women` to the bank).

## Round 5, review follow-ups

- **`very` + a possessive 's:** `He's very little time` is folded to `He is very little time` (`little` is in the adjective list), the same already-known British-has case as `He's two cars`; the answer-forms warning for possession written as `'s` does not look through `very`.
- **grammar-not-yet** generates third-person -s forms only from bank verbs that have NO noun entry and a word that is not itself a bank word or an interjection. So `watches`, `plays`, `likes`, `costs` are not caught when the verb also has a noun entry (`watch`, `play`) or has no entry yet; add them to `GRAMMAR_NOT_BEFORE` by hand when a lesson needs it. `thanks` is never a generated form. `do not` / `don't` is gated at day 36 (Present Simple, `docs/CURRICULUM.md` week 6, which does not name negatives separately); `Do you ...?` questions stay allowed.
- **phoneme-tags** would see two sounds if a `phoneme_intro.ipa` ever held a transcription such as `"/θ/ as in /θriː/"` (it counts every `/.../` symbol); keep `ipa` to the sounds introduced.
- **arrange-question** builds a question only from a positive subject definition (pronoun, determiner, name, bank noun/adjective, number, `and`, place phrase). A subject with a word the bank does not know (an unknown noun, `parents` when only `parent` exists is fine) gets no demand, so a missing bank entry makes the rule silent, not wrong.
- **sound-words** normalises ASCII g, ʧ, ʤ, ɹ and lets `/ɑ/ /ɔ/ /ɜ/` match the long vowel of the bank; `/i/` and `/u/` are NOT matched with `iː` / `uː` (different sounds).
- **cast-consistency** strips `Name:` labels and attributes a labelled line's `I am N` to the speaker. Found Tom (10 vs 40) and Ann (30 vs 20) in week 2; the day-11 boy is now Max and Ann is twenty on day 11.
