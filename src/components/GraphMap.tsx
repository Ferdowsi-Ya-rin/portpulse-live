import type { GraphData, GraphNode } from '../lib/types';
import { PALETTES, statusColor, type ThemeName } from './theme';

interface Props {
  graph: GraphData;
  theme: ThemeName;
  selectedId?: string | null;
  hoverId?: string | null;
  onSelect?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}

const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

export function GraphMap({ graph, theme, selectedId = null, hoverId = null, onSelect, onHover }: Props) {
  const P = PALETTES[theme];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const focus = hoverId ?? selectedId;
  const related = new Set<string>();
  if (focus) {
    related.add(focus);
    graph.edges.forEach((e) => { if (e.from === focus) related.add(e.to); if (e.to === focus) related.add(e.from); });
  }
  const dim = (id: string) => (focus && !related.has(id) ? 0.28 : 1);
  const fresh = (n: GraphNode) => n.lastSeen !== null && graph.generatedAt - n.lastSeen < 90_000;
  const grid: number[] = [];
  for (let y = 60; y < graph.height; y += 40) grid.push(y);

  return (
    <svg viewBox={`0 0 ${graph.width} ${graph.height}`} role="group" aria-label="Live route graph: data sources on the left feed places on the route on the right" style={{ display: 'block', width: '100%', height: 'auto' }}>
      {/* chart furniture: graticule and a shallow channel */}
      <g stroke={P.line} strokeWidth={1} opacity={P.gridOpacity}>
        {grid.map((y) => <line key={y} x1={0} x2={graph.width} y1={y} y2={y} />)}
        {[200, 400, 600, 800].map((x) => <line key={x} x1={x} x2={x} y1={52} y2={graph.height} />)}
      </g>
      <path d={`M470,52 C560,${graph.height * 0.3} 430,${graph.height * 0.6} 540,${graph.height}`} fill="none" stroke={P.channel} strokeWidth={140} opacity={0.55} strokeLinecap="round" />

      <text x={390} y={34} textAnchor="end" fontFamily="Newsreader, Georgia, serif" fontSize={18} fontWeight={600} fill={P.ink}>Where the data comes from</text>
      <text x={700} y={34} fontFamily="Newsreader, Georgia, serif" fontSize={18} fontWeight={600} fill={P.ink}>Places on the route</text>
      <line x1={16} x2={graph.width - 16} y1={48} y2={48} stroke={P.line} strokeWidth={1} opacity={0.6} />

      <g fill="none">
        {graph.edges.map((e, i) => {
          const a = byId.get(e.from)!, b = byId.get(e.to)!;
          const involved = !focus || e.from === focus || e.to === focus;
          const op = involved ? 1 : 0.07;
          if (e.kind === 'route') {
            const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
            return <path key={i} d={`M${top.x},${top.y + 13} L${bottom.x},${bottom.y - 13}`} stroke={e.live ? P.line : P.none} strokeWidth={2.8} strokeDasharray={e.live ? undefined : '6 6'} opacity={(e.live ? 0.9 : 0.55) * op} />;
          }
          const d = `M${a.x + 9},${a.y} C${a.x + 140},${a.y} ${b.x - 140},${b.y} ${b.x - 13},${b.y}`;
          const base = e.live ? 0.8 : theme === 'night' ? 0.26 : 0.22;
          return (
            <g key={i} opacity={op}>
              <path d={d} stroke={e.live ? P.line : P.none} strokeWidth={e.live ? 1.6 : 0.9} strokeDasharray={e.live ? undefined : '2 5'} opacity={base} />
              {e.live && (
                <circle className="packet" r={2.6} fill={P.ok}>
                  <animateMotion dur={`${3 + (i % 5) * 0.4}s`} begin={`${(i % 7) * 0.35}s`} repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          );
        })}
      </g>

      {graph.nodes.map((n) => {
        const c = statusColor(P, n.status);
        const fill = n.status === 'NO_DATA' ? P.bg : c;
        const dash = n.status === 'NO_DATA' ? '3 3' : undefined;
        const selected = selectedId === n.id;
        const isSource = n.group === 'source';
        const label = `${n.label}: ${n.status === 'ALERT' ? 'alert, ' : ''}${n.detail}`;
        return (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            opacity={dim(n.id)}
            style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
            className="node"
            onClick={() => onSelect?.(selected ? null : n.id)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect?.(selected ? null : n.id); } }}
            onMouseEnter={() => onHover?.(n.id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(n.id)}
            onBlur={() => onHover?.(null)}
          >
            {/* generous invisible hit area */}
            <rect x={isSource ? n.x - 380 : n.x - 20} y={n.y - 19} width={isSource ? 400 : 330} height={38} fill="transparent" />
            {fresh(n) && (
              <circle className="packet" cx={n.x} cy={n.y} r={10} fill="none" stroke={P.ok} strokeWidth={2}>
                <animate attributeName="r" from="10" to="26" dur="1.8s" repeatCount="1" />
                <animate attributeName="opacity" from="0.9" to="0" dur="1.8s" repeatCount="1" />
              </circle>
            )}
            {selected && <circle cx={n.x} cy={n.y} r={19} fill="none" stroke={P.ink} strokeWidth={1.5} strokeDasharray="2 3" />}
            {isSource ? (
              <rect x={n.x - 8} y={n.y - 8} width={16} height={16} rx={2} fill={fill} stroke={c} strokeWidth={2} strokeDasharray={dash} />
            ) : (
              <g>
                <circle cx={n.x} cy={n.y} r={12} fill={fill} stroke={n.status === 'ALERT' ? P.ink : c} strokeWidth={n.status === 'ALERT' ? 3 : 2} strokeDasharray={dash} />
                {n.status === 'ALERT' && <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff">!</text>}
              </g>
            )}
            {isSource ? (
              <g textAnchor="end">
                <text x={n.x - 18} y={n.y - 2} fontSize={14} fontWeight={600} fill={P.ink}>{n.label}</text>
                <text x={n.x - 18} y={n.y + 13} fontSize={12} fill={c}>{clip(n.detail, 46)}</text>
              </g>
            ) : (
              <g>
                <text x={n.x + 22} y={n.y - 2} fontSize={15} fontWeight={600} fill={P.ink}>{n.label}</text>
                <text x={n.x + 22} y={n.y + 14} fontSize={12.5} fill={c}>{clip(n.status === 'ALERT' ? `Alert: ${n.detail}` : n.detail, 34)}</text>
              </g>
            )}
          </g>
        );
      })}
      <text x={16} y={graph.height - 8} fontSize={12.5} fill={P.mute}>Squares are data sources, circles are places. Dashed grey means nothing has been received yet.</text>
    </svg>
  );
}
