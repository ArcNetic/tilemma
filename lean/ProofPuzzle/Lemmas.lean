import ProofPuzzle.Core

namespace ProofPuzzle

theorem Dir.cw_four (d : Dir) : d.cw.cw.cw.cw = d := by
  cases d <;> rfl

theorem updateNth_id {α : Type} : ∀ (l : List α) (n : Nat), updateNth (fun x => x) l n = l
  | [], _ => rfl
  | _ :: _, 0 => rfl
  | x :: xs, n + 1 => by simp [updateNth, updateNth_id xs n]

theorem updateNth_comp {α : Type} (f g : α → α) :
    ∀ (l : List α) (n : Nat), updateNth f (updateNth g l n) n = updateNth (fun x => f (g x)) l n
  | [], _ => rfl
  | _ :: _, 0 => rfl
  | x :: xs, n + 1 => by simp [updateNth, updateNth_comp f g xs n]

theorem Board.update_comp (bd : Board) (p : Pos) (f g : Cell → Cell) :
    (bd.update p g).update p f = bd.update p (fun c => f (g c)) := by
  unfold Board.update
  rw [updateNth_comp]
  congr
  funext row
  rw [updateNth_comp]

theorem Board.update_id (bd : Board) (p : Pos) : bd.update p (fun c => c) = bd := by
  unfold Board.update
  have inner : (fun row : List Cell => updateNth (fun c => c) row p.2) = fun row => row := by
    funext row
    exact updateNth_id row p.2
  rw [inner]
  exact updateNth_id bd p.1

theorem perform_paint_idempotent (a : Pos) (c : Color) (bd : Board) :
    perform (.paint a c) (perform (.paint a c) bd) = perform (.paint a c) bd := by
  simp only [perform]
  rw [Board.update_comp]

theorem Cell.turn_four (c : Cell) : c.turn.turn.turn.turn = c := by
  cases c with
  | mk color dir locked =>
    cases dir with
    | none => rfl
    | some d => simp [Cell.turn, Dir.cw_four]

theorem perform_rotate_four (a : Pos) (bd : Board) :
    perform (.rotate a) (perform (.rotate a) (perform (.rotate a) (perform (.rotate a) bd))) = bd := by
  simp only [perform, Board.update_comp, Cell.turn_four]
  exact Board.update_id bd a

theorem explainIllegal_none_iff (m : Move) (bd : Board) :
    explainIllegal m bd = none ↔ legal m bd = true := by
  simp [legal]

theorem applyAll_nil (bd : Board) : applyAll [] bd = some bd := rfl

theorem applyAll_append (xs ys : List Move) (bd : Board) :
    applyAll (xs ++ ys) bd = (applyAll xs bd).bind (applyAll ys) := by
  induction xs generalizing bd with
  | nil => rfl
  | cons m ms ih =>
    simp only [List.cons_append, applyAll]
    cases legal m bd
    · rfl
    · exact ih _

theorem swap_involutive_2x2 :
    let bd : Board := [[⟨.red, none, false⟩, ⟨.blue, some .n, false⟩], [⟨.green, none, false⟩, ⟨.white, none, true⟩]]
    step (.swap (0, 0) (0, 1)) (step (.swap (0, 0) (0, 1)) bd) = bd := by
  decide

theorem swap_involutive_3x3 :
    let bd : Board :=
      [[⟨.red, none, false⟩, ⟨.blue, some .n, false⟩, ⟨.black, none, false⟩],
       [⟨.green, some .e, false⟩, ⟨.white, none, true⟩, ⟨.yellow, none, false⟩],
       [⟨.purple, none, false⟩, ⟨.orange, some .s, false⟩, ⟨.red, none, false⟩]]
    step (.swap (0, 0) (2, 1)) (step (.swap (0, 0) (2, 1)) bd) = bd := by
  decide

end ProofPuzzle
