namespace ProofPuzzle

inductive Color where
  | red | green | blue | yellow | purple | orange | white | black
  deriving DecidableEq, Repr, Inhabited

inductive Dir where
  | n | e | s | w
  deriving DecidableEq, Repr, Inhabited

structure Cell where
  color : Color
  dir : Option Dir
  locked : Bool
  deriving DecidableEq, Repr, Inhabited

abbrev Pos := Nat × Nat

abbrev Board := List (List Cell)

inductive Move where
  | swap (a b : Pos)
  | paint (a : Pos) (c : Color)
  | rotate (a : Pos)
  deriving DecidableEq, Repr, Inhabited

inductive Reason where
  | outOfBounds | sameCell | locked | notRotatable
  deriving DecidableEq, Repr, Inhabited

abbrev Issue := Reason × List Pos

def Dir.cw : Dir → Dir
  | .n => .e
  | .e => .s
  | .s => .w
  | .w => .n

def Cell.turn (c : Cell) : Cell :=
  { c with dir := c.dir.map Dir.cw }

def nth? {α : Type} : List α → Nat → Option α
  | [], _ => none
  | x :: _, 0 => some x
  | _ :: xs, n + 1 => nth? xs n

def updateNth {α : Type} (f : α → α) : List α → Nat → List α
  | [], _ => []
  | x :: xs, 0 => f x :: xs
  | x :: xs, n + 1 => x :: updateNth f xs n

def Board.cell? (bd : Board) (p : Pos) : Option Cell :=
  match nth? bd p.1 with
  | some row => nth? row p.2
  | none => none

def Board.update (bd : Board) (p : Pos) (f : Cell → Cell) : Board :=
  updateNth (fun row => updateNth f row p.2) bd p.1

def Board.put (bd : Board) (p : Pos) (c : Cell) : Board :=
  bd.update p fun _ => c

def samePos (a b : Pos) : Bool :=
  a.1.beq b.1 && a.2.beq b.2

def isOutside (bd : Board) (p : Pos) : Bool :=
  (bd.cell? p).isNone

def isLocked (bd : Board) (p : Pos) : Bool :=
  match bd.cell? p with
  | some c => c.locked
  | none => false

def isFixedDirection (bd : Board) (p : Pos) : Bool :=
  match bd.cell? p with
  | some ⟨_, none, _⟩ => true
  | _ => false

def flagCells (reason : Reason) (bad : Pos → Bool) (ps : List Pos) : Option Issue :=
  match ps.filter bad with
  | [] => none
  | hit => some (reason, hit)

def firstIssue : List (Option Issue) → Option Issue
  | [] => none
  | some i :: _ => some i
  | none :: rest => firstIssue rest

def explainIllegal : Move → Board → Option Issue
  | .swap a b, bd => firstIssue
      [ flagCells .outOfBounds (isOutside bd) [a, b]
      , flagCells .sameCell (fun _ => samePos a b) [a]
      , flagCells .locked (isLocked bd) [a, b] ]
  | .paint a _, bd => firstIssue
      [ flagCells .outOfBounds (isOutside bd) [a]
      , flagCells .locked (isLocked bd) [a] ]
  | .rotate a, bd => firstIssue
      [ flagCells .outOfBounds (isOutside bd) [a]
      , flagCells .locked (isLocked bd) [a]
      , flagCells .notRotatable (isFixedDirection bd) [a] ]

def legal (m : Move) (bd : Board) : Bool :=
  (explainIllegal m bd).isNone

def perform : Move → Board → Board
  | .swap a b, bd =>
    match bd.cell? a, bd.cell? b with
    | some x, some y => (bd.put a y).put b x
    | _, _ => bd
  | .paint a c, bd => bd.update a fun cell => { cell with color := c }
  | .rotate a, bd => bd.update a Cell.turn

def step (m : Move) (bd : Board) : Board :=
  match legal m bd with
  | true => perform m bd
  | false => bd

def applyAll : List Move → Board → Option Board
  | [], bd => some bd
  | m :: ms, bd =>
    match legal m bd with
    | true => applyAll ms (step m bd)
    | false => none

inductive Reach (t : Board) : Board → Prop where
  | done : Reach t t
  | step (m : Move) (b b' : Board) :
      legal m b = true → ProofPuzzle.step m b = b' → Reach t b' → Reach t b
  | steps (ms : List Move) (b b' : Board) :
      applyAll ms b = some b' → Reach t b' → Reach t b

end ProofPuzzle
