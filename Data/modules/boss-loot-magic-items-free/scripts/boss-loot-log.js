import { MODULE_NAME, SHORT_MODULE_NAME } from './constants.js';

/**
 * Logs a message to the console with a consistent format. Item name is optional.
 * @param {string} message - The message to log.
 * @param {string} [itemName] - (Optional) The name of the item related to the log message.
 * @param {string} type - The type of log ('info', 'warn', 'error').
 */
function log(message, itemName = '', type = 'info', color = '') {
  const isLoggingEnabled = game.settings.get(MODULE_NAME, 'showLog');

  if (!isLoggingEnabled) return;

  const colorPrefix = color ? `%c${message}` : message;
  const css = color ? `color: ${color};` : '';
  const logPrefix = `${SHORT_MODULE_NAME}${itemName ? ` | ${itemName}` : ''} | `;

  switch (type) {
    case 'warn':
      console.warn(logPrefix + colorPrefix, css);
      break;
    case 'error':
      console.error(logPrefix + colorPrefix, css);
      break;
    case 'info':
    default:
      console.log(logPrefix + colorPrefix, css);
      break;
  }
}

// Sample usage:
// log('This is an info message');
// log('This is a warning message', '', 'warn');
// log('This is an error message', 'HealingPotion', 'error');

export { log };
