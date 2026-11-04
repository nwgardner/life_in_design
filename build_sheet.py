import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

fw = json.load(open(sys.argv[1]))
out = sys.argv[2]

INK = "2B2622"; CLAY = "B4532A"; PAPER = "F6F1E8"; SAND = "E9DFCF"
head_font = Font(name="Arial", bold=True, color="FFFFFF", size=10)
head_fill = PatternFill("solid", fgColor=INK)
ref_fill = PatternFill("solid", fgColor=CLAY)
body_font = Font(name="Arial", size=10, color=INK)
wrap = Alignment(wrap_text=True, vertical="top")
thin = Side(style="thin", color=SAND)

WIDTHS = {
    "UserID": 38, "Name": 18, "Email": 26, "CreatedAt": 20, "LastActiveAt": 20, "Stage": 14,
    "CurrentFocus": 22, "WhatBroughtYou": 40, "HopedChange": 40, "Is18OrOlder": 12, "PlainStyle": 11,
    "Layer": 8, "Element": 20, "ElementOrder": 8, "Statement": 60, "Status": 12, "Version": 8,
    "UpdatedAt": 20, "HistoryID": 38, "ChangedAt": 20, "ChangeNote": 40, "EntryID": 38, "Area": 22,
    "IsCustomArea": 12, "LensOrder": 9, "Lens": 22, "Response": 60, "Skipped": 9, "ChoiceID": 38,
    "ChosenBelief": 50, "Why": 50, "ApprovedAt": 20, "ProblemID": 38, "Description": 50, "ParkedAt": 20,
    "ResolvedAt": 20, "ResolutionNote": 40, "CommitmentID": 38, "SessionID": 38, "Focus": 22,
    "Commitment": 50, "CompletedAt": 20, "Reflection": 40, "StartedAt": 20, "EndedAt": 20,
    "Summary": 50, "MessageID": 38, "Timestamp": 20, "Context": 26, "Role": 10, "Content": 80,
}

PURPOSE = {
    "Users": "One row per person. Stage: onboarding · design · alignment · living · remodel. Prefs holds notification settings.",
    "DesignRecord": "The current statement for each of the 9 elements, one row per person per element.",
    "ElementHistory": "Every saved version of every element, with a dated one-line note on why it changed. Never overwritten.",
    "BeliefExploration": "Core Beliefs Exploration answers: one row per person × area × lens. Answers captured from the coaching conversation. LensStatus: Open, Explored or Skipped.",
    "ChosenBeliefs": "The one-sentence belief a person chooses to close each area, saved only with their approval.",
    "ParkedProblems": "Pressing 'What' problems noted on the way in, held until the What layer arrives.",
    "Commitments": "The one small, specific action each session ends with.",
    "Sessions": "Each visit: when it started, its focus, and a short summary.",
    "Messages": "The coaching conversation, by context (an element, an exploration area, alignment, check-in).",
    "Assessments": "Strength and personality test results the person entered: one row per person per test, with the results, a readable summary for the coach, date taken and notes.",
    "Journal": "Journal entries, with the prompt used and whether the person shared the entry with their coach. Deleting an entry erases its text.",
    "Growth": "Knowledge and skills acquired or being built. Accepted learning guidance lands here as Planned.",
    "Recommendations": "Guidance cards from congruence reviews (Why, How or What), and whether the person accepted, adapted or declined each one, with their reason.",
    "Reviews": "Congruence reviews: a summary, the item-by-item trace from What to How and Why, and how many items traced clearly.",
}

STATUS_VALUES = {
    ("DesignRecord", "Status"): "Draft,Approved",
    ("ElementHistory", "Status"): "Draft,Approved",
    ("ParkedProblems", "Status"): "Parked,Revisited,Resolved",
    ("Commitments", "Status"): "Open,Done,Let go",
    ("Users", "Stage"): "onboarding,design,alignment,living,remodel",
    ("Messages", "Role"): "user,assistant",
}

wb = Workbook()
ws = wb.active
ws.title = "Start Here"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 24
ws.column_dimensions["C"].width = 100
ws["B2"] = "Life in Design Coach · Database"
ws["B2"].font = Font(name="Georgia", size=20, color=INK)
ws["B3"] = "Consider yourself an iterative design."
ws["B3"].font = Font(name="Georgia", italic=True, size=12, color=CLAY)
ws["B5"] = ("This spreadsheet is the backend for the Life in Design Coach web app. The app reads and writes the data tabs "
            "through Google Apps Script and finds columns by header name, so leave the headers as they are. The Ref_ tabs "
            "document the framework the app uses; editing them does not change the app.")
ws["B5"].alignment = wrap; ws["B5"].font = body_font
ws.merge_cells("B5:C5"); ws.row_dimensions[5].height = 48
r = 7
ws.cell(r, 2, "Tab").font = head_font; ws.cell(r, 2).fill = head_fill
ws.cell(r, 3, "What it holds").font = head_font; ws.cell(r, 3).fill = head_fill
for t, p in PURPOSE.items():
    r += 1
    ws.cell(r, 2, t).font = Font(name="Arial", bold=True, size=10, color=INK)
    ws.cell(r, 3, p).font = body_font; ws.cell(r, 3).alignment = wrap
for t, p in [("Ref_Elements", "The 9 elements: layer, one-line definition, defining question, what a strong draft looks like."),
             ("Ref_BeliefAreas", "The 14 suggested areas for the Core Beliefs Exploration (people can add their own)."),
             ("Ref_Lenses", "The 7 lenses each area is explored through, in order."),
             ("Ref_Tests", "The 10 strength and personality tests people can record, what each measures and what the app asks for.")]:
    r += 1
    ws.cell(r, 2, t).font = Font(name="Arial", bold=True, size=10, color=CLAY)
    ws.cell(r, 3, p).font = body_font
r += 2
ws.cell(r, 2, "Privacy").font = Font(name="Arial", bold=True, size=10, color=INK)
ws.cell(r, 3, "Everything here is personal and confidential. Share this file only with people who run the app.").font = body_font

for table, cols in fw["tables"].items():
    s = wb.create_sheet(table)
    for i, c in enumerate(cols, 1):
        cell = s.cell(1, i, c)
        cell.font = head_font; cell.fill = head_fill
        cell.alignment = Alignment(vertical="center")
        s.column_dimensions[get_column_letter(i)].width = WIDTHS.get(c, 18)
    s.freeze_panes = "A2"
    s.row_dimensions[1].height = 22
    for (tt, col), vals in STATUS_VALUES.items():
        if tt == table:
            letter = get_column_letter(cols.index(col) + 1)
            dv = DataValidation(type="list", formula1=f'"{vals}"', allow_blank=True)
            dv.add(f"{letter}2:{letter}5000")
            s.add_data_validation(dv)

def ref(name, headers, rows, widths):
    s = wb.create_sheet(name)
    for i, h in enumerate(headers, 1):
        c = s.cell(1, i, h); c.font = head_font; c.fill = ref_fill
        s.column_dimensions[get_column_letter(i)].width = widths[i - 1]
    for r_i, row in enumerate(rows, 2):
        for c_i, v in enumerate(row, 1):
            c = s.cell(r_i, c_i, v); c.font = body_font; c.alignment = wrap
    s.freeze_panes = "A2"

ref("Ref_Elements", ["Order", "Layer", "Element", "In one line", "Defining question", "A strong draft"],
    [[e["order"], e["layer"], e["element"], e["oneLine"], e["definingQuestion"], e["strongDraft"]] for e in fw["elements"]],
    [7, 7, 20, 44, 60, 60])
ref("Ref_BeliefAreas", ["Order", "Area", "Note"],
    [[a["order"], a["area"], a["weight"]] for a in fw["areas"]], [7, 26, 16])
ref("Ref_Lenses", ["Order", "Lens", "Kind", "Questions", "If this lens is hard"],
    [[l["order"], l["lens"], l["kind"], l["questions"], l["alt"]] for l in fw["lenses"]], [7, 22, 10, 80, 50])

ENTER = {'clifton':'Themes ranked from the 34 (at least the top 5), grouped by domain','via':'Strengths ranked from the 24 (at least the top 5), grouped by virtue',
 'mbti':'One letter from each of the 4 pairs, optional percentages, optional -A or -T','enneagram':'Core type 1 to 9, wing, dominant instinct, tritype',
 'bigfive':'Percentile 0 to 100 for each of the 5 traits','disc':'Primary and secondary style, optional score for each of D, I, S and C',
 'genius':'Sort the 6 types: 2 geniuses, 2 competencies, 2 frustrations','kolbe':'Score 1 to 10 in each of the 4 Action Modes',
 'holland':'Three-letter code, in order','love':'Score 0 to 12 for each of the 5 languages'}
ref("Ref_Tests", ["Order", "Key", "Test", "Publisher", "What it measures", "What you enter", "Informs", "Where to take it"],
    [[i, t["key"], t["name"], t["publisher"], t["what"], ENTER[t["key"]], ", ".join(t["feeds"]), t["url"]] for i, t in enumerate(fw["tests"], 1)],
    [7, 11, 26, 30, 40, 44, 26, 38])

wb.save(out)
print("saved", out, wb.sheetnames)
