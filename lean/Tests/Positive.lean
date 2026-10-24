import ProofPuzzle
open ProofPuzzle Move Color

abbrev Puzzle (start target : Board) : Prop := Reach target start

def plain (c : Color) : Cell := ⟨c, none, false⟩
def arrow (c : Color) (d : Dir) : Cell := ⟨c, some d, false⟩
def lock (c : Color) : Cell := ⟨c, none, true⟩

theorem swapOnce : Puzzle
    [[plain .blue, plain .red]]
    [[plain .red, plain .blue]] := by
  swap (0, 0) (0, 1)

theorem swapPair : Puzzle
    [[plain .blue, plain .red], [plain .white, plain .green]]
    [[plain .red, plain .blue], [plain .green, plain .white]] := by
  swap (0, 0) (0, 1)
  swap (1, 0) (1, 1)

theorem paintOnce : Puzzle
    [[plain .red, plain .red]]
    [[plain .green, plain .red]] := by
  paint (0, 0) green

theorem paintTwiceSameCell : Puzzle
    [[plain .red, plain .red]]
    [[plain .yellow, plain .red]] := by
  paint (0, 0) green
  paint (0, 0) yellow

theorem rotateOnce : Puzzle
    [[arrow .red .n, plain .red]]
    [[arrow .red .e, plain .red]] := by
  rotate (0, 0)

theorem rotateThrice : Puzzle
    [[arrow .red .n, plain .red]]
    [[arrow .red .w, plain .red]] := by
  rotate (0, 0)
  rotate (0, 0)
  rotate (0, 0)

theorem swapCarriesArrowAndPaint : Puzzle
    [[arrow .green .s, plain .blue]]
    [[plain .blue, arrow .blue .w]] := by
  paint (0, 0) blue
  swap (0, 0) (0, 1)
  rotate (0, 1)

theorem lockedCellStaysPut : Puzzle
    [[lock .black, plain .green, plain .red]]
    [[lock .black, plain .red, plain .green]] := by
  swap (0, 1) (0, 2)

theorem mixedThreeByThree : Puzzle
    [[arrow .blue .n, plain .red, plain .green],
     [plain .white, lock .black, plain .yellow],
     [plain .purple, plain .orange, arrow .red .w]]
    [[arrow .blue .e, plain .purple, plain .green],
     [plain .white, lock .black, plain .yellow],
     [plain .red, plain .orange, arrow .red .n]] := by
  rotate (0, 0)
  paint (2, 0) red
  swap (0, 1) (2, 0)
  paint (2, 0) purple
  swap (0, 1) (2, 0)
  rotate (2, 2)

def turn : List Move := [.rotate (0, 0), .rotate (0, 1)]
def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 2)]
def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))
def spinAll : List Move := List.map (fun i => .rotate (0, i)) (List.range 3)
def mirror : List Move := List.flatten (List.map flipRow (List.range 2))
def combo : List Move := flipRow 0 ++ ccw 0 2

theorem helperWithoutParameters : Puzzle
    [[arrow .red .n, arrow .blue .s]]
    [[arrow .red .e, arrow .blue .w]] := by
  run turn

theorem helperWithParameters : Puzzle
    [[plain .red, plain .blue, plain .green], [plain .white, plain .black, plain .yellow]]
    [[plain .green, plain .blue, plain .red], [plain .yellow, plain .black, plain .white]] := by
  run flipRow 0
  run flipRow 1

theorem helperWithReplicate : Puzzle
    [[arrow .red .n, plain .blue]]
    [[arrow .red .w, plain .blue]] := by
  run ccw 0 0

theorem helperWithMapAndRange : Puzzle
    [[arrow .red .n, arrow .blue .e, arrow .green .s]]
    [[arrow .red .e, arrow .blue .s, arrow .green .w]] := by
  run spinAll

theorem helperWithFlatten : Puzzle
    [[plain .red, plain .blue, plain .green], [plain .white, plain .black, plain .yellow]]
    [[plain .green, plain .blue, plain .red], [plain .yellow, plain .black, plain .white]] := by
  run mirror

theorem helperWithAppend : Puzzle
    [[arrow .red .n, plain .blue, plain .green]]
    [[plain .green, plain .blue, arrow .red .w]] := by
  run combo

theorem mixedProofAndHelpers : Puzzle
    [[arrow .red .n, plain .blue, plain .green]]
    [[plain .green, plain .red, arrow .red .w]] := by
  run ccw 0 0
  paint (0, 1) red
  swap (0, 0) (0, 2)

/--
info: PP_BOARD {"board":[["B.","B."]],"substeps":[]}
---
info: PP_BOARD {"board":[["R.","B."]],"substeps":[]}
-/
#guard_msgs in
theorem pinnedBoards : Puzzle [[plain .red, plain .blue]] [[plain .red, plain .blue]] := by
  paint (0, 0) blue
  paint (0, 0) red

#print axioms helperWithFlatten
