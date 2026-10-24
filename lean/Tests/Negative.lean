import ProofPuzzle
open ProofPuzzle Move Color

abbrev Puzzle (start target : Board) : Prop := Reach target start

def plain (c : Color) : Cell := ⟨c, none, false⟩
def arrow (c : Color) (d : Dir) : Cell := ⟨c, some d, false⟩
def lock (c : Color) : Cell := ⟨c, none, true⟩

def badRotation : List Move := [.rotate (0, 0), .rotate (0, 1)]
def hugeHelper : List Move := List.replicate 90 (.rotate (0, 0))

/--
error: PP_ILLEGAL {"reason":"LOCKED","cells":[[0,1]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem swapLockedCell : Puzzle [[plain .red, lock .black]] [[plain .black, plain .red]] := by
  swap (0, 0) (0, 1)

/--
error: PP_ILLEGAL {"reason":"OUT_OF_BOUNDS","cells":[[2,1]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem swapOutOfBounds : Puzzle [[plain .red, plain .blue]] [[plain .blue, plain .red]] := by
  swap (0, 0) (2, 1)

/--
error: PP_ILLEGAL {"reason":"SAME_CELL","cells":[[0,1]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem swapSameCell : Puzzle [[plain .red, plain .blue]] [[plain .blue, plain .red]] := by
  swap (0, 1) (0, 1)

/--
error: PP_ILLEGAL {"reason":"LOCKED","cells":[[0,0],[0,1]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem swapBothLocked : Puzzle [[lock .red, lock .blue]] [[plain .blue, plain .red]] := by
  swap (0, 0) (0, 1)

/--
error: PP_ILLEGAL {"reason":"LOCKED","cells":[[0,0]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem paintLockedCell : Puzzle [[lock .red, plain .blue]] [[plain .green, plain .blue]] := by
  paint (0, 0) green

/--
error: PP_ILLEGAL {"reason":"OUT_OF_BOUNDS","cells":[[1,0]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem paintOutOfBounds : Puzzle [[plain .red]] [[plain .green]] := by
  paint (1, 0) green

/--
error: PP_ILLEGAL {"reason":"LOCKED","cells":[[0,0]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem rotateLockedCell : Puzzle [[⟨.red, some .n, true⟩]] [[arrow .red .e]] := by
  rotate (0, 0)

/--
error: PP_ILLEGAL {"reason":"OUT_OF_BOUNDS","cells":[[0,4]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem rotateOutOfBounds : Puzzle [[arrow .red .n]] [[arrow .red .e]] := by
  rotate (0, 4)

/--
error: PP_ILLEGAL {"reason":"NOT_ROTATABLE","cells":[[0,0]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem rotateWithoutArrow : Puzzle [[plain .red]] [[arrow .red .e]] := by
  rotate (0, 0)

/--
info: PP_BOARD {"board":[["G.","B.#","R."]],"substeps":[]}
---
error: PP_ILLEGAL {"reason":"LOCKED","cells":[[0,1]],"substep":null,"substeps":[]}
-/
#guard_msgs in
theorem failureAfterValidMoves : Puzzle [[plain .red, lock .blue, plain .green]] [[plain .green, plain .blue, plain .red]] := by
  swap (0, 0) (0, 2)
  swap (0, 1) (0, 2)
  swap (0, 0) (0, 2)

/--
error: PP_ILLEGAL {"reason":"NOT_ROTATABLE","cells":[[0,1]],"substep":1,"substeps":[[["R>","B."]]]}
-/
#guard_msgs in
theorem helperIllegalSubstep : Puzzle [[arrow .red .n, plain .blue]] [[arrow .red .s, plain .blue]] := by
  run badRotation

/--
error: PP_ILLEGAL {"reason":"NOT_ROTATABLE","cells":[[0,0]],"substep":0,"substeps":[]}
-/
#guard_msgs in
theorem helperWithBadFirstSubstep : Puzzle [[plain .red, plain .blue]] [[plain .blue, plain .red]] := by
  run badRotation

/--
error: PP_TOO_LONG list exceeds the allowed length
-/
#guard_msgs in
theorem helperTooLong : Puzzle [[arrow .red .n]] [[arrow .red .n]] := by
  run hugeHelper

/--
info: PP_BOARD {"board":[["B.","R."]],"substeps":[]}
---
error: PP_EXTRA_MOVES the board already matches the target
-/
#guard_msgs in
theorem extraMoves : Puzzle [[plain .red, plain .blue]] [[plain .blue, plain .red]] := by
  swap (0, 0) (0, 1)
  swap (0, 0) (0, 1)

/--
info: PP_BOARD {"board":[["G.","B."]],"substeps":[]}
---
error: unsolved goals
⊢ Reach [[plain green, plain green]]
    [[{ color := green, dir := none, locked := false }, { color := blue, dir := none, locked := false }]]
-/
#guard_msgs in
theorem incompleteProof : Puzzle [[plain .red, plain .blue]] [[plain .green, plain .green]] := by
  paint (0, 0) green

/--
error: PP_BAD_COLOR unknown color pink
-/
#guard_msgs in
theorem unknownColorName : Puzzle [[plain .red]] [[plain .green]] := by
  paint (0, 0) pink

/--
error: PP_BAD_GOAL expected a goal of the form Reach target board
-/
#guard_msgs in
theorem wrongGoalShape : True := by
  swap (0, 0) (0, 1)
