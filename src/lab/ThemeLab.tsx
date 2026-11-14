import { LevaPanel, folder, useControls, useCreateStore } from 'leva';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Theme, Vec3 } from '@/core/types';
import { useSession } from '@/state/session';
import { useSettings } from '@/state/settings';
import { useThemeLab } from '@/state/themeLab';
import { getTheme } from '@/themes';

type Schema = Parameters<typeof folder>[0];
type Value = string | number | Vec3;
type Values = Record<string, Value>;

/** One editable token: where it lives in the theme, and how the panel shows it. */
interface Field {
  key: string;
  label: string;
  group: string;
  read: (t: Theme) => Value;
  write: (t: Theme, v: Value) => void;
}

const DEBOUNCE_MS = 120;

function slider(value: number, key: string) {
  // `quality` is the cost knob every style may expose: an integer level.
  if (key === 'quality') return { value, min: 0, max: 2, step: 1 };
  const span = value === 0 ? 1 : Math.abs(value) * 3;
  const min = value < 0 ? -span : 0;
  const step = Number(((span - min) / 300).toPrecision(1));
  return { value, min, max: span, step };
}

/** Every token of a theme, flattened. Leva keys are global, so each gets a unique one. */
function fieldsOf(base: Theme): Field[] {
  const fields: Field[] = [];
  const add = (group: string, label: string, read: Field['read'], write: Field['write']) =>
    fields.push({ key: `${group}_${label}`.replace(/[^a-zA-Z0-9_]/g, '_'), label, group, read, write });

  for (const k of ['paper', 'ink', 'inkSoft', 'fog'] as const) {
    add('palette', k, (t) => t.palette[k], (t, v) => void (t.palette[k] = v as string));
  }
  for (const i of [0, 1] as const) {
    add('palette', i === 0 ? 'sky low' : 'sky high', (t) => t.palette.sky[i], (t, v) => void (t.palette.sky[i] = v as string));
  }
  for (const k of Object.keys(base.palette.surfaces) as (keyof Theme['palette']['surfaces'])[]) {
    add('surfaces', k, (t) => t.palette.surfaces[k], (t, v) => void (t.palette.surfaces[k] = v as string));
  }
  for (const k of Object.keys(base.palette.accents) as (keyof Theme['palette']['accents'])[]) {
    add('accents', k, (t) => t.palette.accents[k], (t, v) => void (t.palette.accents[k] = v as string));
  }
  for (const k of ['keyColor', 'fillColor'] as const) {
    add('light', k, (t) => t.light[k], (t, v) => void (t.light[k] = v as string));
  }
  for (const k of ['ambient', 'keyIntensity', 'fillIntensity', 'locusGlow'] as const) {
    add('light', k, (t) => t.light[k], (t, v) => void (t.light[k] = v as number));
  }
  add('light', 'keyDirection', (t) => t.light.keyDirection, (t, v) => void (t.light.keyDirection = [...(v as Vec3)]));
  for (const k of ['near', 'far'] as const) {
    add('fog', k, (t) => t.fog[k], (t, v) => void (t.fog[k] = v as number));
  }
  for (const k of Object.keys(base.post)) {
    add('post', k, (t) => t.post[k], (t, v) => void (t.post[k] = v as number));
  }
  for (const k of ['bg', 'panel', 'fg', 'muted', 'accent', 'success', 'danger'] as const) {
    add('ui', k, (t) => t.ui[k], (t, v) => void (t.ui[k] = v as string));
  }
  add('ui', 'radius', (t) => t.ui.radius, (t, v) => void (t.ui.radius = v as number));
  return fields;
}

function build(base: Theme, fields: Field[], values: Values): Theme {
  const next = structuredClone(base);
  for (const f of fields) {
    const v = values[f.key];
    if (v !== undefined) f.write(next, v);
  }
  return next;
}

function download(theme: Theme) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(theme, null, 2)}\n`], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${theme.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Panel({ base }: { base: Theme }) {
  const store = useCreateStore();
  const fields = useMemo(() => fieldsOf(base), [base]);
  const initial = useMemo<Values>(() => Object.fromEntries(fields.map((f) => [f.key, f.read(base)])), [fields, base]);
  /** The theme as tuned so far, for the buttons. */
  const latest = useRef(base);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  /** Shown when the clipboard is not available, so the JSON can still be selected and copied. */
  const [json, setJson] = useState<string | null>(null);
  // The docked panel's width: the Lab sits beside it, never on top of it.
  const inset = useSession((s) => s.insetRight);

  const [values, set] = useControls(
    () => {
      const groups: Record<string, Schema> = {};
      for (const f of fields) {
        const v = f.read(base);
        const input = typeof v === 'number' ? { ...slider(v, f.label), label: f.label } : { value: v, label: f.label };
        (groups[f.group] ??= {})[f.key] = input as Schema[string];
      }
      const schema: Schema = {};
      for (const [name, group] of Object.entries(groups)) schema[name] = folder(group, { collapsed: name !== 'post' });
      return schema;
    },
    { store },
    [fields, base],
  );

  // Dragging a slider produces a stream of values: hand the scene a new theme object
  // at most every DEBOUNCE_MS. The saved theme is only replaced once something differs.
  useEffect(() => {
    const next = build(base, fields, values as Values);
    latest.current = next;
    const changed = JSON.stringify(next) !== JSON.stringify(base);
    const id = setTimeout(() => useThemeLab.getState().setOverride(changed ? next : null), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [values, base, fields]);

  useEffect(() => () => useThemeLab.getState().setOverride(null), []);

  const copy = async () => {
    const text = JSON.stringify(latest.current, null, 2);
    const ok = await copyText(text);
    setJson(ok ? null : text);
    setStatus(ok ? 'Copied the theme JSON.' : 'The clipboard is not available here. Select the text below and copy it.');
  };
  const save = () => {
    download(latest.current);
    setStatus(`Downloaded ${latest.current.id}.json.`);
  };
  const reset = () => {
    set(initial as Parameters<typeof set>[0]);
    latest.current = base;
    useThemeLab.getState().setOverride(null);
    setJson(null);
    setStatus('Reset to the saved theme.');
  };

  /*
   * The three actions are plain buttons outside Leva, so they are on screen and clickable
   * whether its panel is folded or not (inside Leva they were hidden with the folded panel).
   * Key presses stop here: a key pressed while the Lab has the focus must not also advance
   * the walk or answer a question behind it.
   */
  return (
    <div className="lab" data-lab style={{ right: inset + 10 }} onKeyDown={(e) => e.stopPropagation()} data-testid="lab">
      <div className="lab__bar">
        <p className="lab__title">Theme Lab: {base.name}</p>
        <button type="button" className="lab__btn" onClick={() => void copy()} data-testid="lab-copy">
          Copy JSON
        </button>
        <button type="button" className="lab__btn" onClick={save} data-testid="lab-download">
          Download JSON
        </button>
        <button type="button" className="lab__btn" onClick={reset} data-testid="lab-reset">
          Reset
        </button>
        <button type="button" className="lab__btn" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="lab-toggle">
          {open ? 'Hide the tokens' : 'Show the tokens'}
        </button>
        <p className="lab__status" role="status" data-testid="lab-status">
          {status}
        </p>
        {json !== null && <textarea className="lab__btn" readOnly rows={6} value={json} aria-label="Theme JSON" onFocus={(e) => e.target.select()} />}
      </div>
      <LevaPanel
        store={store}
        fill
        flat
        collapsed={{ collapsed: !open, onChange: (collapsed) => setOpen(!collapsed) }}
        titleBar={{ title: 'Tokens', drag: false, filter: false }}
      />
    </div>
  );
}

/**
 * Theme Lab (`?lab`): tune every token of the active theme live, then copy or download
 * the JSON and drop it into `src/themes/`. Starts from the `?theme=` parameter or the
 * saved theme, and starts over when the saved theme changes.
 */
export default function ThemeLab() {
  const themeId = useSettings((s) => s.themeId);
  const base = useMemo(() => getTheme(new URLSearchParams(location.search).get('theme') ?? themeId), [themeId]);
  return <Panel key={base.id} base={base} />;
}
