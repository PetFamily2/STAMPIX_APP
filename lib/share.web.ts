/** Browser sharing remains memory-only; clipboard is an explicit fallback. */
export const Share = {
  async share(content: { message?: string; url?: string; title?: string }) {
    const text = content.message ?? content.url ?? '';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, title: content.title });
        return { action: 'sharedAction' };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return { action: 'dismissedAction' };
        throw error;
      }
    }
    if (!navigator.clipboard?.writeText) throw new Error('SHARING_UNAVAILABLE');
    await navigator.clipboard.writeText(text);
    return { action: 'copiedAction' };
  },
};
