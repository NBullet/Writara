const KEY = "writara:draft";
const NAME_KEY = "writara:draft-name";

export interface Draft {
  text: string;
  name: string;
}

export function loadDraft(): Draft | null {
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return null;
    return { text, name: localStorage.getItem(NAME_KEY) ?? "未命名.md" };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(KEY, draft.text);
    localStorage.setItem(NAME_KEY, draft.name);
  } catch {
    // 隐私模式或配额用尽：静默失败，不能因此中断写作。
  }
}
