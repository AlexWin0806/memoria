/**
 * What the three states of a place mean, in one line, wherever the palace's state is
 * explained (the survey summary, the results, the Progress view). It informs and nothing
 * else: no points, no badges, and a miss is a place that needs another repair, never a fault.
 */
export function RepairLegend() {
  return (
    <p className="legend" data-testid="repair-legend">
      <span className="legend__state">In ruins</span>: not known yet. <span className="legend__state">Under repair</span>: studied, not yet
      recalled. <span className="legend__state">Restored</span>: recalled.
    </p>
  );
}
