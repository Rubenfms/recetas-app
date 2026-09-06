function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export const log = {
  info(msg: string): void {
    console.log(`[${stamp()}] ${msg}`);
  },
  step(msg: string): void {
    console.log(`\n[${stamp()}] ── ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`[${stamp()}] AVISO  ${msg}`);
  },
  error(msg: string): void {
    console.error(`[${stamp()}] ERROR  ${msg}`);
  },
  plain(msg = ''): void {
    console.log(msg);
  },
};

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Progreso con ETA. La ETA se calcula solo con las peticiones que han ido a la
 * red: las que salen de caché son instantáneas y falsearían la estimación.
 */
export class Progress {
  private readonly startedAt = Date.now();
  private networkDone = 0;
  private done = 0;

  constructor(
    private readonly total: number,
    private readonly label: string,
    private readonly every = 25,
  ) {}

  tick(fromNetwork: boolean, note = ''): void {
    this.done += 1;
    if (fromNetwork) this.networkDone += 1;
    if (this.done % this.every !== 0 && this.done !== this.total) return;

    const elapsed = Date.now() - this.startedAt;
    const remainingNetwork = Math.max(
      0,
      Math.round(((this.total - this.done) * this.networkDone) / Math.max(1, this.done)),
    );
    const eta =
      this.networkDone > 0
        ? formatDuration((elapsed / this.networkDone) * remainingNetwork)
        : 'ya';
    const pct = ((this.done / this.total) * 100).toFixed(1);
    log.info(
      `${this.label} ${this.done}/${this.total} (${pct}%) · red ${this.networkDone} · ` +
        `caché ${this.done - this.networkDone} · faltan ~${eta}${note ? ` · ${note}` : ''}`,
    );
  }
}
