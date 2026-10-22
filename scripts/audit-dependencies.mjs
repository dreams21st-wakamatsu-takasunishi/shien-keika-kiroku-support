import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function classifyAudit(result) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { return { state: 'unavailable' }; }
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || !['info', 'low', 'moderate', 'high', 'critical', 'total'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) return { state: 'unavailable' };
  // A vulnerability report is never treated as a transient network failure.
  if (counts.high || counts.critical) return { state: 'vulnerable', counts };
  if (result.status !== 0 || result.error) return { state: 'unavailable' };
  return { state: 'passed', counts };
}

export async function auditDependencies(run, pause, log = console.log) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const report = classifyAudit(run());
    if (report.state === 'vulnerable') throw Error('Security audit found High/Critical vulnerabilities: ' + JSON.stringify(report.counts));
    if (report.state === 'passed') { log(JSON.stringify({ audit: 'passed', attempt, vulnerabilities: report.counts })); return report; }
    log('Security audit unavailable (attempt ' + attempt + '/3). No safety result has been assumed.');
    if (attempt < 3) await pause(3000);
  }
  throw Error('Security audit unavailable after 3 attempts. Release remains blocked.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = ['audit', '--json', '--audit-level=high', '--fetch-timeout=20000', '--fetch-retries=0'];
  const run = () => process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', '& npm.cmd ' + args.join(' ')], { encoding: 'utf8', timeout: 30000, maxBuffer: 8388608 })
    : spawnSync('npm', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8388608 });
  try { await auditDependencies(run, ms => new Promise(resolve => setTimeout(resolve, ms))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
