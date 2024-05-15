/**
 * This is your TypeScript entry file for Foundry VTT.
 * Register custom settings, sheets, and constants using the Foundry API.
 * Change this heading to be more descriptive to your module, or remove it.
 * Author: [your name]
 * Content License: [copyright and-or license] If using an existing system
 * 					you may want to put a (link to a) license or copyright
 * 					notice here (e.g. the OGL).
 * Software License: [your license] Put your desired license here, which
 * 					 determines how others may use and modify your module
 */
// Import TypeScript modules
import { registerSettings, effectQueue, fetchParams, fetchQueue, clearQueue } from './module/settings.js';
import { initTimesUpSetup, readyTimesUpSetup, purgeDeletedEffects, isEffectExpired } from "./module/handleUpdates.js";
// import { readyCombatSetup } from './module/combatUpdate.js';
// import { initPatching } from './module/patching.js';
export let setDebugLevel = (debugText) => {
    debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
    // 0 = none, warnings = 1, debug = 2, all = 3
    if (debugEnabled >= 3)
        CONFIG.debug.hooks = true;
};
export var debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1)
    console.log("DEBUG: times-up | ", ...args); };
export let log = (...args) => console.log("times-up | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0)
    console.warn("times-up | ", ...args); };
export let error = (...args) => console.error("times-up | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};
/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function () {
    console.log('times-up | Initializing times-up');
    // Register custom module settings
    registerSettings();
    initTimesUpSetup();
});
/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
    // Do anything after initialization but before
    // ready
});
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
export var dae;
Hooks.once('ready', function () {
    // Do anything once the module is ready
    registerSettings();
    fetchParams();
    fetchQueue();
    //@ts-ignore
    window.TimesUp = {
        effectQueue: () => { return effectQueue; },
        clearQueue: clearQueue,
        purgeDeletedEffects: purgeDeletedEffects,
        isEffectExpired
    };
    readyTimesUpSetup();
    purgeDeletedEffects();
    dae = globalThis.DAE;
});
Hooks.once("init", () => {
    const libWrapper = globalThis.libWrapper;
    if (game.system.id === "dnd5e" && CONFIG.ActiveEffect.documentClass.prototype.getDependents)
        libWrapper.register("times-up", "CONFIG.ActiveEffect.documentClass.prototype.getDependents", getDependents, "OVERRIDE");
});
/**
 * Retrieve a list of dependent effects.
 * Don't return expired effects isince times-up will delete them "soon"
 * @returns {ActiveEffect5e[]}
 */
function getDependents() {
    return (this.getFlag("dnd5e", "dependents") || []).reduce((arr, { uuid }) => {
        //@ts-expect-error
        const dependent = fromUuidSync(uuid);
        if (dependent && (!(dependent instanceof ActiveEffect) || !isEffectExpired(dependent)))
            arr.push(dependent);
        return arr;
    }, []);
}
