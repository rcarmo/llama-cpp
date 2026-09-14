/** SCRIPT_JDOC:
{"summary":"Abort trial HTTP work and escalate only captured trial subprocess handles after guard failure","kind":"mutating","weight":"lightweight","role":"module"}
*/
export function alive(p: any) { return p && p.exitCode === null && !p.signalCode; }
export async function stopOwned(p: any, graceMs = 1500) {
 if (!alive(p)) return;
 p.kill('SIGTERM');
 let timer: ReturnType<typeof setTimeout>;
 await Promise.race([p.exited, new Promise<void>(resolve => { timer=setTimeout(resolve,graceMs); })]);
 clearTimeout(timer!);
 if (alive(p)) { p.kill('SIGKILL'); await p.exited; }
}
export async function abortOwned(controller: AbortController, workers: any[], graceMs = 1500) {
 controller.abort();
 await Promise.all(workers.map(p => stopOwned(p, graceMs)));
}
