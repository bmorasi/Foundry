import { MODULE_NAME, SHORT_MODULE_NAME } from './constants.js';
import { log } from './boss-loot-log.js';

const MIDI_MIN_VER = '11.2.1';

export class ApplyBossLootMidiSettingsFormApp extends FormApplication {
  constructor() {
    super();
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['form'],
      popOut: true,
      template: `modules/${MODULE_NAME}/templates/config-form-midi.hbs`,
      id: 'apply-bossloot-settings',
      title: 'Modify Midi-QOL Settings',
      width: 500,
      closeOnSubmit: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Check if the current Midi-QOL version is greater than MIDI_MIN_VER
    const isVersionValid = foundry.utils.isNewerVersion(game.modules.get('midi-qol').version, MIDI_MIN_VER);

    // Disable the confirm button if the version check fails
    if (!isVersionValid) {
      html.find('button[name="submit"]').prop('disabled', true);
      ui.notifications.warn(`Midi-QOL version must be greater than '${MIDI_MIN_VER}'`);
    }
    // Close the form without saving when the cancel button is clicked
    html.find('button[name="cancel"]').click(() => this.close());
  }

  async _updateObject(event, formData) {
    const settingsPath = `modules/${MODULE_NAME}/scripts/config/bossloot-midi-settings.json`;
    const settingsJSON = await this.constructor.getSettingsFromJSON(settingsPath);
    await this.constructor.importSettingsFromJSON(settingsJSON);
  }

  // Static Methods
  static async getSettingsFromJSON(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Could not load settings file: ${response.statusText}`);
    }
    return response.json();
  }

  static async importSettingsFromJSON(json) {
    if (typeof json === 'string') json = JSON.parse(json);

    // Get the current config settings object
    let currentConfigSettings = foundry.utils.deepClone(game.settings.get('midi-qol', 'ConfigSettings'));

    // Update the current config settings with the new Boss Loot recommended settings
    const newSettings = json.configSettings;
    currentConfigSettings = foundry.utils.mergeObject(currentConfigSettings, newSettings);

    const ceModifyStatusEffects = game.settings.get('dfreds-convenient-effects', 'modifyStatusEffects');
    if (ceModifyStatusEffects === 'none') {
      log('Disabling the Wounded/Dead Overlay in Midi-QOL', 'Settings');
      currentConfigSettings.midiDeadCondition = 'none';
      currentConfigSettings.midiUnconsciousCondition = 'none';
      currentConfigSettings.addDead = 'none';
      currentConfigSettings.midiWoundedCondition = 'none';
      currentConfigSettings.addWoundedStyle = 'none';
      currentConfigSettings.addWounded = 0;
    }

    await game.settings.set('midi-qol', 'ConfigSettings', currentConfigSettings);
    await game.settings.set('midi-qol', 'EnableWorkflow', json.enableWorkflow);
    await game.settings.set('midi-qol', 'ForceHideRoll', json.forceHideRoll);
    await game.settings.set('midi-qol', 'AutoRemoveTargets', json.autoRemoveTargets);

    log('Midi-QOL Config settings updated', 'Settings');
    ui.notifications.info('Midi-QOL Settings updated!');
  }
}

export class ItemsSettings extends FormApplication {
  constructor() {
    super();
  }
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['form'],
      popOut: true,
      template: `modules/${MODULE_NAME}/templates/config-form-items.hbs`,
      id: 'items-settings',
      title: 'Items Settings',
      width: 800,
      height: 'auto',
      closeOnSubmit: true,
    });
  }

  getData() {
    const data = super.getData();

    // TODO: solve this repetitive code
    data.settings = [
      {
        id: 'itemAnimatedArtwork',
        name: 'Item Chat Card Artwork Style',
        hint: "Experimental. Control the artwork display style for item chat cards. (when an item it's used).",
        value: game.settings.get(MODULE_NAME, 'itemAnimatedArtwork'),
        isSelect: true,
        choices: {
          0: 'Enabled with animation',
          1: 'Enabled with static artwork',
          2: 'Disabled',
        },
      },
      {
        id: 'chatAnimatedArtwork',
        name: 'Boss Loot Message Artwork Style',
        hint: 'Experimental. Control the artwork style for Boss Loot chat messages.',
        value: game.settings.get(MODULE_NAME, 'chatAnimatedArtwork'),
        isSelect: true,
        choices: {
          0: 'Enabled with animation',
          1: 'Enabled with static artwork',
          2: 'Disabled',
        },
      },
    ];

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Close the form without saving when the cancel button is clicked
    html.find('button[name="cancel"]').click(() => this.close());
  }

  async _updateObject(event, formData) {
    for (let [key, value] of Object.entries(formData)) {
      if (game.settings.get(MODULE_NAME, key) === value) continue;
      await game.settings.set(MODULE_NAME, key, value);
    }
  }
}
