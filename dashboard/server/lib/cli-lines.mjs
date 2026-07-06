function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function commandForProvider(provider, { prompt, role, projectName, model, command }) {
  const safePrompt = [
    `Papel: ${role}`,
    `Projeto: ${projectName}`,
    '',
    prompt,
  ].join('\n');
  const quoted = shellQuote(safePrompt);
  const bin = command || provider;
  switch (provider) {
    case 'codex':
      return model ? `${bin} --model ${shellQuote(model)} ${quoted}` : `${bin} ${quoted}`;
    case 'claude':
      return `${bin} ${quoted}`;
    case 'gemini-cli':
      return model ? `${bin} -m ${shellQuote(model)} -p ${quoted}` : `${bin} -p ${quoted}`;
    case 'copilot':
      return `gh copilot suggest -t shell ${quoted}`;
    case 'ollama':
      return `${bin} run ${shellQuote(model || 'llama3.3')} ${quoted}`;
    case 'manual':
      return `# manual: ${safePrompt.replace(/\n/g, ' | ')}`;
    default:
      return `${bin} ${quoted}`;
  }
}
