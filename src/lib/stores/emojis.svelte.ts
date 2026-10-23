import { getCustomEmojis } from '#lib/api/gotosocial.ts';
import type { CustomEmoji } from '#lib/api/types.ts';

/**
 * Lazily loaded, instance-wide custom emoji. Shared by the composer picker so
 * switching timelines or opening a reply does not refetch the list.
 */
class EmojiStore {
	items = $state<CustomEmoji[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			const all = await getCustomEmojis();
			// `visible_in_picker` defaults to true; only an explicit false hides it.
			this.items = all.filter((emoji) => emoji.visible_in_picker !== false);
			this.loaded = true;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Emojis konnten nicht geladen werden.';
		} finally {
			this.loading = false;
		}
	}
}

export const customEmoji = new EmojiStore();
