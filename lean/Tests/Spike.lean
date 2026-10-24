import ProofPuzzle
open ProofPuzzle Move Color

set_option maxHeartbeats 200000
set_option maxRecDepth 2000

theorem spikeSolved : Reach
    [[⟨.yellow, none, false⟩, ⟨.blue, none, false⟩], [⟨.green, some .e, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.yellow, none, false⟩], [⟨.green, some .n, false⟩, ⟨.blue, none, false⟩]] := by
  swap (0, 0) (1, 1)
  rotate (1, 0)
  swap (0, 0) (0, 1)

#print axioms spikeSolved

theorem spikeIllegal : Reach
    [[⟨.blue, none, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.blue, none, true⟩]] := by
  swap (0, 0) (0, 1)
  swap (0, 0) (0, 1)

theorem spikeOutOfBounds : Reach
    [[⟨.blue, none, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.blue, none, false⟩]] := by
  swap (0, 0) (2, 1)

theorem spikeIncomplete : Reach
    [[⟨.blue, none, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.green, none, false⟩]] := by
  paint (0, 1) blue

theorem spikeExtra : Reach
    [[⟨.blue, none, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.blue, none, false⟩]] := by
  swap (0, 0) (0, 1)
  swap (0, 0) (0, 1)

def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))
def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 1)]

theorem spikeHelpers : Reach
    [[⟨.blue, some .w, false⟩, ⟨.red, none, false⟩]]
    [[⟨.red, none, false⟩, ⟨.blue, some .n, false⟩]] := by
  run flipRow 0
  run ccw 0 0

#print axioms spikeHelpers
