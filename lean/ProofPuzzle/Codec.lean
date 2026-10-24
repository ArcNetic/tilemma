import Lean
import ProofPuzzle.Core

open Lean Meta

namespace ProofPuzzle

deriving instance ToExpr for Color
deriving instance ToExpr for Dir
deriving instance ToExpr for Cell
deriving instance ToExpr for Move

def Color.code : Color → Char
  | .red => 'R'
  | .green => 'G'
  | .blue => 'B'
  | .yellow => 'Y'
  | .purple => 'P'
  | .orange => 'O'
  | .white => 'W'
  | .black => 'K'

def directionCode : Option Dir → Char
  | none => '.'
  | some .n => '^'
  | some .e => '>'
  | some .s => 'v'
  | some .w => '<'

def Cell.code (c : Cell) : String :=
  String.ofList ([c.color.code, directionCode c.dir] ++ if c.locked then ['#'] else [])

def Reason.code : Reason → String
  | .outOfBounds => "OUT_OF_BOUNDS"
  | .sameCell => "SAME_CELL"
  | .locked => "LOCKED"
  | .notRotatable => "NOT_ROTATABLE"

def jsonArray (items : List String) : String :=
  "[" ++ ",".intercalate items ++ "]"

def boardJson (bd : Board) : String :=
  jsonArray (bd.map fun row => jsonArray (row.map fun c => "\"" ++ c.code ++ "\""))

def posJson (p : Pos) : String :=
  jsonArray [toString p.1, toString p.2]

def stateJson (bd : Board) (substeps : List Board) : String :=
  "{\"board\":" ++ boardJson bd ++ ",\"substeps\":" ++ jsonArray (substeps.map boardJson) ++ "}"

def issueJson (issue : Issue) (substep : Option Nat) (reached : List Board) : String :=
  "{\"reason\":\"" ++ issue.1.code ++ "\",\"cells\":" ++ jsonArray (issue.2.map posJson) ++
    ",\"substep\":" ++ (substep.map toString).getD "null" ++
    ",\"substeps\":" ++ jsonArray (reached.map boardJson) ++ "}"

def colorNames : List (Name × Color) :=
  [(`red, .red), (`green, .green), (`blue, .blue), (`yellow, .yellow),
   (`purple, .purple), (`orange, .orange), (`white, .white), (`black, .black)]

def decodeFailure {α : Type} (what : String) (e : Expr) : MetaM α :=
  throwError m!"PP_DECODE cannot read {what} from {e}"

partial def decodeNat (e : Expr) : MetaM Nat := do
  let e ← whnf e
  if let some n := e.rawNatLit? then return n
  match e.getAppFnArgs with
  | (``Nat.zero, _) => return 0
  | (``Nat.succ, #[x]) => return (← decodeNat x) + 1
  | (``OfNat.ofNat, #[_, x, _]) => decodeNat x
  | _ => decodeFailure "a number" e

def decodeBool (e : Expr) : MetaM Bool := do
  match (← whnf e).constName? with
  | some ``Bool.true => return true
  | some ``Bool.false => return false
  | _ => decodeFailure "a boolean" e

def decodeColor (e : Expr) : MetaM Color := do
  match (← whnf e).constName? with
  | some ``Color.red => return .red
  | some ``Color.green => return .green
  | some ``Color.blue => return .blue
  | some ``Color.yellow => return .yellow
  | some ``Color.purple => return .purple
  | some ``Color.orange => return .orange
  | some ``Color.white => return .white
  | some ``Color.black => return .black
  | _ => decodeFailure "a color" e

def decodeDir (e : Expr) : MetaM Dir := do
  match (← whnf e).constName? with
  | some ``Dir.n => return .n
  | some ``Dir.e => return .e
  | some ``Dir.s => return .s
  | some ``Dir.w => return .w
  | _ => decodeFailure "a direction" e

def decodeOption {α : Type} (decodeItem : Expr → MetaM α) (e : Expr) : MetaM (Option α) := do
  let e' ← whnf e
  match e'.getAppFnArgs with
  | (``Option.none, _) => return none
  | (``Option.some, #[_, x]) => return some (← decodeItem x)
  | _ => decodeFailure "an option" e

def decodeList {α : Type} (decodeItem : Expr → MetaM α) : Nat → Expr → MetaM (List α)
  | 0, _ => throwError "PP_TOO_LONG list exceeds the allowed length"
  | fuel + 1, e => do
    let e' ← whnf e
    match e'.getAppFnArgs with
    | (``List.nil, _) => return []
    | (``List.cons, #[_, h, t]) => return (← decodeItem h) :: (← decodeList decodeItem fuel t)
    | _ => decodeFailure "a list" e

def decodePos (e : Expr) : MetaM Pos := do
  let e' ← whnf e
  match e'.getAppFnArgs with
  | (``Prod.mk, #[_, _, r, c]) => return (← decodeNat r, ← decodeNat c)
  | _ => decodeFailure "a position" e

def decodeCell (e : Expr) : MetaM Cell := do
  let e' ← whnf e
  match e'.getAppFnArgs with
  | (``Cell.mk, #[c, d, l]) => return ⟨← decodeColor c, ← decodeOption decodeDir d, ← decodeBool l⟩
  | _ => decodeFailure "a cell" e

def maxSide : Nat := 6

def maxHelperMoves : Nat := 64

def decodeBoard (e : Expr) : MetaM Board :=
  decodeList (decodeList decodeCell (maxSide + 1)) (maxSide + 1) e

def decodeMove (e : Expr) : MetaM Move := do
  let e' ← whnf e
  match e'.getAppFnArgs with
  | (``Move.swap, #[a, b]) => return .swap (← decodePos a) (← decodePos b)
  | (``Move.paint, #[a, c]) => return .paint (← decodePos a) (← decodeColor c)
  | (``Move.rotate, #[a]) => return .rotate (← decodePos a)
  | _ => decodeFailure "a move" e

def decodeMoves (e : Expr) : MetaM (List Move) :=
  decodeList decodeMove (maxHelperMoves + 1) e

end ProofPuzzle
