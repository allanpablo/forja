export function sseEvent(name, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const lines = payload.split(/\r?\n/).map(line => `data: ${line}`).join('\n');
  return `event: ${name}\n${lines}\n\n`;
}
