import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# ── Colour palette ───────────────────────────────────────────────────────────
DARK_BLUE   = "1B3A5C"
MID_BLUE    = "2F5496"
LIGHT_BLUE  = "BDD7EE"
VL_BLUE     = "DEEAF1"
GOLD        = "C9A84C"
GREEN       = "70AD47"
LIGHT_GREEN = "E2EFDA"
WHITE       = "FFFFFF"
LIGHT_GRAY  = "F5F5F5"
MED_GRAY    = "D6DCE4"
INPUT_YEL   = "FFF2CC"
DARK_GRAY   = "404040"
RED         = "C00000"

MAX_TEAMS   = 50
MAX_MATCHES = 500
TEAMS_DATA_ROW_START = 2
MATCHES_DATA_ROW_START = 2

# ── Style helpers ─────────────────────────────────────────────────────────────
def hdr(ws, row, col, text, fg=WHITE, bg=DARK_BLUE, wrap=False, align="center"):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(bold=True, color=fg, name="Calibri", size=10)
    c.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
    c.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)
    c.border = thin(MID_BLUE)
    return c

def sub_hdr(ws, row, col, text, bg=MID_BLUE):
    return hdr(ws, row, col, text, fg=WHITE, bg=bg)

def inp(ws, row, col, value=None, fmt=None, align="left"):
    c = ws.cell(row=row, column=col, value=value)
    c.fill = PatternFill(start_color=INPUT_YEL, end_color=INPUT_YEL, fill_type="solid")
    c.border = thin(MED_GRAY)
    c.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        c.number_format = fmt
    return c

def lbl(ws, row, col, text, bold=False, align="left", color=DARK_BLUE):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(bold=bold, name="Calibri", size=10, color=color)
    c.alignment = Alignment(horizontal=align, vertical="center")
    return c

def formula(ws, row, col, expr, fmt=None, align="center", bg=None):
    c = ws.cell(row=row, column=col, value=expr)
    c.border = thin(MED_GRAY)
    c.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        c.number_format = fmt
    if bg:
        c.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
    return c

def thin(color=MED_GRAY):
    s = Side(border_style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)

def set_col_width(ws, col_letter, width):
    ws.column_dimensions[col_letter].width = width

def merge_hdr(ws, row, c1, c2, text, bg=DARK_BLUE, fg=WHITE, size=12):
    ws.merge_cells(start_row=row, start_column=c1, end_row=row, end_column=c2)
    c = ws.cell(row=row, column=c1, value=text)
    c.font = Font(bold=True, color=fg, name="Calibri", size=size)
    c.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
    c.alignment = Alignment(horizontal="center", vertical="center")
    return c

# ══════════════════════════════════════════════════════════════════════════════
# WORKBOOK
# ══════════════════════════════════════════════════════════════════════════════
wb = Workbook()

# ── Sheet 1: Setup ─────────────────────────────────────────────────────────
ws_setup = wb.active
ws_setup.title = "Setup"
ws_setup.sheet_view.showGridLines = False
ws_setup.row_dimensions[1].height = 40
ws_setup.row_dimensions[2].height = 8

merge_hdr(ws_setup, 1, 1, 5, "⚽  Boules Tournament Manager", bg=DARK_BLUE, size=16)

# Section: Tournament Details
merge_hdr(ws_setup, 3, 1, 5, "TOURNAMENT DETAILS", bg=MID_BLUE, size=10)

labels = [
    (4,  "Tournament Name",      "My Tournament"),
    (5,  "Description",          ""),
    (6,  "Number of Divisions",  2),
    (7,  "Games per Match",      3),
    (8,  "Points for a Win",     2),
    (9,  "Points for a Draw",    1),
    (10, "Points for a Loss",    0),
]
for row, label, default in labels:
    lbl(ws_setup, row, 1, label, bold=True)
    c = inp(ws_setup, row, 2, default)
    if isinstance(default, int):
        c.alignment = Alignment(horizontal="center", vertical="center")

# Section: Stages
merge_hdr(ws_setup, 12, 1, 5, "STAGES INCLUDED", bg=MID_BLUE, size=10)
stage_rows = [(13, "Initial Round", "Yes"), (14, "Quarter-Finals", "No"),
              (15, "Semi-Finals", "Yes"), (16, "Finals", "Yes")]
for row, stage, default in stage_rows:
    lbl(ws_setup, row, 1, stage, bold=True)
    c = inp(ws_setup, row, 2, default, align="center")
    dv = DataValidation(type="list", formula1='"Yes,No"', allow_blank=False)
    dv.sqref = f"B{row}"
    ws_setup.add_data_validation(dv)

# Instructions
merge_hdr(ws_setup, 18, 1, 5, "HOW TO USE THIS SPREADSHEET", bg=MID_BLUE, size=10)
instructions = [
    (19, "1. Setup tab", "Fill in your tournament details above (yellow cells)."),
    (20, "2. Teams tab", "Add all teams with their division (A, B, C, D...) and captain details."),
    (21, "3. Generate Matches", "Use the macro button on the Matches tab to auto-generate the round-robin schedule."),
    (22, "4. Enter Scores", "On the Matches tab, enter scores as matches are played. Winner & Status auto-calculate."),
    (23, "5. Leaderboard", "View the Leaderboard tab for live standings. Select a Stage using the dropdown."),
    (24, "6. Macro Setup", "To enable the Generate Matches button: open Excel, press Alt+F11, insert a Module,"),
    (25, "",              "paste the VBA code from the 'Macro Code' tab, then close the VBA editor."),
    (26, "",              "Save the file as .xlsm (macro-enabled) to preserve the button."),
]
for row, bold_text, normal_text in instructions:
    if bold_text:
        lbl(ws_setup, row, 1, bold_text, bold=True, color=MID_BLUE)
    lbl(ws_setup, row, 2, normal_text, color=DARK_GRAY)

set_col_width(ws_setup, "A", 22)
set_col_width(ws_setup, "B", 42)

# ── Sheet 2: Teams ─────────────────────────────────────────────────────────
ws_teams = wb.create_sheet("Teams")
ws_teams.sheet_view.showGridLines = False
ws_teams.row_dimensions[1].height = 32
ws_teams.row_dimensions[2].height = 18
ws_teams.freeze_panes = "A3"

merge_hdr(ws_teams, 1, 1, 5, "TEAMS", bg=DARK_BLUE, size=14)

team_headers = ["Division", "Team Name", "Captain Name", "Captain Phone", "Captain Email"]
team_widths  = [12, 28, 22, 18, 28]
for col, (h, w) in enumerate(zip(team_headers, team_widths), 1):
    hdr(ws_teams, 2, col, h)
    set_col_width(ws_teams, get_column_letter(col), w)

# Division validation
last_team_row = TEAMS_DATA_ROW_START + MAX_TEAMS
div_dv = DataValidation(type="list", formula1='"A,B,C,D,E,F"', allow_blank=True,
                        sqref=f"A3:A{last_team_row}")
ws_teams.add_data_validation(div_dv)

for r in range(TEAMS_DATA_ROW_START + 1, last_team_row + 1):
    row_bg = LIGHT_GRAY if r % 2 == 0 else WHITE
    for col in range(1, 6):
        c = ws_teams.cell(row=r, column=col)
        c.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
        c.border = thin(MED_GRAY)
        c.font = Font(name="Calibri", size=10)
        c.alignment = Alignment(vertical="center",
                                horizontal="center" if col == 1 else "left")

# Named range for team names (used in dropdowns on Matches sheet)
# Teams!$B$3:$B$52
from openpyxl.workbook.defined_name import DefinedName
wb.defined_names["TeamList"] = DefinedName("TeamList", attr_text="Teams!$B$3:$B$52")

# ── Sheet 3: Matches ───────────────────────────────────────────────────────
ws_matches = wb.create_sheet("Matches")
ws_matches.sheet_view.showGridLines = False
ws_matches.row_dimensions[1].height = 32
ws_matches.row_dimensions[2].height = 18
ws_matches.freeze_panes = "A3"

merge_hdr(ws_matches, 1, 1, 15, "MATCHES", bg=DARK_BLUE, size=14)

match_headers = [
    ("A", "Date",         11),
    ("B", "Stage",        14),
    ("C", "Division",     10),
    ("D", "Team 1",       22),
    ("E", "Team 2",       22),
    ("F", "G1\nT1",        7),
    ("G", "G1\nT2",        7),
    ("H", "G2\nT1",        7),
    ("I", "G2\nT2",        7),
    ("J", "G3\nT1",        7),
    ("K", "G3\nT2",        7),
    ("L", "Total\nT1",     9),
    ("M", "Total\nT2",     9),
    ("N", "Winner",       18),
    ("O", "Status",       12),
]
for col_idx, (col_letter, label_text, width) in enumerate(match_headers, 1):
    h = hdr(ws_matches, 2, col_idx, label_text, wrap=True)
    h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    set_col_width(ws_matches, col_letter, width)

ws_matches.row_dimensions[2].height = 30

# Stage dropdown
stage_dv = DataValidation(type="list",
    formula1='"Initial,Quarter-Finals,Semi-Finals,Finals"', allow_blank=True)
stage_dv.sqref = f"B3:B{MATCHES_DATA_ROW_START + MAX_MATCHES}"
ws_matches.add_data_validation(stage_dv)

# Division dropdown
div_match_dv = DataValidation(type="list", formula1='"A,B,C,D,E,F"', allow_blank=True)
div_match_dv.sqref = f"C3:C{MATCHES_DATA_ROW_START + MAX_MATCHES}"
ws_matches.add_data_validation(div_match_dv)

# Team dropdowns (reference Teams sheet)
team1_dv = DataValidation(type="list", formula1="TeamList", allow_blank=True,
                           showErrorMessage=False)
team1_dv.sqref = f"D3:D{MATCHES_DATA_ROW_START + MAX_MATCHES}"
ws_matches.add_data_validation(team1_dv)

team2_dv = DataValidation(type="list", formula1="TeamList", allow_blank=True,
                           showErrorMessage=False)
team2_dv.sqref = f"E3:E{MATCHES_DATA_ROW_START + MAX_MATCHES}"
ws_matches.add_data_validation(team2_dv)

# Data rows with formulas
for r in range(3, MATCHES_DATA_ROW_START + MAX_MATCHES + 1):
    row_bg = LIGHT_GRAY if r % 2 == 0 else WHITE

    # Date (A) - input
    c = ws_matches.cell(row=r, column=1)
    c.number_format = "DD/MM/YYYY"
    c.fill = PatternFill(start_color=INPUT_YEL, end_color=INPUT_YEL, fill_type="solid")
    c.border = thin(MED_GRAY)
    c.alignment = Alignment(horizontal="center", vertical="center")

    # Stage (B), Division (C), Team1 (D), Team2 (E) - input
    for col in range(2, 6):
        c = ws_matches.cell(row=r, column=col)
        c.fill = PatternFill(start_color=INPUT_YEL, end_color=INPUT_YEL, fill_type="solid")
        c.border = thin(MED_GRAY)
        c.alignment = Alignment(horizontal="center" if col in (2,3) else "left",
                                vertical="center")
        c.font = Font(name="Calibri", size=10)

    # Game scores (F-K) - input
    for col in range(6, 12):
        c = ws_matches.cell(row=r, column=col)
        c.fill = PatternFill(start_color=INPUT_YEL, end_color=INPUT_YEL, fill_type="solid")
        c.border = thin(MED_GRAY)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.font = Font(name="Calibri", size=10)

    # Total T1 (L) - formula: sum of G1T1 + G2T1 + G3T1 if any score entered
    total_t1 = (f'=IF(AND(D{r}="",E{r}=""),"",IFERROR(SUMIF(F{r}:F{r},"<>",'
                f'F{r})+SUMIF(H{r}:H{r},"<>",H{r})+SUMIF(J{r}:J{r},"<>",J{r}),0))')
    formula(ws_matches, r, 12,
            f'=IF(AND(D{r}="",E{r}=""),"",IFERROR(IF(F{r}<>"",F{r},0)+IF(H{r}<>"",H{r},0)+IF(J{r}<>"",J{r},0),""))',
            align="center", bg=VL_BLUE)

    # Total T2 (M)
    formula(ws_matches, r, 13,
            f'=IF(AND(D{r}="",E{r}=""),"",IFERROR(IF(G{r}<>"",G{r},0)+IF(I{r}<>"",I{r},0)+IF(K{r}<>"",K{r},0),""))',
            align="center", bg=VL_BLUE)

    # Winner (N)
    formula(ws_matches, r, 14,
            f'=IF(OR(L{r}="",M{r}=""),"",IF(L{r}>M{r},D{r},IF(M{r}>L{r},E{r},"Draw")))',
            align="center", bg=VL_BLUE)

    # Status (O)
    formula(ws_matches, r, 15,
            f'=IF(AND(D{r}="",E{r}=""),"",IF(AND(L{r}<>"",M{r}<>""),"Completed","Scheduled"))',
            align="center", bg=VL_BLUE)

# Conditional formatting: green for Completed, gold for Scheduled
from openpyxl.formatting.rule import FormulaRule
completed_fill = PatternFill(start_color=LIGHT_GREEN, end_color=LIGHT_GREEN, fill_type="solid")
scheduled_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")

ws_matches.conditional_formatting.add(
    f"O3:O{MATCHES_DATA_ROW_START + MAX_MATCHES}",
    FormulaRule(formula=[f'O3="Completed"'], fill=completed_fill))

# ── Sheet 4: Leaderboard ───────────────────────────────────────────────────
ws_lb = wb.create_sheet("Leaderboard")
ws_lb.sheet_view.showGridLines = False
ws_lb.row_dimensions[1].height = 36
ws_lb.row_dimensions[2].height = 8
ws_lb.row_dimensions[3].height = 22
ws_lb.freeze_panes = "A5"

merge_hdr(ws_lb, 1, 1, 9, "LEADERBOARD", bg=DARK_BLUE, size=16)

# Stage selector
lbl(ws_lb, 3, 1, "Stage:", bold=True, color=DARK_BLUE)
c = inp(ws_lb, 3, 2, "Initial", align="center")
c.font = Font(bold=True, name="Calibri", size=11, color=MID_BLUE)
stage_lb_dv = DataValidation(type="list",
    formula1='"Initial,Quarter-Finals,Semi-Finals,Finals"', allow_blank=False)
stage_lb_dv.sqref = "B3"
ws_lb.add_data_validation(stage_lb_dv)

lbl(ws_lb, 3, 4, "← Change stage to view different standings", color=DARK_GRAY)

lb_headers = ["Pos", "Team", "Played", "Won", "Drawn", "Lost", "Points", "GF", "GA", "Diff"]
lb_widths   = [6, 24, 8, 7, 7, 7, 8, 7, 7, 7]

TEAMS_PER_DIV = 20
ROW_START = 5
DIVISION_GAP = 3

def write_leaderboard_division(ws, div_letter, start_row, max_teams=TEAMS_PER_DIV):
    # Division header
    merge_hdr(ws, start_row, 1, 10, f"DIVISION {div_letter}", bg=MID_BLUE, size=11)

    # Column headers
    for col_idx, (h, w) in enumerate(zip(lb_headers, lb_widths), 1):
        hdr(ws, start_row + 1, col_idx, h, bg=DARK_BLUE)
        if start_row == ROW_START:  # only set widths once
            set_col_width(ws, get_column_letter(col_idx), w)

    # References:
    # Teams!$A$3:$A$52 = division column
    # Teams!$B$3:$B$52 = team name column
    # Matches stage filter: $B$3 on Leaderboard sheet
    # M_B = Matches stage col B, M_D = team1, M_E = team2, M_L = total T1, M_M = total T2
    # M_N = winner, M_O = status

    M_MAX = MATCHES_DATA_ROW_START + MAX_MATCHES  # 502
    T_MAX = TEAMS_DATA_ROW_START + MAX_TEAMS      # 52

    for i in range(max_teams):
        r = start_row + 2 + i
        row_bg = LIGHT_GRAY if i % 2 == 0 else WHITE

        # Team name: pull i-th team from Teams sheet that belongs to this division
        # Using IFERROR+INDEX+SMALL array approach
        team_formula = (
            f'=IFERROR(INDEX(Teams!$B$3:$B${T_MAX},'
            f'SMALL(IF(Teams!$A$3:$A${T_MAX}="{div_letter}",'
            f'ROW(Teams!$A$3:$A${T_MAX})-ROW(Teams!$A$3)+1),{i+1})),"")'
        )

        # Position
        pos_cell = ws.cell(row=r, column=1)
        pos_cell.border = thin(MED_GRAY)
        pos_cell.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
        pos_cell.alignment = Alignment(horizontal="center", vertical="center")
        pos_cell.font = Font(bold=True, name="Calibri", size=10, color=DARK_BLUE)

        # Team name (col 2) - array formula stored as regular (Excel 365 compatible)
        team_cell = ws.cell(row=r, column=2, value=team_formula)
        team_cell.border = thin(MED_GRAY)
        team_cell.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
        team_cell.font = Font(name="Calibri", size=10)
        team_cell.alignment = Alignment(horizontal="left", vertical="center")

        # Stats formulas — B_r = team name reference
        B = f"B{r}"  # team name cell on this sheet
        SL = "$B$3"  # stage selector cell

        # SUMPRODUCT approach:
        def sp_played(team_ref, stage_ref):
            return (
                f'=IFERROR(IF({team_ref}="","",'
                f'SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$D$3:$D${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))'
                f'+SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$E$3:$E${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))),"—")'
            )

        def sp_won(team_ref, stage_ref):
            return (
                f'=IFERROR(IF({team_ref}="","",'
                f'SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$D$3:$D${M_MAX}={team_ref})*'
                f'(Matches!$N$3:$N${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))'
                f'+SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$E$3:$E${M_MAX}={team_ref})*'
                f'(Matches!$N$3:$N${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))),"—")'
            )

        def sp_drawn(team_ref, stage_ref):
            return (
                f'=IFERROR(IF({team_ref}="","",'
                f'SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$D$3:$D${M_MAX}={team_ref})*'
                f'(Matches!$N$3:$N${M_MAX}="Draw")*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))'
                f'+SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$E$3:$E${M_MAX}={team_ref})*'
                f'(Matches!$N$3:$N${M_MAX}="Draw")*'
                f'(Matches!$O$3:$O${M_MAX}="Completed"))),"—")'
            )

        def sp_score_for(team_ref, stage_ref):
            return (
                f'=IFERROR(IF({team_ref}="","",'
                f'SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$D$3:$D${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed")*'
                f'IF(ISNUMBER(Matches!$L$3:$L${M_MAX}),Matches!$L$3:$L${M_MAX},0))'
                f'+SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$E$3:$E${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed")*'
                f'IF(ISNUMBER(Matches!$M$3:$M${M_MAX}),Matches!$M$3:$M${M_MAX},0))),"—")'
            )

        def sp_score_against(team_ref, stage_ref):
            return (
                f'=IFERROR(IF({team_ref}="","",'
                f'SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$D$3:$D${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed")*'
                f'IF(ISNUMBER(Matches!$M$3:$M${M_MAX}),Matches!$M$3:$M${M_MAX},0))'
                f'+SUMPRODUCT((Matches!$B$3:$B${M_MAX}={stage_ref})*'
                f'(Matches!$E$3:$E${M_MAX}={team_ref})*'
                f'(Matches!$O$3:$O${M_MAX}="Completed")*'
                f'IF(ISNUMBER(Matches!$L$3:$L${M_MAX}),Matches!$L$3:$L${M_MAX},0))),"—")'
            )

        # Played (col 3)
        formula(ws, r, 3, sp_played(B, SL), align="center", bg=row_bg)

        # Won (col 4)
        formula(ws, r, 4, sp_won(B, SL), align="center", bg=row_bg)

        # Drawn (col 5)
        formula(ws, r, 5, sp_drawn(B, SL), align="center", bg=row_bg)

        # Lost (col 6): Played - Won - Drawn
        formula(ws, r, 6,
            f'=IFERROR(IF({B}="","",IF(ISNUMBER(C{r}),C{r}-D{r}-E{r},"—")),"—")',
            align="center", bg=row_bg)

        # Points (col 7): Won*WinPts + Drawn*DrawPts + Lost*LossPts
        formula(ws, r, 7,
            f'=IFERROR(IF({B}="","",IF(ISNUMBER(D{r}),'
            f'D{r}*Setup!$B$8+E{r}*Setup!$B$9+F{r}*Setup!$B$10,"—")),"—")',
            fmt="0", align="center", bg=row_bg)

        # GF (col 8)
        formula(ws, r, 8, sp_score_for(B, SL), align="center", bg=row_bg)

        # GA (col 9)
        formula(ws, r, 9, sp_score_against(B, SL), align="center", bg=row_bg)

        # Diff (col 10): GF - GA
        formula(ws, r, 10,
            f'=IFERROR(IF({B}="","",IF(ISNUMBER(H{r}),H{r}-I{r},"—")),"—")',
            fmt="+0;-0;0", align="center", bg=row_bg)

    return start_row + 2 + max_teams + DIVISION_GAP

# Write leaderboard for 4 divisions
current_row = ROW_START
for div in ["A", "B", "C", "D"]:
    current_row = write_leaderboard_division(ws_lb, div, current_row)

# Note about position column
lbl(ws_lb, current_row, 1,
    "Note: Sort the Leaderboard by Points (col G) then Diff (col J) descending to assign positions.",
    color=DARK_GRAY)

# ── Sheet 5: Macro Code ────────────────────────────────────────────────────
ws_vba = wb.create_sheet("Macro Code")
ws_vba.sheet_view.showGridLines = False
ws_vba.column_dimensions["A"].width = 100
ws_vba.row_dimensions[1].height = 36

merge_hdr(ws_vba, 1, 1, 1, "VBA MACRO CODE — Generate Matches", bg=DARK_BLUE, size=14)

instructions_vba = [
    "",
    "HOW TO ADD MACROS TO EXCEL:",
    "1. Save this file as Tournament.xlsm (File > Save As > Excel Macro-Enabled Workbook)",
    "2. Press Alt + F11 to open the VBA Editor",
    "3. Click Insert > Module",
    "4. Copy and paste ALL the code below into the module",
    "5. Close the VBA editor (Alt + F4)",
    "6. To run: Developer tab > Macros > select GenerateMatches > Run",
    "   (Or add a button: Developer tab > Insert > Button > assign GenerateMatches macro)",
    "",
    "═" * 80,
    "",
]

VBA_CODE = r"""
' ════════════════════════════════════════════════════════════════════
'  Boules Tournament Manager — Excel Macros
'  Paste this entire block into a VBA Module (Alt+F11 > Insert > Module)
' ════════════════════════════════════════════════════════════════════

Sub GenerateMatches()
    ' Generates round-robin matches for all divisions from the Teams sheet
    
    Dim wsTeams    As Worksheet
    Dim wsMatches  As Worksheet
    Set wsTeams   = ThisWorkbook.Sheets("Teams")
    Set wsMatches = ThisWorkbook.Sheets("Matches")
    
    Dim lastTeamRow As Long
    lastTeamRow = wsTeams.Cells(wsTeams.Rows.Count, "B").End(xlUp).Row
    
    If lastTeamRow < 3 Then
        MsgBox "No teams found. Please add teams to the Teams sheet first.", vbExclamation
        Exit Sub
    End If
    
    ' Build dictionary: Division -> list of team names
    Dim divTeams As Object
    Set divTeams = CreateObject("Scripting.Dictionary")
    
    Dim i As Long
    For i = 3 To lastTeamRow
        Dim divName  As String
        Dim teamName As String
        divName  = Trim(CStr(wsTeams.Cells(i, "A").Value))
        teamName = Trim(CStr(wsTeams.Cells(i, "B").Value))
        If teamName <> "" And divName <> "" Then
            If Not divTeams.Exists(divName) Then
                divTeams.Add divName, New Collection
            End If
            divTeams(divName).Add teamName
        End If
    Next i
    
    If divTeams.Count = 0 Then
        MsgBox "No valid teams found (check Division and Team Name columns are filled).", vbExclamation
        Exit Sub
    End If
    
    ' Count how many new matches would be generated
    Dim totalNew As Long
    totalNew = 0
    Dim divKey As Variant
    For Each divKey In divTeams.Keys
        Dim n As Long
        n = divTeams(divKey).Count
        totalNew = totalNew + (n * (n - 1)) / 2
    Next divKey
    
    Dim confirmMsg As String
    confirmMsg = "Ready to generate initial round-robin matches." & Chr(13) & Chr(13)
    Dim dk As Variant
    For Each dk In divTeams.Keys
        confirmMsg = confirmMsg & "  Division " & dk & ": " & divTeams(dk).Count & " teams" & Chr(13)
    Next dk
    confirmMsg = confirmMsg & Chr(13) & "Up to " & totalNew & " matches will be added." & Chr(13)
    confirmMsg = confirmMsg & "Existing matches will not be deleted." & Chr(13) & Chr(13)
    confirmMsg = confirmMsg & "Continue?"
    
    If MsgBox(confirmMsg, vbYesNo + vbQuestion, "Generate Matches") = vbNo Then Exit Sub
    
    ' Find next empty row in Matches sheet (check column D)
    Dim lastMatchRow As Long
    lastMatchRow = wsMatches.Cells(wsMatches.Rows.Count, "D").End(xlUp).Row
    Dim r As Long
    r = lastMatchRow + 1
    
    Dim addedCount As Long
    addedCount = 0
    
    For Each divKey In divTeams.Keys
        ' Convert collection to array
        Dim col As Collection
        Set col = divTeams(divKey)
        Dim teamArr() As String
        ReDim teamArr(1 To col.Count)
        Dim k As Long
        k = 1
        Dim t As Variant
        For Each t In col
            teamArr(k) = CStr(t)
            k = k + 1
        Next t
        
        ' Generate all unique pairs
        Dim ti As Long, tj As Long
        For ti = 1 To UBound(teamArr)
            For tj = ti + 1 To UBound(teamArr)
                ' Check if match already exists (avoid duplicates)
                Dim exists As Boolean
                exists = False
                Dim chk As Long
                For chk = 3 To lastMatchRow
                    Dim d As String, e As String
                    d = CStr(wsMatches.Cells(chk, "D").Value)
                    e = CStr(wsMatches.Cells(chk, "E").Value)
                    If (d = teamArr(ti) And e = teamArr(tj)) Or _
                       (d = teamArr(tj) And e = teamArr(ti)) Then
                        exists = True
                        Exit For
                    End If
                Next chk
                
                If Not exists Then
                    wsMatches.Cells(r, "B").Value = "Initial"
                    wsMatches.Cells(r, "C").Value = CStr(divKey)
                    wsMatches.Cells(r, "D").Value = teamArr(ti)
                    wsMatches.Cells(r, "E").Value = teamArr(tj)
                    r = r + 1
                    addedCount = addedCount + 1
                End If
            Next tj
        Next ti
    Next divKey
    
    MsgBox addedCount & " match(es) generated successfully!", vbInformation, "Done"
End Sub


Sub ClearAllMatches()
    ' Clears all match data (use with caution!)
    
    If MsgBox("WARNING: This will permanently delete ALL match data including scores." & Chr(13) & Chr(13) & _
              "Are you absolutely sure?", vbYesNo + vbCritical, "Delete All Matches") = vbNo Then Exit Sub
    
    Dim wsMatches As Worksheet
    Set wsMatches = ThisWorkbook.Sheets("Matches")
    
    Dim lastRow As Long
    lastRow = wsMatches.Cells(wsMatches.Rows.Count, "D").End(xlUp).Row
    
    If lastRow >= 3 Then
        wsMatches.Range("A3:K" & lastRow).ClearContents
    End If
    
    MsgBox "All matches cleared.", vbInformation
End Sub


Sub SortLeaderboard()
    ' Refreshes and sorts a leaderboard division table by Points then Diff
    ' Run this after entering scores to update positions
    
    MsgBox "Leaderboard formulas auto-calculate from the Matches sheet." & Chr(13) & Chr(13) & _
           "To sort manually: click on the Points column (G) in a division table," & Chr(13) & _
           "then use Data > Sort Z-A.", vbInformation, "Leaderboard"
End Sub
"""

row = 2
for line in instructions_vba:
    c = ws_vba.cell(row=row, column=1, value=line)
    if line.startswith("HOW TO"):
        c.font = Font(bold=True, name="Calibri", size=11, color=MID_BLUE)
    elif line.startswith(("1.", "2.", "3.", "4.", "5.", "6.")):
        c.font = Font(name="Calibri", size=10, color=DARK_GRAY)
    elif line.startswith("═"):
        c.font = Font(name="Calibri", size=10, color=MED_GRAY)
    row += 1

# VBA code block
for line in VBA_CODE.split("\n"):
    c = ws_vba.cell(row=row, column=1, value=line)
    c.font = Font(name="Courier New", size=9, color="003300")
    c.fill = PatternFill(start_color="F0F7F0", end_color="F0F7F0", fill_type="solid")
    row += 1

# ── Final setup: tab colours & order ──────────────────────────────────────
ws_setup.sheet_properties.tabColor   = DARK_BLUE
ws_teams.sheet_properties.tabColor   = MID_BLUE
ws_matches.sheet_properties.tabColor = GREEN
ws_lb.sheet_properties.tabColor      = GOLD
ws_vba.sheet_properties.tabColor     = "808080"

# Set active sheet
wb.active = ws_setup

# ── Save ──────────────────────────────────────────────────────────────────
output_path = "Boules_Tournament_Manager.xlsx"
wb.save(output_path)
print(f"Saved: {output_path}")
