"use client";
// One side of a card, drawn from CARD_FACES (faces.ts). It never looks at the direction.
import type { ReactNode } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { CARD_FACES, type FaceItem, type FaceItemKind } from "./faces";
import type { ReviewItem } from "./session-state";

const WORD_SIZE = { lg: "text-[34px]", md: "text-[26px]", sm: "text-[20px]" } as const;
const TH_SIZE = { lg: "text-[28px]", md: "text-2xl", sm: "text-lg" } as const;
const IPA_SIZE = { lg: "text-lg", md: "text-[15px]", sm: "text-[13px]" } as const;

/** Mounted only when the side has audio buttons: `useExerciseAudio` (which asks the source and may play) must not run on a side that hides the word. */
function AudioRow({ word }: { word: string }) {
  const audio = useExerciseAudio(word);
  return (
    <div className="flex flex-col items-center gap-2">
      <PlayButtons audio={audio} text={word} />
      <AudioFallback audio={audio} />
    </div>
  );
}

const RENDER: Record<FaceItemKind, (item: ReviewItem, size: FaceItem["size"]) => ReactNode> = {
  word: (c, size) => <p lang="en" className={`break-words font-bold leading-snug ${WORD_SIZE[size]}`}>{c.word}</p>,
  ipa: (c, size) => (c.ipa ? <p lang="en-fonipa" className={`text-muted ${IPA_SIZE[size]}`}>{c.ipa}</p> : null),
  audio: (c) => <AudioRow word={c.word} />,
  th: (c, size) => <p className={`break-words font-bold leading-snug ${TH_SIZE[size]}`}>{c.th}</p>,
  example: (c) =>
    c.example ? (
      <div className="flex flex-col items-center gap-0.5">
        <p lang="en" className="text-sm">{c.example.en}</p>
        <p className="text-xs text-muted">{c.example.th}</p>
      </div>
    ) : null,
  divider: () => <hr className="my-1 w-full border-line" />,
};

export function ReviewCard({ item, side }: { item: ReviewItem; side: "front" | "back" }) {
  const face = CARD_FACES[item.direction];
  const items = face[side];
  const front = side === "front";
  return (
    <div
      data-side={side}
      className={`flex flex-col items-center rounded-[20px] border border-line bg-card px-5 text-center ${front ? "gap-3 py-14" : "gap-2.5 py-6"}`}
    >
      {items.map((it, i) => <div key={`${it.kind}-${i}`} className="flex w-full flex-col items-center">{RENDER[it.kind](item, it.size)}</div>)}
    </div>
  );
}
