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
    hr0 = row(head, "Title row", mainAlign="spaceBetween")
    text(hr0, "English Zero to Hero", 24, c["text"], EN, "Bold", letterSpacing=-0.3)
    gear = frame(hr0, "Settings button", layout="horizontal", mainAlign="center", crossAlign="center", w=36, h=36,
                 sizingH="fixed", sizingV="fixed", cornerRadius=18, fill=c["surface"], stroke=c["border"], strokeWeight=1)
    text(gear, "⚙", 16, c["muted"], IPA, "Regular")
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
    navbar(s, c, "วันนี้")
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

def settings(x, c, label, selected):
    s = screen("Settings / Theme", x, c, label)
    top = col(s, "Top", gap=0)
    head = row(top, "Header", gap=12, pad=[20, 20, 12, 20])
    text(head, "←", 18, c["muted"], EN, "Regular")
    text(head, "ตั้งค่า", 20, c["text"], TH, "Bold")
    body = col(top, "Body", gap=22, pad=[8, 20, 0, 20])
    sec = col(body, "Theme section", gap=10)
    text(sec, "ธีม", 13, c["muted"], TH, "Medium")
    seg = row(sec, "Segmented", gap=4, pad=4, fill=c["surface2"], cornerRadius=12, stroke=c["border"], strokeWeight=1)
    for lab in ["สว่าง", "มืด", "ตามเครื่อง"]:
        on = lab == selected
        b = frame(seg, f"Segment / {lab}", layout="horizontal", mainAlign="center", crossAlign="center",
                  padding=[10, 8, 10, 8], sizingH="fill", sizingV="hug", cornerRadius=9,
                  fill=c["accent"] if on else "none")
        text(b, lab, 14, c["accentText"] if on else c["text"], TH, "Medium")
    text(sec, "ตามเครื่อง: เปลี่ยนสว่างหรือมืดตามการตั้งค่าของมือถือหรือคอมโดยอัตโนมัติ", 12, c["faint"], TH, "Regular",
         sizingH="fill", textAutoResize="height", lineHeight="150%")
    lst = col(body, "Other settings", gap=0, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, clip=True)
    rows = [("สำเนียงเสียงอ่าน", "อเมริกัน"), ("ความเร็วเสียงเริ่มต้น", "ปกติ"), ("เตือนให้ฝึก", "20:00")]
    for i, (k, v) in enumerate(rows):
        r = row(lst, f"Row / {k}", pad=[14, 16, 14, 16], mainAlign="spaceBetween")
        text(r, k, 14, c["text"], TH, "Regular")
        text(r, v + "  ›", 14, c["muted"], TH, "Regular")
        if i < len(rows) - 1:
            frame(lst, "Divider", h=1, sizingH="fill", sizingV="fixed", fill=c["border"], layout="horizontal")
    foot = col(s, "Footer", pad=[0, 20, 24, 20])
    text(foot, "ธีมจำไว้ในอุปกรณ์นี้ แต่ละเครื่องตั้งต่างกันได้", 12, c["faint"], TH, "Regular", textAlign="center", sizingH="fill")
    return s

def navbar(parent, c, active):
    bar = row(parent, "Tab bar", gap=0, pad=[8, 12, 20, 12], fill=c["surface"], stroke=c["border"], strokeWeight=1,
              strokeSides=[True, False, False, False])
    for icon, lab in [("⌂", "วันนี้"), ("↻", "ฝึกเพิ่ม"), ("◔", "พัฒนาการ")]:
        on = lab == active
        t = col(bar, f"Tab / {lab}", gap=2, pad=[6, 0, 6, 0], crossAlign="center")
        text(t, icon, 18, c["accent"] if on else c["faint"], IPA, "Regular")
        text(t, lab, 11, c["accent"] if on else c["muted"], TH, "Medium")
    return bar

def section_title(parent, c, title, right=None):
    r = row(parent, f"Section / {title}", mainAlign="spaceBetween")
    text(r, title, 13, c["muted"], TH, "Medium")
    if right: text(r, right, 12, c["accent"], TH, "Medium")
    return r

def chip(parent, c, lab, on=False, font=TH):
    b = frame(parent, f"Chip / {lab}", layout="horizontal", crossAlign="center", padding=[8, 13, 8, 13],
              sizingH="hug", sizingV="hug", cornerRadius=999,
              fill=c["accentSoft"] if on else c["surface"], stroke=c["accent"] if on else c["border"], strokeWeight=1)
    text(b, lab, 13, c["accent"] if on else c["text"], font, "Medium")
    return b

def practice(x, c, label):
    s = screen("Practice hub", x, c, label)
    top = col(s, "Top", gap=0)
    head = col(top, "Header", gap=4, pad=[24, 20, 8, 20])
    text(head, "ฝึกเพิ่ม", 22, c["text"], TH, "Bold")
    text(head, "ฝึกได้ไม่จำกัด ไม่กระทบคะแนนบทเรียนประจำวัน", 13, c["muted"], TH, "Regular")
    body = col(top, "Body", gap=18, pad=[10, 20, 0, 20])
    due = row(body, "Vocab review", gap=12, pad=14, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, mainAlign="spaceBetween")
    dl = col(due, "Text", gap=2)
    text(dl, "ทวนคำศัพท์", 15, c["text"], TH, "Bold")
    text(dl, "ถึงกำหนด 12 คำ · ประมาณ 4 นาที", 12, c["muted"], TH, "Regular")
    go = frame(due, "Go", layout="horizontal", crossAlign="center", padding=[9, 16, 9, 16], sizingH="hug", sizingV="hug",
               cornerRadius=10, fill=c["accent"])
    text(go, "เริ่ม", 13, c["accentText"], TH, "Medium")
    sec = col(body, "Weak points", gap=8)
    section_title(sec, c, "แนะนำสำหรับคุณ", "ดูทั้งหมด")
    for t, d, st, colr in [("เสียง /æ/ กับ /ʌ/", "ผิด 42% ใน 14 วัน", "ยังไม่เริ่ม", c["bad"]), ("เขียนตามคำบอก", "ผิด 33% · ผ่านทดสอบแล้ว 1 ครั้ง", "รอทดสอบซ้ำ", c["tip"])]:
        r = row(sec, f"Weak / {t}", gap=10, pad=[12, 14, 12, 14], fill=c["surface"], cornerRadius=12, stroke=c["border"], strokeWeight=1, mainAlign="spaceBetween")
        l = col(r, "Text", gap=2)
        text(l, t, 14, c["text"], TH, "Medium")
        text(l, d, 12, c["muted"], TH, "Regular")
        text(r, st, 12, colr, TH, "Medium")
    sec2 = col(body, "Pick your own", gap=8)
    section_title(sec2, c, "เลือกฝึกเอง")
    w1 = frame(sec2, "Skill chips", layout="horizontal", wrap=True, gap=8, crossGap=8, sizingH="fill", sizingV="hug", fill="none")
    for i, lab in enumerate(["ออกเสียง", "ฟัง", "พูด", "อ่าน", "เขียน", "คำศัพท์"]):
        chip(w1, c, lab, on=(i == 1))
    w2 = frame(sec2, "Topic chips", layout="horizontal", wrap=True, gap=8, crossGap=8, sizingH="fill", sizingV="hug", fill="none")
    for i, lab in enumerate(["ทักทาย", "ตัวอักษร A–Z", "เสียง /e/", "เสียง /ɪ/", "ประเทศและเมือง"]):
        chip(w2, c, lab, on=(i == 0))
    r = row(sec2, "Start custom", gap=10, mainAlign="spaceBetween")
    text(r, "ฟัง · ทักทาย · 10 ข้อ", 13, c["muted"], TH, "Regular")
    go2 = frame(r, "Go", layout="horizontal", crossAlign="center", padding=[9, 16, 9, 16], sizingH="hug", sizingV="hug",
                cornerRadius=10, fill=c["surface2"], stroke=c["border"], strokeWeight=1)
    text(go2, "เริ่มฝึก", 13, c["text"], TH, "Medium")
    sec3 = row(body, "Replay", gap=10, pad=[12, 14, 12, 14], fill=c["surface"], cornerRadius=12, stroke=c["border"], strokeWeight=1, mainAlign="spaceBetween")
    text(sec3, "เล่นบทที่เรียนแล้วซ้ำ", 14, c["text"], TH, "Medium")
    text(sec3, "วันที่ 1–7  ›", 13, c["muted"], TH, "Regular")
    navbar(s, c, "ฝึกเพิ่ม")
    return s

def progress_screen(x, c, label):
    s = screen("Progress", x, c, label)
    top = col(s, "Top", gap=0)
    head = col(top, "Header", gap=4, pad=[24, 20, 8, 20])
    text(head, "พัฒนาการ", 22, c["text"], TH, "Bold")
    body = col(top, "Body", gap=14, pad=[8, 20, 0, 20])
    lvl = col(body, "Level card", gap=12, pad=16, fill=c["surface"], cornerRadius=16, stroke=c["border"], strokeWeight=1)
    lr = row(lvl, "Level row", mainAlign="spaceBetween", crossAlign="max")
    ll = col(lr, "Level", gap=2, sizingH="hug")
    text(ll, "ระดับโดยประมาณ", 12, c["muted"], TH, "Medium")
    text(ll, "Pre-A1", 28, c["text"], EN, "Bold")
    text(lr, "ไป A1 อีก 88%", 12, c["muted"], TH, "Regular")
    tr = frame(lvl, "Level track", h=6, layout="horizontal", sizingH="fill", sizingV="fixed", fill=c["track"], cornerRadius=3, clip=True)
    frame(tr, "Level fill", w=36, h=6, fill=c["accent"], cornerRadius=3)
    text(lvl, "A1 ต้องผ่านสอบวันที่ 60 และรู้จริง 400 คำ", 12, c["faint"], TH, "Regular", sizingH="fill", textAutoResize="height")
    grid = row(body, "Plan", gap=12, crossAlign="min")
    for big, small, colr in [("วันที่ 7", "จาก 365 · ทันแผน", c["ok"]), ("7 วัน", "สตรีค · นานสุด 7", c["muted"])]:
        st = col(grid, f"Stat / {small}", gap=4, pad=14, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
        text(st, big, 20, c["text"], TH, "Bold")
        text(st, small, 12, colr, TH, "Regular")
    voc = col(body, "Vocabulary", gap=10, pad=16, fill=c["surface"], cornerRadius=16, stroke=c["border"], strokeWeight=1)
    vr = row(voc, "Vocab head", mainAlign="spaceBetween", crossAlign="baseline")
    text(vr, "คำศัพท์ Oxford 3000", 14, c["text"], TH, "Bold")
    text(vr, "รู้จริง 9 / 3,000", 12, c["muted"], TH, "Regular")
    bar = frame(voc, "Stacked bar", h=10, layout="horizontal", sizingH="fill", sizingV="fixed", fill=c["track"], cornerRadius=5, clip=True, gap=2)
    for w_, colr in [(22, c["ok"]), (38, c["accent"]), (46, c["tip"])]:
        frame(bar, "Seg", w=w_, h=10, fill=colr)
    lg = row(voc, "Legend", gap=14, sizingH="hug")
    for lab, colr in [("รู้จริง 9", c["ok"]), ("จำได้ 14", c["accent"]), ("กำลังเรียน 13", c["tip"])]:
        it = row(lg, f"Legend / {lab}", gap=5, sizingH="hug")
        frame(it, "Dot", w=8, h=8, fill=colr, cornerRadius=4)
        text(it, lab, 11, c["muted"], TH, "Regular")
    wk = col(body, "Weak points", gap=0, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, clip=True)
    hd = row(wk, "Weak head", pad=[12, 16, 10, 16], mainAlign="spaceBetween")
    text(hd, "จุดอ่อนที่ต้องแก้", 14, c["text"], TH, "Bold")
    text(hd, "2 จุด", 12, c["muted"], TH, "Regular")
    for t, d, btn in [("เสียง /æ/ กับ /ʌ/", "ผิด 42%", "ฝึก"), ("เขียนตามคำบอก", "ผิด 33% · รอทดสอบซ้ำ", "ทดสอบ")]:
        frame(wk, "Divider", h=1, sizingH="fill", sizingV="fixed", fill=c["border"], layout="horizontal")
        r = row(wk, f"Weak / {t}", pad=[11, 16, 11, 16], mainAlign="spaceBetween")
        l = col(r, "Text", gap=2)
        text(l, t, 14, c["text"], TH, "Medium")
        text(l, d, 12, c["muted"], TH, "Regular")
        b = frame(r, "Action", layout="horizontal", crossAlign="center", padding=[7, 14, 7, 14], sizingH="hug", sizingV="hug",
                  cornerRadius=9, fill=c["surface2"], stroke=c["border"], strokeWeight=1)
        text(b, btn, 12, c["text"], TH, "Medium")
    navbar(s, c, "พัฒนาการ")
    return s

def home_body(s, c, with_gear, top_pad=56):
    body = col(s, "Body", gap=20, pad=[top_pad, 20, 20, 20])
    head = col(body, "Title", gap=6)
    hr0 = row(head, "Title row", mainAlign="spaceBetween")
    text(hr0, "English Zero to Hero", 22, c["text"], EN, "Bold", letterSpacing=-0.3)
    if with_gear:
        gear = frame(hr0, "Settings button", layout="horizontal", mainAlign="center", crossAlign="center", gap=6,
                     padding=[8, 12, 8, 12], sizingH="hug", sizingV="hug", cornerRadius=999, fill=c["surface"],
                     stroke=c["border"], strokeWeight=1)
        text(gear, "⚙", 14, c["muted"], IPA, "Regular")
        text(gear, "ตั้งค่า", 12, c["text"], TH, "Medium")
    text(head, "ฝึกภาษาอังกฤษวันละบท 365 วัน", 13, c["muted"])
    card = col(body, "Today card", gap=14, pad=18, fill=c["surface"], cornerRadius=16, stroke=c["border"], strokeWeight=1)
    r = row(card, "Day row", mainAlign="spaceBetween", crossAlign="max")
    left = col(r, "Day", gap=2, sizingH="hug")
    text(left, "บทเรียนวันนี้", 13, c["muted"], TH, "Medium")
    d = row(left, "Day number", gap=6, sizingH="hug", crossAlign="baseline")
    text(d, "วันที่ 2", 28, c["text"], TH, "Bold")
    text(d, "/ 365", 14, c["faint"], EN, "Regular")
    pill = frame(r, "Phase pill", layout="horizontal", padding=[5, 10, 5, 10], sizingH="hug", sizingV="hug",
                 cornerRadius=999, fill=c["accentSoft"])
    text(pill, "เฟส 1 · A1", 12, c["accent"], TH, "Medium")
    text(card, "How are you? และเสียงสระ /e/", 14, c["text"], TH, "Regular", sizingH="fill", textAutoResize="height")
    button(card, "เริ่มบทเรียนวันที่ 2", c)
    return body

def nav_pill(parent, c, active):
    wrap = col(parent, "Floating nav wrap", pad=[0, 20, 22, 20])
    bar = row(wrap, "Floating nav", gap=4, pad=6, fill=c["surface2"], cornerRadius=999, stroke=c["border"], strokeWeight=1,
              mainAlign="spaceBetween")
    for icon, lab in [("⌂", "วันนี้"), ("↻", "ฝึกเพิ่ม"), ("◔", "พัฒนาการ"), ("⚙", "ตั้งค่า")]:
        on = lab == active
        t = frame(bar, f"Item / {lab}", layout="horizontal", mainAlign="center", crossAlign="center", gap=6,
                  padding=[10, 14, 10, 14], sizingH="hug", sizingV="hug", cornerRadius=999,
                  fill=c["accent"] if on else "none")
        text(t, icon, 16, c["accentText"] if on else c["muted"], IPA, "Regular")
        if on: text(t, lab, 13, c["accentText"], TH, "Medium")
    return wrap

def nav_center(parent, c, active):
    bar = row(parent, "Nav with centre action", gap=0, pad=[8, 8, 18, 8], fill=c["surface"], stroke=c["border"], strokeWeight=1,
              strokeSides=[True, False, False, False], crossAlign="max")
    def item(icon, lab):
        on = lab == active
        t = col(bar, f"Tab / {lab}", gap=2, pad=[6, 0, 6, 0], crossAlign="center")
        text(t, icon, 17, c["accent"] if on else c["faint"], IPA, "Regular")
        text(t, lab, 10, c["accent"] if on else c["muted"], TH, "Medium")
    item("⌂", "วันนี้"); item("↻", "ฝึกเพิ่ม")
    mid = col(bar, "Centre", gap=4, pad=[0, 0, 4, 0], crossAlign="center")
    fab = frame(mid, "Start lesson", layout="horizontal", mainAlign="center", crossAlign="center", w=54, h=54,
                sizingH="fixed", sizingV="fixed", cornerRadius=27, fill=c["accent"])
    text(fab, "▶", 18, c["accentText"], IPA, "Regular")
    text(mid, "เรียนต่อ", 10, c["text"], TH, "Medium")
    item("◔", "พัฒนาการ"); item("⚙", "ตั้งค่า")
    return bar

def home_nav_variant(x, c, label, kind):
    s = screen(f"Home / nav {kind}", x, c, label)
    if kind == "hub":
        body = home_body(s, c, with_gear=False)
        grid = row(body, "Hub", gap=12, crossAlign="min")
        for icon, t, d in [("↻", "ฝึกเพิ่ม", "ทวนคำศัพท์ 12 คำ"), ("◔", "พัฒนาการ", "Pre-A1 · ทันแผน")]:
            cd = col(grid, f"Hub / {t}", gap=6, pad=16, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
            text(cd, icon, 20, c["accent"], IPA, "Regular")
            text(cd, t, 15, c["text"], TH, "Bold")
            text(cd, d, 12, c["muted"], TH, "Regular", sizingH="fill", textAutoResize="height")
        lst = col(body, "Menu list", gap=0, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1, clip=True)
        items = [("⚙", "ตั้งค่า", "ธีม · สำเนียง · เตือนให้ฝึก"), ("▤", "คลังคำศัพท์", "36 คำ")]
        for i, (icon, t, d) in enumerate(items):
            r = row(lst, f"Menu / {t}", gap=12, pad=[13, 16, 13, 16])
            text(r, icon, 16, c["muted"], IPA, "Regular")
            l = col(r, "Text", gap=1)
            text(l, t, 14, c["text"], TH, "Medium")
            text(l, d, 12, c["muted"], TH, "Regular")
            text(r, "›", 16, c["faint"], EN, "Regular")
            if i < len(items) - 1:
                frame(lst, "Divider", h=1, sizingH="fill", sizingV="fixed", fill=c["border"], layout="horizontal")
        col(s, "Bottom spacer", pad=[0, 0, 8, 0])
    else:
        body = home_body(s, c, with_gear=False)
        stats = row(body, "Stats", gap=12, crossAlign="min")
        for big, small in [("1 วัน", "สตรีคต่อเนื่อง"), ("36", "คำที่เรียนแล้ว"), ("94%", "คะแนนบทล่าสุด")]:
            st = col(stats, f"Stat / {small}", gap=4, pad=14, fill=c["surface"], cornerRadius=14, stroke=c["border"], strokeWeight=1)
            text(st, big, 18, c["text"], TH, "Bold")
            text(st, small, 11, c["muted"], TH, "Regular", sizingH="fill", textAutoResize="height")
        (nav_pill if kind == "pill" else nav_center)(s, c, "วันนี้")
    return s

GAP = 420
home(0 * GAP, DARK, "1 · หน้าแรก (มืด)")
phoneme(1 * GAP, DARK, "2 · แนะนำเสียง")
minimal_pair(2 * GAP, DARK, "3 · ฟังแยกเสียง หลังตรวจคำตอบ")
translate(3 * GAP, DARK, "4 · แปลประโยค กำลังพิมพ์")
completion(4 * GAP, DARK, "5 · จบบทเรียน")
home(5 * GAP + 60, LIGHT, "6 · หน้าแรก (สว่าง) สำหรับเทียบ")
minimal_pair(6 * GAP + 60, LIGHT, "7 · ฟังแยกเสียง (สว่าง)")
settings(7 * GAP + 120, DARK, "8 · ตั้งค่าธีม (เลือกมืด)", "มืด")
settings(8 * GAP + 120, LIGHT, "9 · ตั้งค่าธีม (เลือกสว่าง)", "สว่าง")
practice(9 * GAP + 180, DARK, "10 · ฝึกเพิ่ม (ไม่ใช่บทประจำวัน)")
progress_screen(10 * GAP + 180, DARK, "11 · พัฒนาการ")
home_nav_variant(11 * GAP + 300, DARK, "เมนูแบบ A · แถบลอยทรงแคปซูล (4 ปุ่ม รวมตั้งค่า)", "pill")
home_nav_variant(12 * GAP + 300, DARK, "เมนูแบบ B · ไม่มีแถบล่าง ใช้หน้าแรกเป็นศูนย์กลาง", "hub")
home_nav_variant(13 * GAP + 300, DARK, "เมนูแบบ C · ปุ่มเรียนต่ออยู่กลางแถบ", "center")

json.dump(steps, open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(steps), "steps")
