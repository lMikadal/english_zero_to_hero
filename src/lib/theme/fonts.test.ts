import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The fonts are self-hosted (Fontsource packages, see docs/ARCHITECTURE.md): the app must not contact a font CDN at
// build or run time, because it has to work offline and be built without a network dependency on Google.
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const globals = read("src/app/globals.css");
const fontsCss = read("src/app/fonts.css");

const EXTERNAL_FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|next\/font\/google/;
// any absolute URL or protocol-relative URL inside url(...)
const REMOTE_URL = /url\(\s*['"]?(?:https?:)?\/\//i;

describe("no external font host (self-hosted fonts only)", () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.(png|jpe?g|gif|webp|ico|woff2?|mp3|wav|ogg)$/i.test(e.name) ? [] : [p];
    });
  }
  const files = walk(path.join(root, "src")).filter((p) => !p.endsWith("fonts.test.ts"));

  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("flags a Google Fonts URL (self-test)", () => {
    expect(EXTERNAL_FONT_HOSTS.test("@import url(https://fonts.googleapis.com/css2?family=Inter)")).toBe(true);
    expect(EXTERNAL_FONT_HOSTS.test('import { Inter } from "next/font/google"')).toBe(true);
    expect(REMOTE_URL.test("src: url(https://example.com/a.woff2)")).toBe(true);
    expect(REMOTE_URL.test("src: url(@fontsource-variable/inter/files/a.woff2)")).toBe(false);
  });

  it("finds no font host anywhere in src/", () => {
    const hits = files.filter((f) => EXTERNAL_FONT_HOSTS.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });

  it("has no remote url() in the font CSS", () => {
    expect(REMOTE_URL.test(fontsCss)).toBe(false);
  });
});

describe("Thai line height", () => {
  // Noto Sans Thai has tall vowels and stacked tone marks: a line box under about 1.375 (leading-snug) clips or
  // crowds them. Only classes that make the line box shorter than that are banned (leading-snug/normal/relaxed are fine).
  const TIGHT = /\bleading-(?:none|tight|[3-6]|\[(?:0?\.\d+|1(?:\.[0-2]\d*)?|1\.3[0-4]\d*)\])(?![\w.-])/;
  it("flags short line-heights (self-test)", () => {
    for (const c of ["leading-none", "leading-tight", "leading-4", "leading-[1.2]", "leading-[1]"]) expect(TIGHT.test(c), c).toBe(true);
    for (const c of ["leading-snug", "leading-normal", "leading-relaxed", "leading-[3rem]", "leading-7", "leading-[1.375]"]) expect(TIGHT.test(c), c).toBe(false);
  });
  it("no component uses one", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) && TIGHT.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(root, p));
      }
    };
    walk(path.join(root, "src"));
    expect(hits).toEqual([]);
  });
});

describe("fonts.css", () => {
  const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const family = (b: string) => /font-family:\s*['"]([^'"]+)['"]/.exec(b)?.[1];

  it("declares faces for Thai, Inter (Latin) and Noto Sans (IPA)", () => {
    const names = new Set(faces.map(family));
    expect(names).toEqual(new Set(["Noto Sans Thai Variable", "Inter Variable", "Noto Sans Variable"]));
  });

  it("every face uses font-display: swap and a variable weight range", () => {
    for (const f of faces) {
      expect(f).toMatch(/font-display:\s*swap/);
      expect(f).toMatch(/font-weight:\s*\d+\s+\d+/);
      expect(f).toMatch(/unicode-range:/);
    }
  });

  it("every src points at a woff2 file that exists in an installed @fontsource-variable package", () => {
    const urls = [...fontsCss.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(faces.length);
    for (const u of urls) {
      expect(u).toMatch(/^@fontsource-variable\/[a-z-]+\/files\/[a-z0-9-]+\.woff2$/);
      expect(fs.existsSync(path.join(root, "node_modules", u)), u).toBe(true);
    }
  });

  it("the Thai face is listed before nothing else needs it: Thai range lives only in the Thai family", () => {
    const thai = faces.filter((f) => family(f) === "Noto Sans Thai Variable");
    expect(thai.length).toBe(1);
    expect(thai[0]).toMatch(/U\+0E01-0E5B/);
  });
});

describe("font tokens in globals.css", () => {
  it("defines --font-sans with Inter first, Noto Sans Thai next, then system fonts", () => {
    const sans = /--font-sans:\s*([^;]+);/.exec(globals)?.[1] ?? "";
    expect(sans.indexOf("Inter Variable")).toBeGreaterThanOrEqual(0);
    expect(sans.indexOf("Inter Variable")).toBeLessThan(sans.indexOf("Noto Sans Thai Variable"));
    expect(sans).toMatch(/system-ui|sans-serif/);
  });

  it("defines --font-ipa with Noto Sans first and applies it to lang=en-fonipa", () => {
    const ipa = /--font-ipa:\s*([^;]+);/.exec(globals)?.[1] ?? "";
    expect(ipa.trim().startsWith('"Noto Sans Variable"')).toBe(true);
    expect(globals).toMatch(/:lang\(en-fonipa\)\s*\{[^}]*font-family:\s*var\(--font-ipa\)/);
  });

  it("is loaded by the root layout", () => {
    expect(read("src/app/layout.tsx")).toMatch(/import\s+["']\.\/fonts\.css["']/);
  });
});

describe("IPA coverage", () => {
  // Every character used in an `ipa` field under content/ must be inside the unicode-range of a self-hosted face of
  // the IPA family (or of the Latin face it falls back to), otherwise the phone draws it with whatever system font it
  // has and one glyph looks different from the rest. θ (U+03B8) is Greek, not IPA Extensions, so it needs its own face.
  const ranges = (family: string) =>
    [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
      .map((m) => m[1])
      .filter((f) => f.includes(family))
      .flatMap((f) => (f.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "").split(","))
      .map((r) => r.trim().replace(/^U\+/i, ""))
      .filter(Boolean)
      .map((r) => {
        const [a, b] = r.split("-");
        return [parseInt(a, 16), parseInt(b ?? a, 16)] as const;
      });
  const covered = (cp: number, rs: readonly (readonly [number, number])[]) => rs.some(([a, b]) => cp >= a && cp <= b);

  const ipaStrings: string[] = [];
  // `ipa` is a string in lessons and `{ us, uk }` in the vocabulary files
  const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
  const collect = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (k === "ipa" ? ipaStrings.push(...strings(x)) : collect(x));
  };
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) collect(JSON.parse(fs.readFileSync(p, "utf8")));
    }
  };
  walk(path.join(root, "content"));

  it("finds IPA strings in the content", () => {
    expect(ipaStrings.length).toBeGreaterThan(20);
  });

  it("every IPA character in content is drawn by a self-hosted Noto Sans face", () => {
    const noto = ranges("Noto Sans Variable");
    const missing = new Set<string>();
    for (const s of ipaStrings) for (const ch of s) if (!covered(ch.codePointAt(0)!, noto)) missing.add(`${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
    expect([...missing].sort()).toEqual([]);
  });

  it("the check is not vacuous: a Cyrillic letter is not covered", () => {
    expect(covered("я".codePointAt(0)!, ranges("Noto Sans Variable"))).toBe(false);
  });
});
