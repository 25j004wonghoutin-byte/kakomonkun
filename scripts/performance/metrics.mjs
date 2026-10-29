function samples(text) {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)/);
    if (!match) continue;
    const value = Number(match[3]); if (!Number.isFinite(value)) continue;
    const labels = {};
    for (const label of (match[2] ?? "").matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g)) labels[label[1]] = JSON.parse(`"${label[2]}"`);
    result.push({ name: match[1], labels, value });
  }
  return result;
}

export function readMetrics(text, projectRef, at = new Date().toISOString()) {
  const values = samples(text);
  for (const row of values) if (row.labels.supabase_project_ref && row.labels.supabase_project_ref !== projectRef) throw Error("Metrics project mismatch");
  const rows = name => values.filter(row => row.name === name);
  const sum = name => { const found = rows(name); return found.length ? found.reduce((n,row)=>n+row.value,0) : null; };
  const gauge = name => rows(name)[0]?.value ?? null;
  const cpu = rows("node_cpu_seconds_total").filter(row => !row.labels.service_type || row.labels.service_type === "db");
  const idle = cpu.filter(row => row.labels.mode === "idle");
  const total = gauge("node_memory_MemTotal_bytes"), available = gauge("node_memory_MemAvailable_bytes");
  const swapTotal = gauge("node_memory_SwapTotal_bytes"), swapFree = gauge("node_memory_SwapFree_bytes");
  return {
    at, cpuTotal: cpu.length ? cpu.reduce((n,row)=>n+row.value,0) : null,
    cpuIdle: idle.length ? idle.reduce((n,row)=>n+row.value,0) : null,
    cpuCount: new Set(cpu.map(row => row.labels.cpu)).size,
    memoryTotal: total, memoryAvailable: available,
    memoryUsedPercent: total > 0 && available !== null ? 100 * (1 - available / total) : null,
    swapUsed: swapTotal !== null && swapFree !== null ? swapTotal - swapFree : null,
    supavisorClients: sum("supavisor_connections_active"),
    supavisorTransactionClients: (()=>{const found=rows("supavisor_connections_active").filter(r=>r.labels.mode==="transaction");return found.length?found.reduce((n,r)=>n+r.value,0):null;})(),
    supavisorClientJoinFailures: sum("supavisor_client_joins_fail"),
    connections: sum("connection_stats_connection_count"), maxConnections: gauge("max_connections_connection_count"),
    cpuPressure: sum("node_pressure_cpu_waiting_seconds_total"), memoryPressure: sum("node_pressure_memory_waiting_seconds_total"),
  };
}

export function cpuPercent(previous, next) {
  if (!previous || previous.cpuTotal === null || next.cpuTotal === null || previous.cpuIdle === null || next.cpuIdle === null || previous.cpuCount !== next.cpuCount) return null;
  const total = next.cpuTotal - previous.cpuTotal, idle = next.cpuIdle - previous.cpuIdle;
  if (total <= 0 || idle < 0 || idle > total) return null;
  return Math.round(10000 * (1 - idle / total)) / 100;
}
