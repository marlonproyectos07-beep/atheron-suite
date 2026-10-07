/**
 * ATH-DISP-001 — lectura oculta de un PIN desde la terminal.
 *
 * - Solo funciona en una terminal interactiva (TTY). Con tubería o archivo
 *   falla cerrado, para que el PIN nunca llegue desde un archivo o historial.
 * - No hace eco de ningún carácter, ni siquiera asteriscos.
 * - No escribe el valor en logs ni en salida. El llamador solo recibe el string.
 */

export class NonInteractiveTerminalError extends Error {
  constructor() {
    super('PIN_REQUIRES_INTERACTIVE_TERMINAL');
    this.name = 'NonInteractiveTerminalError';
  }
}

export class InputCancelledError extends Error {
  constructor() {
    super('INPUT_CANCELLED');
    this.name = 'InputCancelledError';
  }
}

/**
 * @param {{input?: NodeJS.ReadStream, output?: NodeJS.WriteStream, prompt?: string}} options
 * @returns {Promise<string>}
 */
export function readHiddenLine({ input = process.stdin, output = process.stdout, prompt = '' } = {}) {
  if (!input || !input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new NonInteractiveTerminalError());
  }

  return new Promise((resolve, reject) => {
    let value = '';
    if (prompt) output.write(prompt);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();

    const finish = (error, result) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(result);
    };

    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') {
          finish(null, value);
          return;
        }
        if (ch === '\u0003') {
          value = '';
          finish(new InputCancelledError());
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (ch >= ' ' && ch !== '\u007f') value += ch;
      }
    };

    input.on('data', onData);
  });
}
