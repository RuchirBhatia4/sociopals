/** Ask the open chat to scroll to a message (loading older history if needed). */
export const JUMP_EVENT = "sociopals:jump";
export const jumpToMessage = (messageId: string) => {
  window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: messageId }));
};

/** Scroll to a message already on screen and make it glow. Returns false if it isn't loaded. */
export const flashMessage = (messageId: string) => {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash-highlight");
  void el.offsetWidth;
  el.classList.add("flash-highlight");
  setTimeout(() => el.classList.remove("flash-highlight"), 1700);
  return true;
};
