// What each side of a card shows, for each direction: ONE table. Components render from it and never look at the
// direction (docs/plans/vocab-review-plan.md 2.6, rule 24). Adding a direction without a face is a compile error.
import { DIRECTION_LABEL_TH, type ReviewDirection } from "@/lib/srs/contract";

/** word: the English word (lang="en"); ipa: its pronunciation; audio: ฟัง / ฟังช้า (plays the word); th: the Thai meaning; example: the first example (en + th); divider: a hairline. */
export type FaceItemKind = "word" | "ipa" | "audio" | "th" | "example" | "divider";
export type FaceItem = { kind: FaceItemKind; size: "lg" | "md" | "sm" };

export type CardFace = {
  /** Under the header: which way this card is asked. */
  label: string;
  front: readonly FaceItem[];
  back: readonly FaceItem[];
  /** Under the card on the front. */
  hint: string;
  /** The one button on the front. */
  reveal: string;
};

export const CARD_FACES: Record<ReviewDirection, CardFace> = {
  // screens 23-24
  en_th: {
    label: DIRECTION_LABEL_TH.en_th,
    front: [{ kind: "word", size: "lg" }, { kind: "ipa", size: "md" }, { kind: "audio", size: "md" }],
    back: [{ kind: "word", size: "md" }, { kind: "ipa", size: "sm" }, { kind: "divider", size: "md" }, { kind: "th", size: "md" }, { kind: "example", size: "md" }],
    hint: "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู",
    reveal: "ดูความหมาย",
  },
  // the mirror: the front must not give the answer away, so no word, no IPA, no audio, no example
  th_en: {
    label: DIRECTION_LABEL_TH.th_en,
    front: [{ kind: "th", size: "lg" }],
    back: [{ kind: "th", size: "sm" }, { kind: "divider", size: "md" }, { kind: "word", size: "lg" }, { kind: "ipa", size: "md" }, { kind: "audio", size: "md" }, { kind: "example", size: "md" }],
    hint: "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู",
    reveal: "ดูคำศัพท์",
  },
};
