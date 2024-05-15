import { disablePassiveEffects, effectQueue, saveQueue } from "./settings.js";
import { warn } from "../times-up.js";
import { getConcentrationEffect, GMAction, removeConcentrationEffect, TUfromActorUuid } from "./utils.js";
import { handlePreUpdateCombat } from "./combatUpdate.js";
export async function purgeDeletedActors() {
    if (!game.user.isGM)
        return;
    let count = 0;
    for (let e of effectQueue.effects.keys()) {
        const { actorUuid, effectData } = effectQueue.effects.get(e);
        //@ts-ignore
        if (!actorUuid || !TUfromActorUuid(actorUuid)) {
            count++;
            effectQueue.effects.delete(e);
        }
        else {
        }
    }
    if (count)
        console.warn("times-up | Deleted", count, "effects with no actor");
}
export async function removeOrDisableEffects(actor, effects, reason = "expiry") {
    if (!disablePassiveEffects) {
        for (let effect of effects) {
            //@ts-ignore origin
            if (globalThis.Sequencer && effect.origin)
                globalThis.Sequencer.EffectManager.endEffects({ origin: effect.origin });
        }
        effects = removeConcentrationEffect(actor, effects);
        //@ts-ignore
        return actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(ef => ef.id), { "expiry-reason": reason });
    }
    let removeEffects = [];
    let disableEffects = [];
    //@ts-expect-error flags
    // removeEffects = effects.filter(ef => !ef.flags?.dae?.transfer && !getProperty(ef, "flags.times-up.isPassive") && getConcentrationEffect(actor)?.id !== ef.id);
    removeEffects = removeConcentrationEffect(actor, effects.filter(ef => !ef.flags?.dae?.transfer && !getProperty(ef, "flags.times-up.isPassive") && getConcentrationEffect(actor)?.id !== ef.id));
    disableEffects = effects
        //@ts-ignore flags
        .filter(ef => ef.flags?.dae?.transfer || ef.flags["times-up"]?.isPassive)
        .map(ef => {
        return {
            //@ts-ignore _id
            _id: ef._id,
            "disabled": true,
            "duration.startRound": null,
            "duration.startTurn": null,
            "duration.startTime": null
        };
    });
    for (let effect of removeEffects) {
        if (globalThis.Sequencer && effect.origin)
            await globalThis.Sequencer.EffectManager.endEffects({ origin: effect.origin });
    }
    //@ts-ignore
    await actor.updateEmbeddedDocuments("ActiveEffect", disableEffects);
    //@ts-ignore
    return actor.deleteEmbeddedDocuments("ActiveEffect", removeEffects.map(ef => ef._id), { "expiry-reason": reason });
}
export var socketlibSocket = undefined;
export let setupSocket = () => {
    socketlibSocket = globalThis.socketlib.registerModule("times-up");
    socketlibSocket.register("handlePreUpdateCombat", _handlePreUpdateCombat);
};
async function _handlePreUpdateCombat(combatId, update, options, user) {
    let combat = game.combats.get(combatId);
    if (!combat)
        return null;
    return await handlePreUpdateCombat.bind(combat)(update, options, user);
}
export function readyTimesUpSetup() {
    if (game.user.isGM) {
        Hooks.on("updateWorldTime", async (worldTime, dt) => {
            let found = false;
            for (let efKey of effectQueue.effects.keys()) {
                const efqEntry = effectQueue.effects.get(efKey);
                let { actorUuid, effectData } = efqEntry;
                warn("update world time", efqEntry, actorUuid, effectData._id, effectData);
                let expired = effectData.duration?.seconds && (worldTime - effectData.duration.startTime) >= effectData.duration.seconds;
                if (effectData.duration?.rounds || effectData.duration?.turns) { // think about if want to do anything here
                }
                if (expired && effectData.duration.seconds) {
                    const actor = TUfromActorUuid(actorUuid);
                    const effect = actor?.effects.get(effectData._id);
                    // if (actor && effect && !isConcentrationEffect(actor, effectData)) {
                    if (actor && effect) {
                        try {
                            // await actor.deleteEmbeddedDocuments("ActiveEffect", [effectData._id])
                            await removeOrDisableEffects(actor, [effect], "times-up:duration-seconds");
                        }
                        catch (err) {
                            warn("delete effect failed ", err);
                        }
                    }
                    effectQueue.effects.delete(efKey);
                    found = true;
                }
            }
            ;
            if (found)
                await saveQueue();
        });
        Hooks.on("preCreateActiveEffect", (effect, data, options, user) => {
            effect.updateSource({ "flags.times-up.isPassive": data.transfer });
        });
        Hooks.on("createActiveEffect", (effect, options) => {
            //@ts-ignore documentclass
            if (!(effect.parent instanceof CONFIG.Actor.documentClass))
                return true;
            if (effect.duration?.seconds)
                GMAction("createEffect", effect.parent, effect);
        });
        Hooks.on("preUpdateActiveEffect", (effect, update, options, user) => {
            if (update.disabled === false && disablePassiveEffects) {
                const newStartTime = effect.duration.startTime ?? game.time.worldTime;
                setProperty(update, "duration.startTime", newStartTime);
                if (game.combat) { // TODO need to work out which is the right combat to use?
                    //@ts-ignore current
                    const newStartRound = effect.duration?.startRound ?? game.combat?.current?.round;
                    setProperty(update, "duration.startRound", newStartRound);
                    //@ts-ignore current
                    const newStartTurn = effect.duration?.startTurn ?? game.combat?.current?.turn;
                    setProperty(update, "duration.startTurn", newStartTurn);
                }
            }
            return true;
        });
        Hooks.on("updateActiveEffect", (effect, update, options) => {
            //@ts-ignore documentclass
            if (!(effect.parent instanceof CONFIG.Actor.documentClass))
                return true;
            if (effect.duration?.seconds)
                GMAction("updateEffect", effect.parent, effect);
            // if (hasSpecialDuration(effectData)) GMAction("updateSpecial", actor, effectData);
        });
        Hooks.on("deleteActiveEffect", (effect, options) => {
            //@ts-ignore documentclass
            if (!(effect.parent instanceof CONFIG.Actor.documentClass))
                return true;
            GMAction("deleteEffect", effect.parent, effect);
        });
        Hooks.on("preDeleteActiveEffect", (effect, data, options) => {
            //@ts-ignore documentclass
            if (!(effect.parent instanceof CONFIG.Actor.documentClass))
                return true;
            GMAction("deleteEffect", effect.parent, effect);
        });
    }
}
export function initTimesUpSetup() {
}
export function hasMacroRepeat(effectData) {
    return (["startEveryTurn", "endEveryTurn"].includes(effectData.flags?.dae?.macroRepeat));
}
export function getMacroRepeat(effectData) {
    return effectData.flags?.dae?.macroRepeat;
}
