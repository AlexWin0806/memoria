import { LevaPanel, button, folder, useControls, useCreateStore } from 'leva';
import { useEffect, useMemo, useRef } from 'react';
import type { Theme, Vec3 } from '@/core/types';
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

function Panel({ base }: { base: Theme }) {
  const store = useCreateStore();
  const fields = useMemo(() => fieldsOf(base), [base]);
  const initial = useMemo<Values>(() => Object.fromEntries(fields.map((f) => [f.key, f.read(base)])), [fields, base]);
  /** The theme as tuned so far, for the buttons (which are created once). */
  const latest = useRef(base);
  const reset = useRef<() => void>(() => {});

  const [values, set] = useControls(
    () => {
      const groups: Record<string, Schema> = {};
      for (const f of fields) {
        const v = f.read(base);
        const input = typeof v === 'number' ? { ...slider(v, f.label), label: f.label } : { value: v, label: f.label };
        (groups[f.group] ??= {})[f.key] = input as Schema[string];
      }
      const schema: Schema = {
        'Copy JSON': button(() => void navigator.clipboard?.writeText(JSON.stringify(latest.current, null, 2))),
        "Download JSON": button(() => download(latest.current)),
        Reset: button(() => reset.current()),
      };
      for (const [name, group] of Object.entries(groups)) schema[name] = folder(group, { collapsed: name !== 'post' });
      return schema;
    },
    { store },
    [fields, base],
  );

  useEffect(() => {
    reset.current = () => {
      set(initial as Parameters<typeof set>[0]);
      useThemeLab.getState().setOverride(null);
    };
  }, [set, initial]);

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

  return (
    <div style={{ position: 'fixed', top: 10, left: 10, width: 310, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto', zIndex: 60 }}>
      <LevaPanel store={store} fill flat collapsed titleBar={{ title: `Theme Lab: ${base.name}`, drag: false, filter: false }} />
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
