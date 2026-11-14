import { openCompare } from './store';
import './ab.css';

/** The quiet entry on the title screen. `?compare` opens the same thing. */
export function CompareLink() {
  return (
    <p className="ab-entry">
      <button type="button" className="link" onClick={openCompare} data-testid="title-compare">
        Compare: list against palace
      </button>
    </p>
  );
}
