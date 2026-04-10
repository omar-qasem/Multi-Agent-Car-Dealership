/**
 * نظام اللوغ (Logging System)
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const formatTime = () => new Date().toISOString();

const logger = {
  info: (message, data = null) => {
    const log = `${colors.cyan}[INFO]${colors.reset} ${formatTime()} - ${message}`;
    console.log(log, data ? data : '');
  },

  success: (message, data = null) => {
    const log = `${colors.green}[SUCCESS]${colors.reset} ${formatTime()} - ${message}`;
    console.log(log, data ? data : '');
  },

  warn: (message, data = null) => {
    const log = `${colors.yellow}[WARN]${colors.reset} ${formatTime()} - ${message}`;
    console.warn(log, data ? data : '');
  },

  error: (message, error = null) => {
    const log = `${colors.red}[ERROR]${colors.reset} ${formatTime()} - ${message}`;
    console.error(log, error ? error : '');
  },

  webhook: (message, data = null) => {
    const log = `${colors.magenta}[WEBHOOK]${colors.reset} ${formatTime()} - ${message}`;
    console.log(log, data ? data : '');
  },

  ai: (message, data = null) => {
    const log = `${colors.blue}[AI]${colors.reset} ${formatTime()} - ${message}`;
    console.log(log, data ? data : '');
  },
};

module.exports = logger;
