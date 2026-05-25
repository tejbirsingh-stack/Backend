export class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  info(message, meta) {
    console.log(`[INFO] [${this.namespace}] ${message}`, meta || "");
  }

  warn(message, meta) {
    console.warn(`[WARN] [${this.namespace}] ${message}`, meta || "");
  }

  error(message, meta) {
    console.error(`[ERROR] [${this.namespace}] ${message}`, meta || "");
  }

  debug(message, meta) {
    console.debug(`[DEBUG] [${this.namespace}] ${message}`, meta || "");
  }
}
