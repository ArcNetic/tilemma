import ProofPuzzle
open ProofPuzzle Move Color

set_option maxHeartbeats 200000
set_option maxRecDepth 2000

namespace L01
theorem solutionL01 : Reach
    [[⟨.green, none, false⟩, ⟨.red, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, none, false⟩]] := by
  swap (0, 0) (0, 1)
  swap (1, 0) (1, 1)

#print axioms solutionL01

end L01

namespace L02
theorem solutionL02 : Reach
    [[⟨.green, none, false⟩, ⟨.red, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.red, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.blue, none, false⟩]] := by
  paint (0, 0) green
  paint (1, 1) yellow

#print axioms solutionL02

end L02

namespace L03
theorem solutionL03 : Reach
    [[⟨.red, some .e, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, some .s, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, some .e, false⟩]] := by
  rotate (0, 0)
  rotate (1, 1)

#print axioms solutionL03

end L03

namespace L04
theorem solutionL04 : Reach
    [[⟨.red, some .e, false⟩, ⟨.green, none, false⟩, ⟨.green, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.white, none, false⟩, ⟨.red, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩]] := by
  rotate (0, 0)
  paint (1, 1) blue
  swap (0, 2) (2, 0)

#print axioms solutionL04

end L04

namespace L05
theorem solutionL05 : Reach
    [[⟨.blue, none, false⟩, ⟨.green, none, true⟩, ⟨.red, some .n, false⟩],
      [⟨.yellow, none, false⟩, ⟨.red, some .s, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, none, false⟩, ⟨.green, none, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, true⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.red, some .e, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, none, false⟩, ⟨.white, none, false⟩]] := by
  swap (0, 0) (0, 2)
  rotate (1, 1)
  paint (2, 2) green

#print axioms solutionL05

end L05

namespace L06
theorem solutionL06 : Reach
    [[⟨.yellow, none, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.green, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.blue, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.white, none, false⟩, ⟨.red, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩]] := by
  paint (0, 0) blue
  swap (0, 0) (2, 2)
  swap (0, 1) (1, 2)
  paint (1, 1) green

#print axioms solutionL06

end L06

namespace L07
theorem solutionL07 : Reach
    [[⟨.red, some .e, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.white, some .s, false⟩, ⟨.blue, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.red, none, false⟩, ⟨.red, some .s, false⟩, ⟨.white, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.red, none, true⟩, ⟨.green, none, false⟩, ⟨.white, some .w, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.white, some .e, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, some .s, false⟩, ⟨.white, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, true⟩, ⟨.green, none, false⟩, ⟨.blue, some .w, false⟩]] := by
  rotate (0, 0)
  rotate (1, 1)
  swap (0, 3) (3, 0)
  paint (2, 2) red
  swap (1, 2) (2, 1)
  paint (3, 3) white

#print axioms solutionL07

end L07

namespace L08
def turn : List Move := [.rotate (0, 0), .rotate (1, 1)]

theorem solutionL08 : Reach
    [[⟨.red, some .w, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.green, some .n, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩, ⟨.white, none, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.green, some .e, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, none, false⟩, ⟨.white, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩]] := by
  run turn
  run turn
  run turn
  swap (2, 2) (3, 3)

#print axioms solutionL08

end L08

namespace L09
def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 3), .swap (r, 1) (r, 2)]

theorem solutionL09 : Reach
    [[⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.green, none, false⟩, ⟨.red, none, false⟩],
      [⟨.green, none, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, none, false⟩, ⟨.green, none, false⟩],
      [⟨.blue, none, false⟩, ⟨.yellow, none, false⟩, ⟨.red, none, false⟩, ⟨.white, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.white, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.yellow, none, false⟩, ⟨.blue, none, false⟩]] := by
  run flipRow 0
  run flipRow 1
  run flipRow 2
  run flipRow 3

#print axioms solutionL09

end L09

namespace L10
def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))

theorem solutionL10 : Reach
    [[⟨.red, some .w, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.green, some .n, false⟩, ⟨.red, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, some .e, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.green, some .e, false⟩, ⟨.red, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, some .s, false⟩]] := by
  run ccw 0 0
  run ccw 1 1
  run ccw 2 2

#print axioms solutionL10

end L10

namespace L11
def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]
def mirror : List Move := List.flatten (List.map flipRow (List.range 5))
def half (r c : Nat) : List Move := List.replicate 2 (.rotate (r, c))

theorem solutionL11 : Reach
    [[⟨.white, none, false⟩, ⟨.yellow, none, false⟩, ⟨.black, none, false⟩, ⟨.green, none, false⟩, ⟨.red, some .s, false⟩],
      [⟨.black, none, false⟩, ⟨.green, none, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.white, none, false⟩, ⟨.white, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩, ⟨.red, none, false⟩, ⟨.white, none, false⟩],
      [⟨.yellow, some .n, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.green, none, false⟩, ⟨.black, none, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩, ⟨.white, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩, ⟨.green, none, false⟩, ⟨.black, none, false⟩],
      [⟨.green, none, false⟩, ⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.green, none, false⟩],
      [⟨.black, none, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩, ⟨.yellow, some .s, false⟩]] := by
  run mirror
  run half 0 4
  run half 4 0
  paint (2, 2) white
  paint (0, 2) black

#print axioms solutionL11

end L11

namespace L12
def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]
def mirror : List Move := List.flatten (List.map flipRow (List.range 5))
def diag : List Move := List.map (fun i => .rotate (i, i)) (List.range 5)
def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))

theorem solutionL12 : Reach
    [[⟨.white, some .e, false⟩, ⟨.yellow, none, false⟩, ⟨.blue, none, true⟩, ⟨.green, none, false⟩, ⟨.red, some .n, false⟩],
      [⟨.black, none, false⟩, ⟨.red, none, false⟩, ⟨.red, none, false⟩, ⟨.blue, some .s, false⟩, ⟨.yellow, none, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, none, false⟩, ⟨.blue, some .e, false⟩, ⟨.white, none, false⟩, ⟨.green, none, false⟩],
      [⟨.green, none, false⟩, ⟨.blue, some .n, false⟩, ⟨.yellow, none, false⟩, ⟨.green, some .s, false⟩, ⟨.white, none, false⟩],
      [⟨.red, some .s, false⟩, ⟨.red, none, false⟩, ⟨.blue, none, false⟩, ⟨.green, none, false⟩, ⟨.black, none, false⟩]]
    [[⟨.red, some .n, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, true⟩, ⟨.yellow, none, false⟩, ⟨.white, some .e, false⟩],
      [⟨.yellow, none, false⟩, ⟨.blue, some .e, false⟩, ⟨.red, none, false⟩, ⟨.green, some .s, false⟩, ⟨.black, none, false⟩],
      [⟨.green, none, false⟩, ⟨.white, none, false⟩, ⟨.red, some .n, false⟩, ⟨.blue, none, false⟩, ⟨.yellow, none, false⟩],
      [⟨.white, none, false⟩, ⟨.red, none, false⟩, ⟨.yellow, none, false⟩, ⟨.blue, some .w, false⟩, ⟨.green, none, false⟩],
      [⟨.black, none, false⟩, ⟨.green, none, false⟩, ⟨.blue, none, false⟩, ⟨.red, none, false⟩, ⟨.yellow, some .e, false⟩]] := by
  run diag
  run mirror
  run ccw 0 4
  swap (1, 1) (3, 3)
  paint (2, 2) blue
  paint (4, 0) red

#print axioms solutionL12

end L12
