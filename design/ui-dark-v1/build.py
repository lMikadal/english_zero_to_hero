#!/usr/bin/env python3
"""Generate a FigCraft script for the English Zero to Hero UI proposal (dark, clean, serious)."""
import json, sys

TH, EN, IPA = "Noto Sans Thai", "Inter", "Noto Sans"

DARK = dict(
    bg="#0E1116", surface="#161B22", surface2="#1D232C", border="#2A323D",
    text="#E8ECF1", muted="#97A1AF", faint="#6B7685",
    accent="#7C9CFF", accentText="#0B1020", accentSoft="#1B2440",
    ok="#4CC38A", okSoft="#12281F", okBorder="#1F5C43",
    bad="#F0717B", badSoft="#2B1619", badBorder="#6B2B32",
    tip="#D8B25A", tipSoft="#241E10", tipBorder="#4A3D1A",
    track="#232A34",
)
LIGHT = dict(
    bg="#F7F8FA", surface="#FFFFFF", surface2="#F0F2F5", border="#D9DEE5",
    text="#151A21", muted="#5B6573", faint="#8A94A3",
    accent="#3557D6", accentText="#FFFFFF", accentSoft="#E6ECFF",
    ok="#1F8A5B", okSoft="#E7F6EE", okBorder="#A9DBC2",
    bad="#C8323F", badSoft="#FCEBED", badBorder="#F0B5BB",
    tip="#8A6A12", tipSoft="#FBF4E0", tipBorder="#E9D9A6",
    track="#E3E7ED",
)

steps = []
_next = [2]

def _add(cmd, params):
    steps.append({"command": cmd, "params": params})
    i = _next[0]; _next[0] += 1
    return i

def frame(parent, name, w=None, h=None, x=0, y=0, **props):
    p = {"name": name, "x": x, "y": y, "select": False}
    if w is not None: p["width"] = w
    if h is not None: p["height"] = h
    if parent is not None: p["parent"] = parent
    if props: p["props"] = props
    return _add("frame.create", p)

def text(parent, s, size=14, color="#fff", font=TH, style="Regular", name=None, **props):
    pr = {"fontFamily": font, "fontStyle": style, "fontSize": size, "fill": color}
    pr.update(props)
    p = {"text": s, "x": 0, "y": 0, "parent": parent, "props": pr, "select": False}
    if name: p["name"] = name
    return _add("text.create", p)

def col(parent, name, gap=0, pad=0, **props):
    base = dict(layout="vertical", gap=gap, padding=pad, sizingH="fill", sizingV="hug", fill="none")
    base.update(props)
    return frame(parent, name, **base)

def row(parent, name, gap=0, pad=0, **props):
    base = dict(layout="horizontal", gap=gap, padding=pad, sizingH="fill", sizingV="hug", fill="none", crossAlign="center")
    base.update(props)
    return frame(parent, name, **base)

def screen(name, x, c, label):
    text(None, label, 13, "#8A94A3", TH, "Medium")
    steps[-1]["params"].pop("parent"); steps[-1]["params"].update(x=x, y=-34)
    return frame(None, name, 360, 760, x, 0, fill=c["bg"], layout="vertical", padding=0, gap=0,
                 mainAlign="spaceBetween", clip=True, cornerRadius=0)

def button(parent, label, c, kind="primary", font=TH, disabled=False):
    fill = {"primary": c["accent"], "secondary": "none", "quiet": c["surface2"]}[kind]
    color = {"primary": c["accentText"], "secondary": c["text"], "quiet": c["text"]}[kind]
    props = dict(layout="horizontal", mainAlign="center", crossAlign="center", padding=[14, 16, 14, 16],
                 sizingH="fill", sizingV="hug", cornerRadius=12, fill=fill)
    if kind == "secondary": props.update(stroke=c["border"], strokeWeight=1)
    if disabled: props.update(fill=c["surface2"]); color = c["faint"]
    b = frame(parent, f"Button / {label}", **props)
    text(b, label, 15, color, font, "Medium")
    return b

def progress(parent, c, title, pos, frac):
    top = col(parent, "Header", gap=10, pad=[16, 20, 12, 20])
    r = row(top, "Header row", mainAlign="spaceBetween")
    text(r, title, 13, c["muted"], TH, "Medium")
    text(r, pos, 13, c["muted"], TH, "Regular")
    track = frame(top, "Progress track", h=4, layout="horizontal", sizingH="fill", sizingV="fixed",
                  fill=c["track"], cornerRadius=2, clip=True)
    frame(track, "Progress fill", w=int(320 * frac), h=4, fill=c["accent"], cornerRadius=2)
    return top

def play_buttons(parent, c):
    r = row(parent, "Play", gap=8, sizingH="hug")
    for lab in ["▶  ฟัง", "ฟังช้า 0.75×"]:
        b = frame(r, f"Chip / {lab}", layout="horizontal", crossAlign="center", padding=[9, 14, 9, 14],
                  sizingH="hug", sizingV="hug", cornerRadius=999, fill=c["surface2"], stroke=c["border"], strokeWeight=1)
        text(b, lab, 13, c["text"], TH, "Medium")
    return r

def home(x, c, label):
    s = screen("Home", x, c, label)
    body = col(s, "Body", gap=24, pad=[56, 20, 20, 20])
    head = col(body, "Title", gap=6)
    text(head, "English Zero to Hero", 24, c["text"], EN, "Bold", letterSpacing=-0.3)
    text(head, "ฝึกภาษาอังกฤษวันละบท 365 วัน", 14, c["muted"])
    card = col(body, "Today card", gap=16, pad=20, fill=c["surface"], cornerRadius=16, stroke=c["border"], strokeWeight=1)
    r = row(card, "Day row", mainAlign="spaceBetween", crossAlign="max")
    left = col(r, "Day", gap=2, sizingH="hug")
    text(left, "บทเรียนวันนี้", 13, c["muted"], TH, "Medium")
    d = row(left, "Day number", gap=6, sizingH="hug", crossAlign="baseline")
    text(d, "วันที่ 2", 30, c["text"], TH, "Bold")
    text(d, "/ 365", 15, c["faint"], EN, "Regular")
    pill = frame(r, "Phase pill", layout="horizontal", padding=[5, 10, 5, 10], sizingH="hug", sizingV="hug",
                 cornerRadius=999, fill=c["accentSoft"])
    text(pill, "เฟส 1 · A1", 12, c["accent"], TH, "Medium")
    text(card, "How are you? และเสียงสระ /e/", 15, c["text"], TH, "Regular", sizingH="fill", textAutoResize="height")
    track = frame(card, "Course progress", h=6, layout="horizontal", sizingH="fill", sizingV="fixed",
                  fill=c["track"], cornerRadius=3, clip=True)
    frame(track, "Course fill", w=6, h=6, fill=c["accent"], cornerRadius=3)
    button(card, "เริ่มบทเรียนวันที่ 2", c)
    stats = row(body, "Stats", gap=12, crossAlign="min")
    for big, small in [("1 วัน", "สตรีคต่อเนื่อง"), ("36", "คำที่เรียนแล้ว"), ("94%", "คะแนนบทล่าสุด")]:
        st = col(stats, f"Stat / {small}", gap=4, pad=14, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
        text(st, big, 18, c["text"], TH, "Bold")
        text(st, small, 11, c["muted"], TH, "Regular", sizingH="fill", textAutoResize="height")
    done = row(body, "Done today", gap=8, pad=[12, 14, 12, 14], fill=c["okSoft"], cornerRadius=12, stroke=c["okBorder"], strokeWeight=1)
    text(done, "✓", 14, c["ok"], EN, "Bold")
    text(done, "วันนี้เรียนแล้ว เรียนบทถัดไปต่อได้เลย", 13, c["ok"], TH, "Medium")
    foot = col(s, "Footer", pad=[0, 20, 24, 20])
    text(foot, "ระดับโดยประมาณ Pre-A1 · ทันแผน", 12, c["faint"], TH, "Regular", textAlign="center", sizingH="fill")
    return s

def phoneme(x, c, label):
    s = screen("Exercise / Phoneme intro", x, c, label)
    top = col(s, "Top", gap=0)
    progress(top, c, "เสียง /æ/", "ข้อ 1 / 10", 0.1)
    body = col(top, "Body", gap=18, pad=[8, 20, 0, 20])
    text(body, "ฟังและสังเกตรูปปาก", 17, c["text"], TH, "Bold")
    hero = col(body, "Phoneme", gap=10, pad=[22, 16, 22, 16], fill=c["surface"], cornerRadius=16,
               stroke=c["border"], strokeWeight=1, crossAlign="center")
    text(hero, "/æ/", 48, c["text"], IPA, "Bold")
    play_buttons(hero, c)
    tip = row(body, "Tip", gap=10, pad=14, fill=c["tipSoft"], cornerRadius=12, stroke=c["tipBorder"], strokeWeight=1, crossAlign="min")
    text(tip, "อ้าปากกว้างกว่าเสียง 'แอ' ของไทย ลิ้นต่ำ มุมปากดึงไปด้านข้างเล็กน้อย", 13, c["tip"], TH, "Regular",
         sizingH="fill", textAutoResize="height", lineHeight="150%")
    lst = col(body, "Examples", gap=0, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, clip=True)
    words = ["cat", "bad", "man", "apple"]
    for i, w in enumerate(words):
        r = row(lst, f"Example / {w}", pad=[12, 14, 12, 16], mainAlign="spaceBetween")
        text(r, w, 17, c["text"], EN, "Medium")
        b = frame(r, "Play", layout="horizontal", crossAlign="center", padding=[7, 12, 7, 12], sizingH="hug",
                  sizingV="hug", cornerRadius=999, fill=c["surface2"])
        text(b, "▶  ฟัง", 12, c["text"], TH, "Medium")
        if i < len(words) - 1:
            frame(lst, "Divider", h=1, sizingH="fill", sizingV="fixed", fill=c["border"], layout="horizontal")
    bottom = col(s, "Bottom bar", gap=0, pad=[12, 20, 24, 20], fill=c["bg"])
    button(bottom, "ถัดไป", c)
    return s

def minimal_pair(x, c, label):
    s = screen("Exercise / Minimal pair (answered)", x, c, label)
    top = col(s, "Top", gap=0)
    progress(top, c, "เสียง /æ/", "ข้อ 2 / 10", 0.2)
    body = col(top, "Body", gap=12, pad=[8, 20, 0, 20])
    text(body, "ฟังแล้วเลือกคำที่ได้ยิน", 17, c["text"], TH, "Bold")
    pairs = [("bad", "bed", 0, 0), ("man", "men", 1, 1), ("cat", "cut", 0, 1)]
    for n, (a, b, ans, picked) in enumerate(pairs, 1):
        ok = ans == picked
        card = col(body, f"Pair {n}", gap=10, pad=12, fill=c["surface"], cornerRadius=14,
                   stroke=c["okBorder"] if ok else c["badBorder"], strokeWeight=1)
        hr = row(card, "Pair header", mainAlign="spaceBetween")
        hl = row(hr, "Pair title", gap=8, sizingH="hug")
        text(hl, f"คู่ที่ {n}", 12, c["muted"], TH, "Medium")
        for lab in ["▶  ฟัง", "ช้า 0.75×"]:
            chip = frame(hl, f"Chip / {lab}", layout="horizontal", crossAlign="center", padding=[5, 10, 5, 10],
                         sizingH="hug", sizingV="hug", cornerRadius=999, fill=c["surface2"], stroke=c["border"], strokeWeight=1)
            text(chip, lab, 11, c["text"], TH, "Medium")
        text(hr, "✓ ถูก" if ok else "✗ ผิด", 12, c["ok"] if ok else c["bad"], TH, "Medium")
        r = row(card, "Choices", gap=8)
        for i, w in enumerate([a, b]):
            is_ans, is_pick = i == ans, i == picked
            fill, stroke, col_ = c["surface2"], c["border"], c["text"]
            mark = ""
            if is_ans: fill, stroke, col_, mark = c["okSoft"], c["ok"], c["ok"], "  ✓"
            elif is_pick: fill, stroke, col_, mark = c["badSoft"], c["bad"], c["bad"], "  ✗"
            ch = frame(r, f"Choice / {w}", layout="horizontal", mainAlign="center", crossAlign="center",
                       padding=[11, 12, 11, 12], sizingH="fill", sizingV="hug", cornerRadius=10,
                       fill=fill, stroke=stroke, strokeWeight=1)
            text(ch, w + mark, 15, col_, EN, "Medium")
    bottom = col(s, "Bottom bar", gap=12, pad=[14, 20, 24, 20], fill=c["surface"], stroke=c["border"], strokeWeight=1,
                 strokeSides=[True, False, False, False])
    fb = col(bottom, "Feedback", gap=4)
    text(fb, "ยังไม่ถูก 1 คู่", 15, c["bad"], TH, "Bold")
    fr = row(fb, "Answer line", gap=6, sizingH="hug", crossAlign="baseline")
    text(fr, "คำตอบที่ถูก:", 13, c["muted"], TH, "Regular")
    text(fr, "bad · men · cat", 14, c["text"], EN, "Medium")
    text(fb, "ข้อนี้จะกลับมาให้ลองอีกครั้งท้ายบท", 12, c["faint"], TH, "Regular")
    button(bottom, "ถัดไป", c)
    return s

def translate(x, c, label):
    s = screen("Exercise / Translate (typing)", x, c, label)
    top = col(s, "Top", gap=0)
    progress(top, c, "เขียนประโยคแรก", "ข้อ 10 / 10", 1.0)
    body = col(top, "Body", gap=16, pad=[8, 20, 0, 20])
    text(body, "แปลเป็นภาษาอังกฤษ", 17, c["text"], TH, "Bold")
    q = col(body, "Prompt", gap=6, pad=16, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
    text(q, "ภาษาไทย", 11, c["faint"], TH, "Medium")
    text(q, "ยินดีที่ได้รู้จัก", 20, c["text"], TH, "Medium")
    inp = row(body, "Input", pad=[14, 14, 14, 14], fill=c["surface2"], cornerRadius=12, stroke=c["accent"], strokeWeight=2)
    text(inp, "Nice to meet you", 16, c["text"], EN, "Regular")
    frame(inp, "Caret", w=2, h=20, fill=c["accent"])
    text(body, "ไม่ต้องสนตัวพิมพ์ใหญ่เล็กและเครื่องหมายวรรคตอน", 12, c["faint"], TH, "Regular",
         sizingH="fill", textAutoResize="height")
    bottom = col(s, "Bottom bar", gap=0, pad=[12, 20, 24, 20], fill=c["bg"])
    button(bottom, "ตรวจคำตอบ", c)
    return s

def completion(x, c, label):
    s = screen("Lesson complete", x, c, label)
    body = col(s, "Body", gap=22, pad=[64, 20, 20, 20])
    head = col(body, "Head", gap=8)
    badge = frame(head, "Badge", layout="horizontal", mainAlign="center", crossAlign="center", w=44, h=44,
                  sizingH="fixed", sizingV="fixed", cornerRadius=22, fill=c["okSoft"], stroke=c["okBorder"], strokeWeight=1)
    text(badge, "✓", 20, c["ok"], EN, "Bold")
    text(head, "จบบทเรียนวันที่ 1", 24, c["text"], TH, "Bold")
    text(head, "Hello! และเสียงสระสั้น /æ/", 14, c["muted"], TH, "Regular")
    grid = row(body, "Result", gap=12, crossAlign="min")
    for big, small in [("94%", "คะแนนบทเรียน"), ("1 วัน", "สตรีคต่อเนื่อง")]:
        st = col(grid, f"Result / {small}", gap=4, pad=16, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
        text(st, big, 26, c["text"], TH, "Bold")
        text(st, small, 12, c["muted"], TH, "Regular")
    lst = col(body, "Summary", gap=0, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, clip=True)
    rows = [("คำใหม่วันนี้", "5 คำ", c["text"]), ("ตอบถูกครั้งแรก", "5 จาก 6 ข้อ", c["text"]),
            ("ควรฝึกเพิ่ม", "เสียง /æ/ กับ /ʌ/", c["tip"]), ("ตามแผน 365 วัน", "ทันแผน", c["ok"])]
    for i, (k, v, colr) in enumerate(rows):
        r = row(lst, f"Row / {k}", pad=[13, 16, 13, 16], mainAlign="spaceBetween")
        text(r, k, 14, c["muted"], TH, "Regular")
        text(r, v, 14, colr, TH, "Medium")
        if i < len(rows) - 1:
            frame(lst, "Divider", h=1, sizingH="fill", sizingV="fixed", fill=c["border"], layout="horizontal")
    bottom = col(s, "Bottom bar", gap=10, pad=[12, 20, 24, 20])
    button(bottom, "ไปบทเรียนวันที่ 2", c)
    button(bottom, "กลับหน้าแรก", c, "secondary")
    return s

GAP = 420
home(0 * GAP, DARK, "1 · หน้าแรก (มืด)")
phoneme(1 * GAP, DARK, "2 · แนะนำเสียง")
minimal_pair(2 * GAP, DARK, "3 · ฟังแยกเสียง หลังตรวจคำตอบ")
translate(3 * GAP, DARK, "4 · แปลประโยค กำลังพิมพ์")
completion(4 * GAP, DARK, "5 · จบบทเรียน")
home(5 * GAP + 60, LIGHT, "6 · หน้าแรก (สว่าง) สำหรับเทียบ")
minimal_pair(6 * GAP + 60, LIGHT, "7 · ฟังแยกเสียง (สว่าง)")

json.dump(steps, open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(steps), "steps")
