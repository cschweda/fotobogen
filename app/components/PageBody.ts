// Draws the text of a page (shared/page-text.ts). Each piece becomes text or
// one fixed element; nothing typed is ever inserted as HTML. Used on the
// public page and for the preview in the admin. Class names are part of the
// skin contract (docs/SKINS.md).
import { defineComponent, h, type VNodeChild } from 'vue'
import { parsePageText, type Inline } from '~~/shared/page-text'

const pieces = (inline: Inline[]): VNodeChild[] => inline.map((piece) => {
  if ('text' in piece) return piece.text
  if ('bold' in piece) return h('strong', piece.bold)
  if ('italic' in piece) return h('em', piece.italic)
  // A link to somewhere else gives that site no handle on this one.
  return h('a', { href: piece.link, rel: piece.external ? 'noopener' : undefined }, piece.label)
})

export default defineComponent({
  name: 'PageBody',
  props: { text: { type: String, required: true } },
  setup(props) {
    return () => h('div', { class: 'fb-page-body' }, parsePageText(props.text).map((block) => {
      if (block.type === 'heading') return h(`h${block.level}`, pieces(block.inline))
      if (block.type === 'list') return h('ul', block.items.map(item => h('li', pieces(item))))
      // Lines of one paragraph are kept as lines.
      return h('p', block.lines.flatMap((line, index) => index === 0 ? pieces(line) : [h('br'), ...pieces(line)]))
    }))
  },
})
