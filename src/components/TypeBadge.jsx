import { TYPE_STYLE, typeLabel } from '../lib/format.js';

export default function TypeBadge({ type }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_STYLE[type] ?? TYPE_STYLE.unknown}`}>
      {typeLabel(type)}
    </span>
  );
}
