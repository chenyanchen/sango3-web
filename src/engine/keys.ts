// Keyboard helpers shared by scenes.

/**
 * Keyboard for the global modal stack (ui/kit modal()): Esc = cancel/back,
 * Enter = primary action. Returns true when a modal is open (the key is then
 * consumed by the dialog and the scene should ignore it).
 */
export function modalKey(e: KeyboardEvent): boolean {
  const backs = document.querySelectorAll('.modal-host .modal-back');
  const top = backs[backs.length - 1];
  if (!top) return false;
  const btns = [...top.querySelectorAll<HTMLButtonElement>('.actions .btn')].filter((b) => !b.disabled);
  if (e.key === 'Escape') {
    const c = btns.find((b) => /^(取消|返回|略过|放弃|拒绝|继续战斗)$|取消|返回/.test((b.textContent ?? '').trim())) ?? (btns.length === 1 ? btns[0] : undefined);
    c?.click();
  } else if (e.key === 'Enter') {
    const p = top.querySelector<HTMLButtonElement>('.actions .btn.primary:not(:disabled)');
    const focused = document.activeElement;
    // a focused button inside the dialog handles Enter natively; anything else (e.g. the
    // menu button that opened the dialog) must not swallow it
    if (p && !(focused instanceof HTMLButtonElement && top.contains(focused))) {
      e.preventDefault();
      if (focused instanceof HTMLElement) focused.blur();
      p.click();
    }
  }
  return true;
}
