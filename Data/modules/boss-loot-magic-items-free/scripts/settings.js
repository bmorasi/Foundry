import { ApplyBossLootMidiSettingsFormApp, ItemsSettings } from './settingsMenu.js';
import { MODULE_NAME, SHORT_MODULE_NAME, NAMESPACE } from './constants.js';

export async function bossLootSettings() {
  // HIDDEN
  game.settings.register(MODULE_NAME, 'moduleVersion', {
    name: 'Module Version',
    hint: 'Used to track the version of the module for update purposes.',
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });
  // MENU
  game.settings.registerMenu(MODULE_NAME, 'applyBossLootSettings', {
    name: 'Optimize Midi-QoL Settings for Boss Loot',
    label: 'Optimize Settings',
    hint: 'This will adjust various Midi-QoL module settings to ensure the best possible experience with Boss Loot content. Recommended for first-time setup.',
    icon: 'fas fa-magic',
    type: ApplyBossLootMidiSettingsFormApp,
    restricted: true, // Restricts this setting to GMs only
  });
  game.settings.registerMenu(MODULE_NAME, 'itemsSettings', {
    name: 'Items Specific Settings',
    label: 'Items',
    hint: 'Customize the behavior and properties of items.',
    icon: 'fas fa-swords',
    type: ItemsSettings,
  });
  // GENERAL
  game.settings.register(MODULE_NAME, 'showLog', {
    name: 'Show Console Log',
    hint: 'If Enabled, various operational messages, warnings, and errors will be displayed in the console, which can be useful for debugging or monitoring module behavior.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_NAME, 'showHelperPopup', {
    name: 'Show Helper Pop Up',
    hint: 'If Enabled, you will see the info helper popup at the game start.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_NAME, 'checkMandatoryModules', {
    name: 'Check Mandatory Modules',
    hint: 'If Enabled, there will be an automatically check of the mandatory modules, results will be shown in the chat.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  // ITEMS RELATED SETTINGS
  game.settings.register(MODULE_NAME, 'itemAnimatedArtwork', {
    name: 'Item Chat Card Artwork Style',
    hint: "Experimental. Control the artwork display style for item chat cards. (when an item it's used).",
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
    choices: {
      0: 'Enabled with animation',
      1: 'Enabled with static artork',
      2: 'Disabled',
    },
  });
  game.settings.register(MODULE_NAME, 'chatAnimatedArtwork', {
    name: 'Boss Loot Message Artwork Style',
    hint: 'Experimental. Control the artwork style for Boss Loot chat messages.',
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
    choices: {
      0: 'Enabled with animation',
      1: 'Enabled with static artork',
      2: 'Disabled',
    },
  });
}
