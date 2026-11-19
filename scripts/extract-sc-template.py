# Uso: soffice --headless --convert-to xlsx SOLICITACAO_PAI.xlsb && python3 scripts/extract-sc-template.py SOLICITACAO_PAI.xlsx src/pdf/scTemplate.json
"""Extrai a geometria e os estilos da aba 'C.I (1 por página)' para um JSON usado pelo gerador de PDF."""
import sys, json, colorsys, math, openpyxl
from openpyxl.utils import column_index_from_string, get_column_letter
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src); ws = wb['C.I (1 por página)']
THEME = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646']
def tinted(hexrgb, tint):
    r, g, b = (int(hexrgb[i:i+2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = l * (1 + tint) if tint < 0 else l * (1 - tint) + tint
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '%02X%02X%02X' % tuple(round(x * 255) for x in (r, g, b))
def color(c):
    if c is None: return None
    if c.type == 'rgb' and isinstance(c.rgb, str): return c.rgb[-6:]
    if c.type == 'theme': return tinted(THEME[c.theme], c.tint or 0)
    return None
FIRST_COL, LAST_COL, LAST_ROW = 2, 13, 40   # B..M, linhas 1..40
MDW = 7
def col_pt(w): return math.floor(((256 * w + math.floor(128 / MDW)) / 256) * MDW) * 0.75
cols = [round(col_pt(ws.column_dimensions[get_column_letter(c)].width), 2) for c in range(FIRST_COL, LAST_COL + 1)]
rows = []
for r in range(1, LAST_ROW + 1):
    d = ws.row_dimensions[r]
    rows.append(0 if d.hidden else (d.height or 12.75))
# Células preenchidas pelo sistema (valores do exemplo da planilha são removidos)
DATA = {'C2', 'I2', 'C3', 'L3', 'H6', 'B16', 'H34'} | {f'D{r}' for r in range(6, 13)} | {f'G{r}' for r in range(6, 13)} \
     | {f'{c}{r}' for r in range(21, 29) for c in 'BGHJKM'}
merges = []
for m in ws.merged_cells.ranges:
    if m.min_col < FIRST_COL or m.max_row > LAST_ROW: continue
    merges.append([m.min_row - 1, m.min_col - FIRST_COL, m.max_row - 1, m.max_col - FIRST_COL])
cells = {}
for r in range(1, LAST_ROW + 1):
    for c in range(FIRST_COL, LAST_COL + 1):
        cell = ws.cell(r, c)
        f = cell.font; b = cell.border; a = cell.alignment
        fill = color(cell.fill.fgColor) if cell.fill and cell.fill.fill_type == 'solid' else None
        border = {k[0]: getattr(b, k).style for k in ('left', 'right', 'top', 'bottom') if getattr(b, k).style}
        value = None if cell.coordinate in DATA else cell.value
        if isinstance(value, (int, float)): value = str(value)
        if value is None and not fill and not border and cell.coordinate not in DATA: continue
        spec = {}
        if value: spec['v'] = value
        if fill: spec['fill'] = fill
        if border: spec['b'] = border
        fc = color(f.color)
        spec['f'] = [f.sz or 10, 1 if f.b else 0, 1 if f.u else 0, fc or '000000']
        spec['a'] = [a.horizontal or 'general', a.vertical or 'bottom', 1 if a.wrap_text else 0]
        if cell.coordinate in DATA: spec['data'] = cell.coordinate
        cells[f'{r-1},{c-FIRST_COL}'] = spec
img = ws._images[0]
fr, to = img.anchor._from, img.anchor.to
EMU = 12700
logo = {'x': fr.colOff / EMU, 'y': fr.rowOff / EMU, 'w': (to.colOff - fr.colOff) / EMU, 'h': (to.rowOff - fr.rowOff) / EMU}
pm = ws.page_margins
json.dump({'source': 'SOLICITACAO_PAI.xlsb · aba "C.I (1 por página)"', 'cols': cols, 'rows': rows, 'merges': merges, 'cells': cells, 'logo': logo,
           'margins': {'left': pm.left * 72, 'right': pm.right * 72, 'top': pm.top * 72, 'bottom': pm.bottom * 72}},
          open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('cols', cols, 'sum', sum(cols)); print('rows sum', sum(rows), 'cells', len(cells), 'merges', len(merges), 'logo', logo)
