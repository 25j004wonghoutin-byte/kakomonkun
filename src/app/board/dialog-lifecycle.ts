type ModalDialog = Pick<HTMLDialogElement, "open" | "showModal" | "close">;

export function scheduleBoardDialogOpen(dialog: ModalDialog): () => void {
  let active = true;

  queueMicrotask(() => {
    if (active && !dialog.open) {
      dialog.showModal();
    }
  });

  return () => {
    active = false;
    if (dialog.open) {
      dialog.close();
    }
  };
}
