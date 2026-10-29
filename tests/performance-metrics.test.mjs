import assert from "node:assert/strict";
import test from "node:test";
let metrics = {};
try { metrics = await import("../scripts/performance/metrics.mjs"); } catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const sample = (idle,user,available=400,ref="qa") => `node_cpu_seconds_total{supabase_project_ref="${ref}",service_type="db",cpu="0",mode="idle"} ${idle}
node_cpu_seconds_total{supabase_project_ref="${ref}",service_type="db",cpu="0",mode="user"} ${user}
node_memory_MemTotal_bytes{supabase_project_ref="${ref}",service_type="db"} 1e3
node_memory_MemAvailable_bytes{supabase_project_ref="${ref}",service_type="db"} ${available}
connection_stats_connection_count{supabase_project_ref="${ref}",username="postgres"} 5
connection_stats_connection_count{supabase_project_ref="${ref}",username="authenticator"} 2
max_connections_connection_count{supabase_project_ref="${ref}"} 60`;
function read(text) { assert.equal(typeof metrics.readMetrics,"function"); return metrics.readMetrics(text,"qa"); }
test("CPU percentage uses counter deltas and memory uses available bytes",()=>{
 const a=read(sample(80,20));const b=read(sample(160,40,300));
 assert.equal(metrics.cpuPercent(a,b),20);assert.equal(b.memoryUsedPercent,70);assert.equal(b.connections,7);assert.equal(b.maxConnections,60);
});
test("stale or reset CPU counters remain unknown rather than zero",()=>{
 const a=read(sample(80,20));assert.equal(metrics.cpuPercent(a,a),null);assert.equal(metrics.cpuPercent(a,read(sample(8,2))),null);
});
test("missing resource samples remain unknown",()=>{
 const a=read('# exporter temporarily has no metrics');assert.equal(a.memoryUsedPercent,null);assert.equal(a.connections,null);assert.equal(metrics.cpuPercent(a,a),null);
});
test("metrics from another project are rejected",()=>{assert.throws(()=>read(sample(1,1,400,"production")),/project mismatch/);});

test("Supavisor frontend clients stay separate from PostgreSQL backends",()=>{
 const m=read(sample(1,1)+`
supavisor_connections_active{supabase_project_ref="qa",mode="transaction"} 145
supavisor_connections_active{supabase_project_ref="qa",mode="session"} 1
supavisor_client_joins_fail{supabase_project_ref="qa",mode="transaction"} 7`);
 assert.equal(m.connections,7);assert.equal(m.supavisorClients,146);assert.equal(m.supavisorTransactionClients,145);assert.equal(m.supavisorClientJoinFailures,7);
 assert.equal(read("# missing").supavisorClients,null);
});
