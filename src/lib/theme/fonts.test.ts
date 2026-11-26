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
