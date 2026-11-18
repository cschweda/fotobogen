// Characters that show nothing or change the direction text runs in:
// zero-width spaces and joiners, the soft hyphen, the byte-order mark, the
// braille blank, and the bidirectional controls. In a title or an alt text
// that came out of an uploaded file they are at best noise, and at worst a
// way to make a line of text read as something it is not.
// eslint-disable-next-line no-misleading-character-class
const UNSEEN = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff9-\ufffb]/g

/** The text without them. */
export const withoutUnseen = (text: string): string => text.replace(UNSEEN, '')

/** Whether there is anything here to read: at least one letter or digit, in any script. */
export const saysSomething = (text: string): boolean => /[\p{L}\p{N}]/u.test(withoutUnseen(text))
