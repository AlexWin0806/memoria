import { useId, type ReactNode } from 'react';

export interface PickOption {
  id: string;
  name: string;
  /** One line under the name. */
  blurb?: string;
}

/**
 * A choice of one among a few, set as ruled lines of the page with the chosen one marked in
 * the margin. Native radio buttons underneath, so Tab reaches the group once and the arrow
 * keys move inside it.
 */
export function PickOne({
  legend,
  options,
  value,
  onChange,
  disabled = false,
  testid,
  children,
}: {
  legend: string;
  options: PickOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  testid: string;
  /** Said under the legend, before the options. */
  children?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset className="pick" disabled={disabled} data-testid={testid}>
      <legend className="label">{legend}</legend>
      {children}
      <div className="pick__list">
        {options.map((o) => (
          <label key={o.id} className="pick__opt" data-checked={value === o.id ? 'true' : 'false'}>
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} data-testid={`${testid}-option`} data-option={o.id} />
            <span className="pick__text">
              <span className="pick__name">{o.name}</span>
              {o.blurb && <span className="pick__blurb">{o.blurb}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
