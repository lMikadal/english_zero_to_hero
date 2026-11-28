// @vitest-environment node
// Precision of rule "thai-names": ordinary A1 Thai instructions and questions, run with EVERY listed name "present", must
// produce no report (a 3-4 letter name is within two edits of dozens of everyday words, so the rule only reports a candidate
// that is NOT a known Thai word, and only at one edit for names of fewer than 5 letters).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "../loader";
import { THAI_NAMES } from "./allowlists";
import { buildContext } from "./context";
import { isKnownThaiWord, thaiNameMismatches } from "./thai-names";

const ctx = buildContext(readContent(path.resolve(import.meta.dirname, "../../../../content")));
const isWord = isKnownThaiWord(ctx);
const reports = (text: string) => thaiNameMismatches(text, THAI_NAMES, THAI_NAMES, isWord).map((m) => `${m.found} ~ ${m.name}`);

/** Every incident string the review found (each was reported as a misspelled name), as realistic instruction sentences. */
const REVIEW_INCIDENTS = [
  "ตอบว่าแดง", "ถามว่าแดงหรือเขียว", "กระเป๋าของแดงอยู่ที่ไหน", "ตอบว่าแดดจัด", "ตอบว่าดินอยู่ที่ไหน", "เจ็ดกับแปด", "ตอบว่าแปดหรือเจ็ด", "ตอบว่าเป็น",
  "อ่านแล้วตอบว่าจริงหรือไม่", "ถามว่าเคยไปไหม", "ว่าเทาหรือขาว", "ว่าแม่อยู่ไหน", "ว่าทองหรือเงิน", "ว่าเรียนที่ไหน", "มาลัยอยู่ที่ไหน", "ตอบว่าแอบ",
  "ตอบว่าแซง", "ตอบว่าโรงเรียนอยู่ที่ไหน", "ตอบว่าเบาะ", "ตอบว่าจิ้ม", "ตอบว่าเป็นอะไร",
];
const A1_SENTENCES = [
  // colours
  "กระเป๋าสีอะไร", "ร่มสีอะไร", "ประตูสีเขียวหรือสีแดง", "รถของเธอสีอะไร", "นาฬิกาสีอะไร", "อะไรเป็นสีส้ม", "กระเป๋าสีเทาราคาเท่าไร", "กระเป๋าใบที่ถูกกว่าสีอะไร",
  "ผนังสีอะไร", "หมวกสีชมพูอยู่ที่ไหน", "เสื้อสีฟ้าหรือสีขาว", "แมวสีดำหรือสีน้ำตาล",
  // numbers, age, money
  "อายุเท่าไร", "เธออายุเท่าไร", "พี่ชายอายุเท่าไร", "ราคาเท่าไร", "ปากกาด้ามนี้ราคากี่บาท", "ตอบว่าเลขเจ็ดหรือเลขแปด", "ระวัง forty กับ fourteen", "ระวัง ninety กับ nineteen",
  "มีเก้าอี้กี่ตัว", "มีกี่คน", "นับเลขหนึ่งถึงสิบ", "เลขสิบแปดอ่านว่าอะไร",
  // family
  "ใครเป็นพ่อ", "พ่อกับแม่อยู่ที่ไหน", "แม่ของเธอเป็นครู", "ลุงกับป้าอาศัยอยู่ที่ไหน", "น้องชายของเธออายุเท่าไร", "ใครเป็นทารก", "ใครเป็นเพื่อนของเธอ", "ปู่กับย่าอยู่บ้านหลังใหญ่",
  // true / false and instructions
  "อ่านแล้วตอบคำถามว่าจริงหรือไม่จริง", "ตอบว่าใช่หรือไม่ใช่", "เลือกคำตอบที่ถูกต้อง", "เติมคำที่หายไป", "เรียงคำให้เป็นประโยค", "ฟังแล้วพิมพ์ตาม", "ฟังแล้วพูดตาม",
  "พูดตามทันทีทีละประโยค", "ฟังแล้วตอบว่าใครอายุเท่าไร", "เลือกว่าเป็นจริงหรือเท็จ",
  // where / who / how
  "อยู่ที่ไหน", "ใครอยู่ที่นั่น", "เขามาจากที่ไหน", "เธอเป็นใคร", "เขาทำงานอะไร", "ทำไมเธอถึงมีความสุข", "เธอเรียนที่ไหน", "ไปโรงเรียนอย่างไร", "ทองคำราคาเท่าไร",
  "ตอบว่าที่ไหน", "ตอบว่าอะไร", "ตอบว่ากี่โมง", "พวกเขาอยู่ที่ไหน", "ลูกบอลอยู่ใต้เตียง", "เตียงอยู่ที่ไหน", "หนังสืออยู่บนโต๊ะ", "ร่มอยู่บนพื้น",
  // food and things
  "อาหารเช้ากินอะไร", "ชาร้อนหรือชาเย็น", "แอปเปิลลูกนี้ราคาเท่าไร", "เธอชอบอะไร", "เขามีสุนัขกี่ตัว", "เขาเคยไปญี่ปุ่นไหม", "เธอเคยเรียนภาษาอังกฤษไหม",
  "โรงแรมอยู่ที่ไหน", "โรงพยาบาลอยู่ใกล้ไหม", "เขาเป็นหมอหรือครู", "เขาเป็นนักเรียนไหม", "เธอแต่งงานแล้วไหม", "เด็กชายคนนั้นเป็นใคร", "วันนี้อากาศเป็นอย่างไร",
];

describe("thai-names precision: everyday Thai stays quiet with every name present", () => {
  it.each(REVIEW_INCIDENTS)("%s", (t) => expect(reports(t)).toEqual([]));
  it(`${A1_SENTENCES.length} A1-style instruction and question sentences produce no report`, () => {
    expect(A1_SENTENCES.length).toBeGreaterThanOrEqual(60);
    const noisy = A1_SENTENCES.flatMap((t) => reports(t).map((r) => `${t}: ${r}`));
    expect(noisy).toEqual([]);
  });
  it("real misspellings are still reported", () => {
    expect(reports("ตอบว่าเคธอยู่ที่ไหน")).toEqual(["เคธ ~ Kate"]);
    expect(reports("ลูกบอลของลีโอวอยู่ที่ไหน")).toEqual(["ลีโอว ~ Leo"]);
    expect(reports("กระเป๋าของนันสีอะไร")).toEqual(["นัน ~ Nan"]);
  });
});
