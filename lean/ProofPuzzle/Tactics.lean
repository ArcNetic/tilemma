import Lean
import ProofPuzzle.Core
import ProofPuzzle.Codec

open Lean Elab Tactic Meta

namespace ProofPuzzle

declare_syntax_cat ppCell
syntax "(" num "," num ")" : ppCell

syntax (name := ppSwap) &"swap " ppCell ppCell : tactic
syntax (name := ppPaint) &"paint " ppCell ident : tactic
syntax (name := ppRotate) &"rotate " ppCell : tactic
syntax (name := ppRun) &"run " ident num* : tactic

structure PuzzleGoal where
  goal : MVarId
  targetExpr : Expr
  boardExpr : Expr
  target : Board
  board : Board

def readPuzzleGoal (ref : Syntax) : TacticM PuzzleGoal := do
  let some goal := (← getUnsolvedGoals).head?
    | throwErrorAt ref "PP_EXTRA_MOVES the board already matches the target"
  let goalType ← whnfR (← instantiateMVars (← goal.getType))
  match goalType.getAppFnArgs with
  | (``Reach, #[t, b]) =>
    return { goal, targetExpr := t, boardExpr := b, target := ← decodeBoard t, board := ← decodeBoard b }
  | _ => throwErrorAt ref "PP_BAD_GOAL expected a goal of the form Reach target board"

def cellPos (stx : Syntax) : TacticM Pos :=
  match stx[1].isNatLit?, stx[3].isNatLit? with
  | some r, some c => return (r, c)
  | _, _ => throwErrorAt stx "PP_SYNTAX expected a cell like (row, col)"

def colorOf (stx : Syntax) : TacticM Color :=
  match colorNames.lookup stx.getId with
  | some c => return c
  | none => throwErrorAt stx m!"PP_BAD_COLOR unknown color {stx.getId}"

def advance (pg : PuzzleGoal) (next : Board) (proofOf : Expr → Expr → MetaM Expr) : TacticM Unit := do
  let nextExpr := toExpr next
  let rest ← mkFreshExprSyntheticOpaqueMVar (mkApp2 (mkConst ``Reach) pg.targetExpr nextExpr)
  pg.goal.assign (← proofOf nextExpr rest)
  if next == pg.target then
    rest.mvarId!.assign (mkApp (mkConst ``Reach.done) pg.targetExpr)
    replaceMainGoal []
  else
    replaceMainGoal [rest.mvarId!]

def runMove (ref : Syntax) (m : Move) : TacticM Unit := do
  let pg ← readPuzzleGoal ref
  if let some issue := explainIllegal m pg.board then
    throwErrorAt ref m!"PP_ILLEGAL {issueJson issue none []}"
  let next := step m pg.board
  logInfoAt ref m!"PP_BOARD {stateJson next []}"
  advance pg next fun nextExpr rest => do
    return mkAppN (mkConst ``Reach.step)
      #[pg.targetExpr, toExpr m, pg.boardExpr, nextExpr,
        ← mkEqRefl (toExpr true), ← mkEqRefl nextExpr, rest]

def walkMoves (ref : Syntax) : Nat → List Move → Board → List Board → TacticM (Board × List Board)
  | _, [], bd, trail => return (bd, trail.reverse)
  | k, m :: ms, bd, trail =>
    match explainIllegal m bd with
    | some issue => throwErrorAt ref m!"PP_ILLEGAL {issueJson issue (some k) trail.reverse}"
    | none =>
      let bd' := step m bd
      walkMoves ref (k + 1) ms bd' (bd' :: trail)

def helperCall (helper : Syntax) (args : Array Syntax) : TacticM Term :=
  let fn : Term := ⟨helper⟩
  let argTerms : Array Term := args.map (⟨·⟩)
  if argTerms.isEmpty then pure fn else `($fn $argTerms*)

def runHelper (ref helper : Syntax) (args : Array Syntax) : TacticM Unit := do
  let pg ← readPuzzleGoal ref
  let listOfMoves := mkApp (mkConst ``List [Level.zero]) (mkConst ``Move)
  let movesExpr ← instantiateMVars (← elabTermEnsuringType (← helperCall helper args) listOfMoves)
  if movesExpr.hasMVar then
    throwErrorAt ref "PP_HELPER could not fully elaborate the helper call"
  let moves ← decodeMoves movesExpr
  let (next, trail) ← walkMoves ref 0 moves pg.board []
  logInfoAt ref m!"PP_BOARD {stateJson next trail}"
  advance pg next fun nextExpr rest => do
    let reached := mkApp2 (mkConst ``Option.some [Level.zero]) (mkConst ``Board) nextExpr
    return mkAppN (mkConst ``Reach.steps)
      #[pg.targetExpr, movesExpr, pg.boardExpr, nextExpr, ← mkEqRefl reached, rest]

@[tactic ppSwap] def evalSwap : Tactic := fun stx => do
  runMove stx (.swap (← cellPos stx[1]) (← cellPos stx[2]))

@[tactic ppPaint] def evalPaint : Tactic := fun stx => do
  runMove stx (.paint (← cellPos stx[1]) (← colorOf stx[2]))

@[tactic ppRotate] def evalRotate : Tactic := fun stx => do
  runMove stx (.rotate (← cellPos stx[1]))

@[tactic ppRun] def evalRun : Tactic := fun stx =>
  runHelper stx stx[1] stx[2].getArgs

end ProofPuzzle
