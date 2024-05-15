import { setDebugLevel, warn } from "../times-up.js";
export let enablePassiveEffects = true;
export let updatePassiveEffects = true;
export let maxRoundsToConvert = 10;
export let MAX_SHORT_DURATION;
export let timesUpEnabled;
export const registerSettings = function () {
    // Register any custom module settings here
    game.settings.register("times-up", "store", {
        name: "Effect Expiry queue",
        hint: "Don't touch this",
        default: {},
        type: Object,
        scope: 'world',
        config: false,
        onChange: fetchQueue
    });
    game.settings.register("times-up", "TimesUpEnabled", {
        name: "times-up.TimesUpEnabled.Name",
        hint: "times-up.TimesUpEnabled.Hint",
        scope: "world",
        default: true,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("times-up", "EnablePassiveEffects", {
        name: "times-up.EnablePassiveEffects.Name",
        hint: "times-up.EnablePassiveEffects.Hint",
        scope: "world",
        default: true,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("times-up", "UpdatePassiveEffects", {
        name: "times-up.UpdatePassiveEffects.Name",
        hint: "times-up.UpdatePassiveEffects.Hint",
        scope: "world",
        default: true,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("times-up", "MaxRoundsToConvert", {
        name: "times-up.MaxRoundsToConvert.Name",
        hint: "times-up.MaxRoundsToConvert.Hint",
        scope: "world",
        default: 10,
        type: Number,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("times-up", "Debug", {
        name: "times-up.Debug.Name",
        hint: "times-up.Debug.Hint",
        scope: "world",
        default: "None",
        type: String,
        config: true,
        choices: { none: "None", warn: "warnings", debug: "debug", all: "all" },
        onChange: fetchParams
    });
    game.settings.register("times-up", "status", {
        scope: "world",
        default: {},
        type: Object,
        config: false
    });
};
const defaultQueue = {
    //@ts-ignore
    effects: new Set()
};
export var effectQueue;
export function fetchParams() {
    setDebugLevel(game.settings.get("times-up", "Debug"));
    timesUpEnabled = game.settings.get("times-up", "TimesUpEnabled") ?? false;
    enablePassiveEffects = game.settings.get("times-up", "EnablePassiveEffects") ?? true;
    maxRoundsToConvert = game.settings.get("times-up", "MaxRoundsToConvert") ?? 10;
    MAX_SHORT_DURATION = maxRoundsToConvert * CONFIG.time.roundTime;
}
export function fetchQueue() {
    //@ts-expect-error
    if (!game.users.activeGM?.isSelf)
        return;
    if (effectQueue)
        return; // changes only relevant if we are not already tracking the queue
    effectQueue = {};
    let data = game.settings.get("times-up", "store");
    try {
        if (data.entries.length > 0 && typeof data.entries[0] === "object") {
            // This is an old form effect queue
            data.entries = data.entries.map(i => i?.uuid).filter(i => !!i);
        }
        //@ts-ignore
        effectQueue.effects = new Set(data.entries);
    }
    catch (err) {
        warn(err, data.entries);
        effectQueue = null;
    }
    if (!effectQueue?.effects) {
        warn("resetting to empty queue");
        effectQueue = defaultQueue;
    }
}
// Avoid saving the queue too often.
//@ts-ignore debounce
export let saveQueue = debounce(baseSaveQueue, 500);
export async function baseSaveQueue() {
    //@ts-expect-error activeGM
    if (!game.users.activeGM?.isSelf)
        return;
    let data = { entries: null };
    data.entries = Array.from(effectQueue.effects);
    warn("Saving queue", data, effectQueue);
    await game.settings.set("times-up", "store", data);
}
export async function clearQueue() {
    if (game.user.isGM) {
        effectQueue = defaultQueue;
        await saveQueue();
    }
}
