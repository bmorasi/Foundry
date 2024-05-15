import { disablePassiveEffects, effectQueue, saveQueue } from "./settings.js";
import { warn } from "../times-up.js";
import { getConcentrationEffect, GMAction, removeConcentrationEffect } from "./utils.js";
import { handlePreUpdateCombat } from "./combatUpdate.js";
export async function purgeDeletedActors() {
    if (!game.user.isGM)
        return;
    let count = 0;
    for (let e of effectQueue.effects.keys()) {
        const { entityUuid, effectData } = effectQueue.effects.get(e);
        //@ts-expect-error
        if (!entityUuid || !fromUuidSync(entityUuid)) {
            count++;
            effectQueue.effects.delete(e);
        }
        else {
        }
    }
    if (count)
        console.warn("times-up | Deleted", count, "effects with no entity");
}
export async function removeOrDisableEffects(entity, effects, reason = "expiry") {
    let removeEffects = [];
    let disableEffects = [];
    const disableAllEffects = game.settings.get("times-up", "DisablePassiveEffects");
    // removeEffects = effects.filter(ef => !ef.flags?.dae?.transfer && !getProperty(ef, "flags.times-up.isPassive") && getConcentrationEffect(actor)?.id !== ef.id);
    if (entity instanceof Actor && !disableAllEffects) {
        //@ts-expect-error flags
        removeEffects = removeConcentrationEffect(entity, effects.filter(ef => !ef.flags?.dae?.transfer && !getProperty(ef, "flags.times-up.isPassive") && getConcentrationEffect(entity)?.id !== ef.id));
    }
    disableEffects = effects
        //@ts-ignore flags
        .filter(ef => disableAllEffects || entity instanceof Item || ef.flags?.dae?.transfer || ef.flags["times-up"]?.isPassive)
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
    //@ts-expect-error updateEmbeddedDocuments
    await entity.updateEmbeddedDocuments("ActiveEffect", disableEffects);
    //@ts-expect-error deleteEmbeddedDocuments
    if (removeEffects.length > 0)
        return entity.deleteEmbeddedDocuments("ActiveEffect", removeEffects.map(ef => ef._id), { "expiry-reason": reason });
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
                let { entityUuid, effectData } = efqEntry;
                warn("update world time", efqEntry, entityUuid, effectData._id, effectData);
                let expired = effectData.duration?.seconds && (worldTime - effectData.duration.startTime) >= effectData.duration.seconds;
                if (effectData.duration?.rounds || effectData.duration?.turns) { // think about if want to do anything here
                }
                if (expired && effectData.duration.seconds) {
                    //@ts-expect-error
                    const entity = fromUuidSync(entityUuid);
                    if (!entity)
                        return;
                    const effect = entity?.effects.get(effectData._id);
                    // if (actor && effect && !isConcentrationEffect(actor, effectData)) {
                    if (entity && effect) {
                        try {
                            // await actor.deleteEmbeddedDocuments("ActiveEffect", [effectData._id])
                            await removeOrDisableEffects(entity, [effect], "times-up:duration-seconds");
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
            if (effect.duration?.seconds)
                GMAction("updateEffect", effect.parent, effect);
            // if (hasSpecialDuration(effectData)) GMAction("updateSpecial", actor, effectData);
        });
        Hooks.on("deleteActiveEffect", (effect, options) => {
            GMAction("deleteEffect", effect.parent, effect);
        });
        Hooks.on("preDeleteActiveEffect", (effect, data, options) => {
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
