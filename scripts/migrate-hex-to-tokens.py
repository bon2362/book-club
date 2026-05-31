#!/usr/bin/env python3
"""
Заменяет сырые hex-цвета в .tsx компонентах на CSS-переменные дизайн-системы.
Различает контекст: color: vs background: vs border/borderColor и т.д.

Запуск:
  python3 scripts/migrate-hex-to-tokens.py [--dry-run]
"""
import re, sys
from pathlib import Path

DRY_RUN = '--dry-run' in sys.argv

# ── Прямые замены (контекст заложен в паттерне) ──────────────────────────────
# Порядок важен: более специфичные паттерны — раньше.

DIRECT = [
    # ── color: ----------------------------------------------------------------
    # статус-светофор
    (r"color:\s*'#22[Cc]55[Ee]'",  "color: 'var(--status-ok)'"),
    (r"color:\s*'#16[Aa]34[Aa]'",  "color: 'var(--status-ok-hover)'"),
    (r"color:\s*'#[Ee][Ff]4444'",  "color: 'var(--status-fail)'"),
    (r"color:\s*'#[Ff]59[Ee]0[Bb]'","color: 'var(--status-warn)'"),
    (r'color:\s*"#22[Cc]55[Ee]"',  'color: "var(--status-ok)"'),
    (r'color:\s*"#16[Aa]34[Aa]"',  'color: "var(--status-ok-hover)"'),
    (r'color:\s*"#[Ee][Ff]4444"',  'color: "var(--status-fail)"'),
    (r'color:\s*"#[Ff]59[Ee]0[Bb]"','color: "var(--status-warn)"'),
    # акцент / ошибки в формах
    (r"color:\s*'#[Cc]0603[Aa]'",  "color: 'var(--accent)'"),
    (r"color:\s*'#[Cc]00'",         "color: 'var(--accent)'"),
    (r'color:\s*"#[Cc]0603[Aa]"',  'color: "var(--accent)"'),
    (r'color:\s*"#[Cc]00"',         'color: "var(--accent)"'),
    # success
    (r"color:\s*'#2[Dd]6[Aa]4[Ff]'","color: 'var(--success)'"),
    (r'color:\s*"#2[Dd]6[Aa]4[Ff]"','color: "var(--success)"'),
    # text-muted
    (r"color:\s*'#(999|999999|9ca3af|aaa|AAA|888|BBB|bbb)'",  "color: 'var(--text-muted)'"),
    (r'color:\s*"#(999|999999|9ca3af|aaa|AAA|888|BBB|bbb)"',  'color: "var(--text-muted)"'),
    # text-secondary
    (r"color:\s*'#(666|666666|555|777|444)'",  "color: 'var(--text-secondary)'"),
    (r'color:\s*"#(666|666666|555|777|444)"',  'color: "var(--text-secondary)"'),
    # text-body
    (r"color:\s*'#(333|333333)'",  "color: 'var(--text-body)'"),
    (r'color:\s*"#(333|333333)"',  'color: "var(--text-body)"'),
    # text (primary)
    (r"color:\s*'#(111|111111)'",  "color: 'var(--text)'"),
    (r'color:\s*"#(111|111111)"',  'color: "var(--text)"'),
    # white text on dark bg → var(--bg)  (button text, avatar text)
    (r"color:\s*'#([Ff]{3}|[Ff]{6})'",  "color: 'var(--bg)'"),
    (r'color:\s*"#([Ff]{3}|[Ff]{6})"',  'color: "var(--bg)"'),

    # ── background: -----------------------------------------------------------
    # статус-светофор (не ожидается, но на всякий)
    (r"background:\s*'#22[Cc]55[Ee]'",  "background: 'var(--status-ok)'"),
    (r"background:\s*'#[Ee][Ff]4444'",  "background: 'var(--status-fail)'"),
    # кнопка fill = var(--text)
    (r"background:\s*'#(111|111111)'",  "background: 'var(--text)'"),
    (r'background:\s*"#(111|111111)"',  'background: "var(--text)"'),
    # disabled / muted fills
    (r"background:\s*'#(666|666666)'",  "background: 'var(--text-secondary)'"),
    (r"background:\s*'#(999|999999)'",  "background: 'var(--text-muted)'"),
    (r"background:\s*'#[Ee]5[Ee]5[Ee]5'", "background: 'var(--border)'"),
    (r'background:\s*"#[Ee]5[Ee]5[Ee]5"', 'background: "var(--border)"'),
    # elevated / subtle
    (r"background:\s*'#([Ff][Aa][Ff][Aa][Ff][Aa]|[Ff][Aa][Ff][Aa]|[Ff]5[Ff]5[Ff]5|[Ff]0[Ff]0[Ff]0)'",
     "background: 'var(--bg-elevated)'"),
    (r'background:\s*"#([Ff][Aa][Ff][Aa][Ff][Aa]|[Ff][Aa][Ff][Aa]|[Ff]5[Ff]5[Ff]5|[Ff]0[Ff]0[Ff]0)"',
     'background: "var(--bg-elevated)"'),
    # accent
    (r"background:\s*'#[Cc]0603[Aa]'",  "background: 'var(--accent)'"),
    (r"background:\s*'#[Cc]00'",         "background: 'var(--accent)'"),
    (r'background:\s*"#[Cc]0603[Aa]"',  'background: "var(--accent)"'),
    # success
    (r"background:\s*'#2[Dd]6[Aa]4[Ff]'","background: 'var(--success)'"),
    # white panel/card → var(--bg-input)
    (r"background:\s*'#([Ff]{3}|[Ff]{6})'",  "background: 'var(--bg-input)'"),
    (r'background:\s*"#([Ff]{3}|[Ff]{6})"',  'background: "var(--bg-input)"'),

    # ── borderColor: ----------------------------------------------------------
    (r"borderColor:\s*'#(111|111111)'",   "borderColor: 'var(--border-strong)'"),
    (r"borderColor:\s*'#[Ee]5[Ee]5[Ee]5'","borderColor: 'var(--border)'"),
    (r"borderColor:\s*'#([Cc]{3}|[Bb]{3})'","borderColor: 'var(--border)'"),
    (r"borderColor:\s*'#[Cc]0603[Aa]'",  "borderColor: 'var(--accent)'"),
    (r"borderColor:\s*'#[Cc]00'",         "borderColor: 'var(--accent)'"),
    (r"borderColor:\s*'#(999|999999)'",   "borderColor: 'var(--text-muted)'"),
    (r'borderColor:\s*"#(111|111111)"',   'borderColor: "var(--border-strong)"'),
    (r'borderColor:\s*"#[Ee]5[Ee]5[Ee]5"','borderColor: "var(--border)"'),

    # ── borderBottomColor / borderTopColor / borderLeftColor: -----------------
    (r"borderBottomColor:\s*'#(111|111111)'","borderBottomColor: 'var(--border-strong)'"),
    (r"borderBottomColor:\s*'#[Ee]5[Ee]5[Ee]5'","borderBottomColor: 'var(--border)'"),
    (r"borderTopColor:\s*'#(111|111111)'","borderTopColor: 'var(--border-strong)'"),

    # ── border shorthand: '1px solid #HEX' ------------------------------------
    (r"border:\s*'1px solid #(111|111111)'",  "border: '1px solid var(--border-strong)'"),
    (r"border:\s*'1px solid #[Ee]5[Ee]5[Ee]5'","border: '1px solid var(--border)'"),
    (r"border:\s*'1px solid #([Cc]{3}|[Bb]{3})'","border: '1px solid var(--border)'"),
    (r"border:\s*'1px solid #[Ee]{3}'",       "border: '1px solid var(--border-subtle)'"),
    (r"border:\s*'1px solid #[Cc]0603[Aa]'",  "border: '1px solid var(--accent)'"),
    (r"border:\s*'1px solid #[Cc]00'",         "border: '1px solid var(--accent)'"),
    (r'border:\s*"1px solid #(111|111111)"',  'border: "1px solid var(--border-strong)"'),
    (r'border:\s*"1px solid #[Ee]5[Ee]5[Ee]5"','border: "1px solid var(--border)"'),
    # 2px variants
    (r"border:\s*'2px solid #(111|111111)'",  "border: '2px solid var(--border-strong)'"),
    (r"border:\s*'2px solid #[Ee]5[Ee]5[Ee]5'","border: '2px solid var(--border)'"),
    (r"border:\s*'2px solid #([Ff]{3}|[Ff]{6})'","border: '2px solid var(--bg)'"),
    # borderBottom/Top/Left inline shorthand
    (r"borderBottom:\s*'1px solid #[Ee]5[Ee]5[Ee]5'","borderBottom: '1px solid var(--border)'"),
    (r"borderBottom:\s*'1px solid #(111|111111)'","borderBottom: '1px solid var(--border-strong)'"),
    (r"borderBottom:\s*'2px solid #(111|111111)'","borderBottom: '2px solid var(--border-strong)'"),
    (r"borderTop:\s*'2px solid #(111|111111)'","borderTop: '2px solid var(--border-strong)'"),
    (r"borderLeft:\s*'2px solid #[Cc]0603[Aa]'","borderLeft: '2px solid var(--accent)'"),
    (r"borderLeft:\s*'1px solid #[Ee]5[Ee]5[Ee]5'","borderLeft: '1px solid var(--border)'"),

    # ── outlineColor / fill / stroke ------------------------------------------
    (r"outlineColor:\s*'#(111|111111)'","outlineColor: 'var(--border-strong)'"),

    # ── borderTop / borderBottom / borderLeft / borderRight shorthand ----------
    (r"borderTop:\s*'1px solid #(111|111111)'",   "borderTop: '1px solid var(--border-strong)'"),
    (r"borderTop:\s*'1px solid #[Ee]5[Ee]5[Ee]5'","borderTop: '1px solid var(--border)'"),
    (r"borderTop:\s*'1px solid #([Ee]{3})'",       "borderTop: '1px solid var(--border-subtle)'"),
    (r"borderTop:\s*'2px solid #(111|111111)'",   "borderTop: '2px solid var(--border-strong)'"),
    (r"borderTop:\s*'1px dashed #[A-Fa-f0-9]{6}'","borderTop: '1px dashed var(--border)'"),
    (r"borderBottom:\s*'1px solid #([Cc]{3}|[Dd]{3})'","borderBottom: '1px solid var(--border)'"),
    (r"borderBottom:\s*'1px solid #[Ff]0[Ff]0[Ff]0'","borderBottom: '1px solid var(--border-subtle)'"),
    (r"borderBottom:\s*'1px solid #([Ee]{3}|[Ff][Ff][Aa0-9]+)'","borderBottom: '1px solid var(--border-subtle)'"),
    (r"border:\s*'1px solid #([Cc]{3}|[Dd]{3}|[Dd]6[Dd]0[Cc]4|[Dd]{3})'","border: '1px solid var(--border)'"),
    (r"border:\s*'none; borderTop:\s*'1px solid #[Ee]5[Ee]5[Ee]5'",'border: "none", borderTop: "1px solid var(--border)"'),
    # hr with borderTop
    (r"borderTop:\s*'1px solid #[Ee]5[Ee]5[Ee]5'","borderTop: '1px solid var(--border)'"),

    # ── status-warn variants ---------------------------------------------------
    (r"color:\s*'#[Cc]60'",  "color: 'var(--status-warn)'"),
    (r"color:\s*'#[Aa]0780{2}'","color: 'var(--status-warn)'"),
    (r"color:\s*'#7[Aa]5[Cc]00'","color: 'var(--status-warn)'"),

    # ── misc one-off grays -----------------------------------------------------
    (r"color:\s*'#[Dd]1[Dd]5[Dd][Bb]'","color: 'var(--text-muted)'"),  # Tailwind gray-300
    (r"border:\s*'1px solid #[Dd]{3}'","border: '1px solid var(--border)'"),
    (r"border:\s*'1px solid #[Dd]6[Dd]6[Dd]6'","border: '1px solid var(--border)'"),

    # ── specific warm-toned backgrounds (not covered by #faf*) ----------------
    (r"background:\s*'#[Ff][Aa][Ff]8[Ff]4'","background: 'var(--bg)'"),
    (r"background:\s*'#[Ff][Aa][Ff][Aa][Ff]8'","background: 'var(--bg)'"),
    (r"background:\s*'#[Ff][Aa][Ff]8[Ff][78]'","background: 'var(--bg)'"),
    (r"background:\s*'#[Ff]5[Ff]4[Ff]4'","background: 'var(--bg-elevated)'"),
    (r"background:\s*'#[Ff][Aa][Ff][Aa][Ff][78]'","background: 'var(--bg)'"),
]

# ── Замены голых хексов в template literals (осторожно) ──────────────────────
# Паттерн: `${expr} ? '#HEX1' : '#HEX2'`  — заменяем каждый хекс индивидуально
BARE_HEX = [
    (r"'#(999|999999)'",   "'var(--text-muted)'"),
    (r"'#(aaa|AAA|bbb|BBB|888)'","'var(--text-muted)'"),
    (r"'#(666|666666|555|777|444)'","'var(--text-secondary)'"),
    (r"'#(333|333333)'",   "'var(--text-body)'"),
    (r"'#[Ee]5[Ee]5[Ee]5'","'var(--border)'"),
    (r"'#([Ee]{3}|[Cc]{3}|[Bb]{3})'","'var(--border)'"),
    (r"'#[Ff]0[Ff]0[Ff]0'","'var(--border-subtle)'"),
    (r"'#([Ff][Aa][Ff][Aa][Ff][Aa]|[Ff][Aa][Ff][Aa])'","'var(--bg-elevated)'"),
    (r"'#([Ff]5[Ff]5[Ff]5)'","'var(--bg-elevated)'"),
    (r"'#22[Cc]55[Ee]'",   "'var(--status-ok)'"),
    (r"'#16[Aa]34[Aa]'",   "'var(--status-ok-hover)'"),
    (r"'#[Ee][Ff]4444'",   "'var(--status-fail)'"),
    (r"'#[Ff]59[Ee]0[Bb]'","'var(--status-warn)'"),
    (r"'#[Cc]0603[Aa]'",   "'var(--accent)'"),
    (r"'#[Cc]00'",          "'var(--accent)'"),
    (r"'#2[Dd]6[Aa]4[Ff]'","'var(--success)'"),
]

EXCLUDE_FILES = {'globals.css', 'styleguide/page.tsx', 'migrate-hex-to-tokens.py'}

def should_skip(path: Path) -> bool:
    for ex in EXCLUDE_FILES:
        if ex in str(path):
            return True
    return path.suffix not in ('.tsx', '.ts')

def migrate(path: Path) -> int:
    src = path.read_text(encoding='utf-8')
    out = src

    for pattern, replacement in DIRECT:
        out = re.sub(pattern, replacement, out)

    for pattern, replacement in BARE_HEX:
        out = re.sub(pattern, replacement, out)

    if out == src:
        return 0

    if DRY_RUN:
        print(f"[dry-run] would modify {path}")
        return 1

    path.write_text(out, encoding='utf-8')
    return 1

roots = [Path('app'), Path('components')]
changed = 0
for root in roots:
    for f in root.rglob('*.tsx'):
        if not should_skip(f):
            changed += migrate(f)
    for f in root.rglob('*.ts'):
        if not should_skip(f):
            changed += migrate(f)

print(f"{'[dry-run] ' if DRY_RUN else ''}Modified {changed} files")
