import { MODULE_NAME, SHORT_MODULE_NAME, NAMESPACE } from './constants.js';
import { bossLootSettings } from './settings.js';
import { helperData as helpers } from './helperFunctions.js';
import { macros } from './macros.js';
import { runAsGM } from './runAsGM.js';
import { log } from './boss-loot-log.js';
import { database } from './sequencer-resources.js';
export let socket;

Hooks.once('init', async function () {
  await bossLootSettings();
});

Hooks.once('socketlib.ready', async function () {
  socket = socketlib.registerModule(MODULE_NAME);
  socket.register('toggleTokenVisibility', runAsGM.toggleTokenVisibility);
  socket.register('deleteToken', runAsGM.deleteToken);
});

Hooks.once('ready', async function () {
  if (game.modules.get('boss-loot-magic-items-advanced')?.active) {
    console.warn('Boss Loot Advanced is active. Free version will not be initialized!');
  } else {
    globalThis[NAMESPACE] = {
      helpers,
      macros,
      log,
      MODULE_NAME,
      NAMESPACE,
    };

    Hooks.once('sequencerReady', () => {
      Sequencer.Database.registerEntries(NAMESPACE, database);
    });
  }
  if (!game.user.isGM) {
    return;
  }
  const moduleVersion = game.modules.get(MODULE_NAME).version;
  const storedVersion = game.settings.get(MODULE_NAME, 'moduleVersion');

  if (foundry.utils.isNewerVersion(moduleVersion, storedVersion)) {
    await game.settings.set(MODULE_NAME, 'moduleVersion', moduleVersion);
  }

  if (game.settings.get(MODULE_NAME, 'showHelperPopup') === true) {
    await helpers.launchHelperPopup();
  }

  if (game.settings.get(MODULE_NAME, 'checkMandatoryModules') === true) {
    await helpers.checkMandatoryModules();
  }

  log(`Module loaded!`, MODULE_NAME, 'info', '#7ABA78');
});
