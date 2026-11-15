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

/**
 * What the ruins mean, on a Judge run: one line under the walk label. A judge who is alone
 * with the screen otherwise meets a palace that looks broken, and nothing names the rubble
 * until the legend on the results (QA review 4, issue 1). It is product description, like the
 * legend, and it is not announced again at every stop: it sits outside the live regions.
 */
export function RuinsLine() {
  return (
    <p className="state" data-testid="judge-ruins">
      In ruins: you have not learned these yet. Each place is rebuilt as you study it.
    </p>
  );
}
