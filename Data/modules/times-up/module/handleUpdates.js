import { MAX_SHORT_DURATION, effectQueue, enablePassiveEffects, saveQueue, updatePassiveEffects, timesUpEnabled } from "./settings.js";
import { debug, warn, debugEnabled, dae } from "../times-up.js";
// Rules for effects
// 1. When starting combat/adding short duration effects are set to a rounds/turn duration.
// 1.1 Same with transfer effects only if updatePassiveEffects is enabled
// 2. Transfer effects store their seconds duration in the flags.times-up.durationSeconds for restoration
// 3. When a transfer effect is enabled it's start time is reset to the current combat round/turn.
// 4. At the end of combat/a combatant is removed from combat
//     Short duration effects (< 10 rounds remaining) are expired.
//     Transfer effects have their duration restored.
/**
 *
 * Purge any deleted effects from the effect queue
 */
export async function purgeDeletedEffects() {
    //@ts-expect-error
    if (!game.users.activeGM?.isSelf)
        return;
    for (let uuid of effectQueue.effects.keys()) {
        //@ts-expect-error
        const effect = fromUuidSync(uuid);
        if (uuid.startsWith("Compendium") || !effect) {
            effectQueue.effects.delete(uuid);
        }
        else if (effect.transfer && effect.disabled) {
            effectQueue.effects.delete(uuid);
        }
        else if (!effect.transfer && effect.parent instanceof Item) {
            effectQueue.effects.delete(uuid);
        }
    }
    saveQueue();
}
function setDurationRounds(effect, combat, duration) {
    duration = duration ?? effect.updateDuration();
    if (!duration.seconds || (isTransferEffect(effect) && !updatePassiveEffects))
        return {};
    if (duration.seconds > MAX_SHORT_DURATION)
        return {};
    let update = {};
    let rounds = Math.floor(duration.remaining / CONFIG.time.roundTime);
    update["duration.rounds"] = rounds;
    update["duration.turns"] = rounds === 0 ? 1 : 0;
    update["duration.startRound"] = combat.round;
    update["duration.startTurn"] = combat.turn;
    update["duration.seconds"] = null;
    update["flags.times-up.durationSeconds"] = duration.seconds;
    if (debugEnabled > 0)
        warn("set duration rounds", effect.uuid, update, effect.updateDuration());
    return update;
}
function setDurationSeconds(effect) {
    let update = {};
    //@ts-expect-error
    let timesUpDurationSeconds = foundry.utils.getProperty(effect, "flags.times-up.durationSeconds");
    if (timesUpDurationSeconds || timesUpDurationSeconds === 0) {
        update = {
            "duration.seconds": timesUpDurationSeconds,
            "duration.rounds": null,
            "duration.turns": null,
            "flags.times-up.durationSeconds": null,
        };
    }
    if (debugEnabled > 0)
        warn("set duration seconds", effect.uuid, update, effect.updateDuration());
    return update;
}
function getExpireTransferEffectUpdate(effect) {
    const update = setDurationSeconds(effect);
    update["disabled"] = true;
    update["duration.startTime"] = null;
    update["duration.startRound"] = null;
    update["duration.startTurn"] = null;
    return update;
}
export async function expireEffect(effect) {
    if (!timesUpEnabled)
        return;
    if (debugEnabled > 0)
        warn("Expire effect", effect.uuid, effect);
    GMEffectQueue("deleteEffect", effect);
    // Deal with nonLegacyTransfer - for a little while?
    if (isTransferEffect(effect)) {
        const update = getExpireTransferEffectUpdate(effect);
        await effect.update(update);
    }
    else
        await effect.delete();
}
function noStartSet(effect) {
    const duration = effect.updateDuration();
    if (duration.seconds && !duration.startTime)
        return true;
    if (!duration.startRound && !duration.startTurn)
        return true;
    return false;
}
function getUnexpireEffectUpdate(effect, combat, duration) {
    // if (!effect.disabled) return;
    let effectActor = getEffectActor(effect);
    let isInCombat = combat && combat.combatants.find(c => c.actor === effectActor) !== undefined;
    let update = {};
    if (isTransferEffect(effect) && isEffectExpired(effect) || noStartSet(effect)) {
        update["duration.startRound"] = combat ? combat.round : game.combat?.round;
        update["duration.startTurn"] = combat ? combat.turn : game.combat?.turn;
        update["duration.startTime"] = game.time.worldTime;
    }
    duration = duration ?? effect.updateDuration();
    if (isInCombat && (duration.seconds ?? MAX_SHORT_DURATION + 1) <= MAX_SHORT_DURATION) {
        if (!isTransferEffect(effect) || updatePassiveEffects) {
            update = mergeObject(update, setDurationRounds(effect, combat, duration));
            GMEffectQueue("deleteEffect", effect);
            update["disabled"] = false;
        }
        if (debugEnabled > 0)
            warn("unexpire effect", effect.uuid, update, effect.updateDuration(), isTransferEffect(effect));
    }
    else if (duration.seconds)
        GMEffectQueue("createEffect", effect);
    return update;
}
async function unexpireEffect(effect, combat) {
    const update = getUnexpireEffectUpdate(effect, combat);
    //@ts-expect-error isEmpty
    if (!isEmpty(update))
        await effect.update(update);
}
function getCombatTime(round, turn, nTurns) {
    return (round ?? 0) * nTurns + (turn ?? 0);
}
function isDurationExpired(d, options = {}) {
    const { combat, secondsOnly } = options;
    if (!d)
        return false;
    if (d.seconds)
        return d.remaining <= 0;
    if (!combat)
        return d.remaining <= 0; // this will be game.combat
    if (!d.rounds && !d.turns)
        return d.remaining <= 0;
    // We are in combat and have rounds/turns so can use the actual combat rather than game.combat
    const c = { round: combat.round ?? 0, turn: combat.turn ?? 0, nTurns: combat.turns.length || 1 };
    const current = getCombatTime(c.round, c.turn, c.nTurns);
    const duration = getCombatTime(d.rounds, d.turns, c.nTurns);
    const start = getCombatTime(d.startRound, Math.min(d.startTurn ?? 0, c.nTurns - 1), c.nTurns);
    if (current <= start)
        return false;
    const remaining = Math.max((start + duration) - current, 0);
    return remaining === 0;
}
export function isEffectExpired(effect /* ActiveEffect */, options = {}) {
    const { combat, secondsOnly } = options;
    if (!hasExpiry(effect.duration))
        return false;
    return isDurationExpired(effect.updateDuration(), options);
}
export function isTransferEffect(effect) {
    let _isTransferEffect = effect.transfer;
    //@ts-expect-error
    if (CONFIG.ActiveEffect.legacyTransferral)
        _isTransferEffect = foundry.utils.getProperty(effect, "flags.dae.transfer") || foundry.utils.getProperty(effect, "flags.times-up.isPassive");
    return _isTransferEffect;
}
async function setEffectsExpiryToRounds(actor, combat) {
    // update the duration of short actor effects to rounds/turns
    for (let effect of actor.allApplicableEffects()) {
        const duration = effect.updateDuration();
        if (effect.disabled || effect.duration.type !== "seconds")
            continue;
        let update = {};
        if (isTransferEffect(effect) && updatePassiveEffects && (effect.duration.seconds ?? (MAX_SHORT_DURATION + 1)) <= MAX_SHORT_DURATION) {
            if (debugEnabled > 0)
                warn("update effect setting expiry rounds", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
            update = setDurationRounds(effect, combat);
            //@ts-expect-error
            if (!isEmpty(update))
                await effect.update(update);
        }
        else if (!isTransferEffect(effect) && (effect.duration.seconds ?? (MAX_SHORT_DURATION + 1)) <= MAX_SHORT_DURATION) {
            if (debugEnabled > 0)
                warn("update effect setting expiry rounds", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
            update = setDurationRounds(effect, combat);
            //@ts-expect-error
            if (!isEmpty(update))
                await effect.update(update);
        }
    }
}
async function setEffectsExpiryToSeconds(actor, combat) {
    for (let effect of actor.allApplicableEffects()) {
        let update = {};
        const duration = effect.updateDuration();
        if (duration.type !== "turns")
            continue;
        if (isTransferEffect(effect)) {
            let update = setDurationSeconds(effect);
            if (debugEnabled > 0)
                warn("update effect setting expiry seconds", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
            //@ts-expect-error
            if (!isEmpty(update))
                await effect.update(update);
        }
        else if (!effect.transfer && effect.updateDuration().type === "turns") {
            let seconds = Math.floor(Math.max(Math.floor(effect.duration.remaining), 0) * CONFIG.time.roundTime);
            if (Number.isNaN(seconds) && combat) {
                seconds = Math.max(Math.floor((effect.duration.startRound + effect.duration.rounds - combat.round) * CONFIG.time.roundTime), 0);
            }
            update = setDurationSeconds(effect);
            update["duration.seconds"] = seconds;
            if (seconds <= 0)
                update["disabled"] = true;
            else {
                update["duration.startTime"] = game.time.worldTime;
                GMEffectQueue("addEffect", effect);
            }
            if (debugEnabled > 0)
                warn("update effect setting expiry seconds", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
            await effect.update(update);
        }
    }
}
function getEffectActor(effect) {
    let actor = effect.parent;
    if (effect.parent instanceof Item)
        actor = actor.parent;
    return actor;
}
export function readyTimesUpSetup() {
    Hooks.on("createActiveEffect", (effect, options, user) => {
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (effect.transfer && !(getEffectActor(effect) instanceof Actor))
            return;
        if (debugEnabled > 0)
            debug("create active effect", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
        // record passive, start time/round/turn duration any flags of relevance.
        if (hasDurationSeconds(effect)) {
            if (debugEnabled > 0)
                warn("create effect", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
            GMEffectQueue("createEffect", effect);
        }
    });
    Hooks.on("preUpdateActiveEffect", (effect, update, options, user) => {
        if (!timesUpEnabled || !enablePassiveEffects || !isTransferEffect(effect))
            return true;
        const durationToUse = effect.updateDuration();
        if (update.duration) {
            durationToUse.seconds = update.duration.seconds ?? durationToUse.seconds;
            durationToUse.rounds = update.duration.rounds ?? durationToUse.rounds;
            durationToUse.turns = update.duration.turns ?? durationToUse.turns;
        }
        // If disabled updated to false, isTransfer and expired then reset the duration start time/round/turn
        if (hasExpiry(durationToUse)) {
            if (debugEnabled > 1)
                debug("Update active effect", effect.uuid, update, effect.updateDuration(), isTransferEffect(effect));
            const isExpired = isDurationExpired(durationToUse, { secondsOnly: true }) || !durationToUse.starTime;
            if (!isExpired)
                return true;
            if (update.disabled === false) {
                // we are enabling an expired transfer effect set it's start time/round/turn to now.
                if (debugEnabled > 0)
                    warn("resetting duration", effect.uuid, durationToUse, isTransferEffect(effect));
                // game.combat should be the current users combat
                const unexpireUpdate = getUnexpireEffectUpdate(effect, game.combat, durationToUse);
                update = mergeObject(update, unexpireUpdate, { inplace: true });
            }
            else if (update.disabled ?? effect.disabled === true) {
                if (debugEnabled > 0)
                    warn("expiring effect", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
                const expireUpdate = getExpireTransferEffectUpdate(effect);
                update = mergeObject(update, expireUpdate, { inplace: true });
            }
        }
        if (debugEnabled > 0)
            warn("update effect", effect.uuid, update, effect.updateDuration(), isTransferEffect(effect));
        return true;
    });
    Hooks.on("updateActiveEffect", async (effect, update, options, user) => {
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (!effect.transfer && effect.parent instanceof Item)
            return;
        if (!hasDurationSeconds(effect) || (update.disabled ?? effect.disabled))
            GMEffectQueue("deleteEffect", effect);
        else if (hasDurationSeconds(effect))
            GMEffectQueue("createEffect", effect);
        return;
    });
    Hooks.on("deleteActiveEffect", (effect, options, user) => {
        // if (!timesUpEnabled) return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (debugEnabled > 1)
            debug("active effect deleted", effect.uuid, effect.updateDuration(), isTransferEffect(effect));
        GMEffectQueue("deleteEffect", effect);
    });
    Hooks.on("updateWorldTime", async (worldTime, dt, options, user) => {
        if (!timesUpEnabled)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        warn("world time update", worldTime, dt);
        for (let entry of effectQueue.effects) {
            //@ts-expect-error
            const effect = fromUuidSync(entry);
            if (effect && isEffectExpired(effect, { secondsOnly: true })) {
                if (debugEnabled > 0)
                    warn("world time expired effect", effect.name, effect.uuid, effect.updateDuration(), isTransferEffect(effect));
                GMEffectQueue("deleteEffect", effect);
                expireEffect(effect);
            }
        }
    });
    Hooks.on("preUpdateCombat", async (combat, update, options, user) => {
        //@ts-expect-error
        if (update.round !== undefined)
            foundry.utils.setProperty(options, "times-up.combat.round", combat.round);
        //@ts-expect-error
        if (update.turn !== undefined)
            foundry.utils.setProperty(options, "times-up.combat.turn", combat.turn);
        return true;
    });
    Hooks.on("updateCombat", async (combat, update, options, user) => {
        if (debugEnabled > 1)
            debug("update combat", combat, update, options, user);
        // Think about multiple gms and viewing different combats.
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        let combatantIndex = 0;
        const totalTurns = combat.combatants?.contents.length ?? 0;
        //@ts-expect-error
        const lastCombatTurn = (foundry.utils.getProperty(options, "times-up.combat.round") ?? combat.round) * totalTurns + (foundry.utils.getProperty(options, "times-up.combat.turn") ?? combat.turn);
        for (let combatant of combat.turns) {
            if (combatant.actor) {
                let actor = combatant.actor;
                for (let effect of actor.appliedEffects) {
                    if (isEffectExpired(effect, { combat, secondsOnly: false })) {
                        if (!!timesUpEnabled) {
                            if (debugEnabled > 0)
                                warn("update combat expired effect", effect.name, effect.updateDuration(), isTransferEffect(effect));
                            GMEffectQueue("deleteEffect", effect);
                            await expireEffect(effect);
                        }
                    }
                }
                //@ts-expect-error
                let combatantNextTurn = (foundry.utils.getProperty(options, "times-up.combat.round") ?? combat.round) * totalTurns + combatantIndex;
                if (combatantNextTurn < lastCombatTurn)
                    combatantNextTurn += totalTurns;
                if (update.round !== undefined || update.turn !== undefined) {
                    // Handle any turn start/end effects
                    for (let effect of actor.allApplicableEffects()) {
                        const checkTurn = (update.round ?? combat.round) * totalTurns + (update.turn ?? combat.turn);
                        //@ts-expect-error
                        const specialDuration = foundry.utils.getProperty(effect, "flags.dae.specialDuration");
                        if (specialDuration?.length > 0) {
                            if ((specialDuration.includes("turnStart") && (checkTurn >= combatantNextTurn) && lastCombatTurn !== combatantNextTurn)
                                || (specialDuration?.includes("turnEnd") && (checkTurn > combatantNextTurn))) {
                                GMEffectQueue("deleteEffect", effect);
                                await expireEffect(effect);
                            }
                        }
                        for (let turn of combat.turns) {
                            let testActor = turn.actor;
                            if (!testActor)
                                continue;
                            for (let effect of testActor.appliedEffects) {
                                //@ts-expect-error
                                const specialDuration = foundry.utils.getProperty(effect, "flags.dae.specialDuration");
                                if (!(specialDuration?.length > 0))
                                    continue;
                                if (!effect.origin?.startsWith(actor?.uuid))
                                    continue;
                                let effectStart = (effect.duration.startRound ?? 0) * totalTurns + (effect.duration.startTurn ?? 0);
                                if (specialDuration.includes("turnStartSource") && (checkTurn >= combatantNextTurn) && lastCombatTurn !== combatantNextTurn) {
                                    GMEffectQueue("deleteEffect", effect);
                                    await expireEffect(effect);
                                }
                                else if (specialDuration.includes("turnEndSource") && (checkTurn > combatantNextTurn) && checkTurn > effectStart + 1) {
                                    GMEffectQueue("deleteEffect", effect);
                                    await expireEffect(effect);
                                }
                            }
                        }
                        if (dae) {
                            const macroRepeat = getMacroRepeat(effect);
                            switch (macroRepeat) {
                                case "startEveryTurn":
                                case "startEveryTurnAny":
                                    if ((checkTurn >= combatantNextTurn) && (lastCombatTurn !== combatantNextTurn)) {
                                        if (macroRepeat === "startEveryTurn" && (effect.disabled || effect.isSuppressed))
                                            break;
                                        dae.daeMacro("each", actor, effect, { actor, effectId: effect.id, tokenId: combatant.token?.id, actorUuid: actor.uuid, actorID: actor.id, efData: effect.toObject() });
                                    }
                                    break;
                                case "endEveryTurn":
                                case "endEveryTurnAny":
                                    if (checkTurn > combatantNextTurn) {
                                        if (macroRepeat === "endEveryTurn" && (effect.disabled || effect.isSuppressed))
                                            break;
                                        dae.daeMacro("each", actor, effect, { actor, effectId: effect.id, tokenId: combatant.token?.id, actorUuid: actor.uuid, actorID: actor.id, efData: effect.toObject() });
                                    }
                                    break;
                            }
                        }
                    }
                    // Handle any each turn effects
                    // starting combat is update round 0 turn 1
                }
            }
            combatantIndex += 1;
        }
    });
    Hooks.on("combatStart", async (combat, options, user) => {
        if (!timesUpEnabled)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        for (let combatant of combat.combatants) {
            if (combatant.actor)
                setEffectsExpiryToRounds(combatant.actor, combat);
        }
    });
    Hooks.on("createCombatant", async (combatant, options, user) => {
        if (!timesUpEnabled)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (combatant.actor)
            setEffectsExpiryToRounds(combatant.actor, combatant.combat);
    });
    Hooks.on("deleteCombatant", async (combatant, options, user) => {
        if (!timesUpEnabled)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (combatant.actor)
            setEffectsExpiryToSeconds(combatant.actor);
    });
    Hooks.on("deleteCombat", async (combat, options, user) => {
        if (!timesUpEnabled)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        for (let combatant of combat.combatants) {
            if (combatant.actor)
                setEffectsExpiryToSeconds(combatant.actor, combat);
        }
    });
    Hooks.on("createItem", async (item, options, user) => {
        if (CONFIG.ActiveEffect.legacyTransferral)
            return;
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (debugEnabled > 1)
            debug("create item", item.uuid, item.effects);
        item.effects.forEach(effect => {
            if (!effect.disabled && hasDurationSeconds(effect) && isTransferEffect(effect)) {
                if (debugEnabled > 0)
                    warn("create effect", effect.uuid, effect.duration, isTransferEffect(effect));
                GMEffectQueue("createEffect", effect);
            }
        });
    });
    Hooks.on("updateItem", async (item, update, options, user) => {
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (CONFIG.ActiveEffect.legacyTransferral)
            return;
        for (let effect of item.effects) {
            if (effect.disabled || !hasDuration(effect) || !isTransferEffect(effect)) {
                if (debugEnabled > 1)
                    debug("updateItem | remove from queue", effect.uuid, effect.duration, isTransferEffect(effect));
                GMEffectQueue("deleteEffect", effect);
                continue;
            }
            // Only auto expire when seconds is updated - since we don't know what combat to use
            // Will have to wait for the combat to update
            if (isEffectExpired(effect, { secondsOnly: true })) {
                if (debugEnabled > 0)
                    warn("updateItem | expired", effect.uuid, effect.duration, isTransferEffect(effect));
                if (!!timesUpEnabled) {
                    // update the effect queue
                    GMEffectQueue("deleteEffect", effect);
                    expireEffect(effect);
                }
            }
            else if (hasDurationSeconds(effect)) {
                if (debugEnabled > 0)
                    warn("updateItem | add to queue", effect.uuid, effect.duration, isTransferEffect(effect));
                GMEffectQueue("createEffect", effect);
            }
        }
    });
    Hooks.on("deleteItem", async (item, options, user) => {
        //@ts-expect-error
        if (!game.users.activeGM?.isSelf)
            return;
        if (debugEnabled > 1)
            debug("delete item", item.uuid, item.effects);
        item.effects.forEach(effect => {
            // remove from the effect queue
            if (debugEnabled > 1)
                debug("delete item | remove effect from queue", effect.uuid, isTransferEffect(effect));
            GMEffectQueue("deleteEffect", effect);
        });
    });
}
export function initTimesUpSetup() {
}
export function hasMacroRepeat(effectData) {
    return (["startEveryTurn", "endEveryTurn"].includes(effectData.flags?.dae?.macroRepeat));
}
export function getMacroRepeat(effectData) {
    return effectData.flags?.dae?.macroRepeat;
}
export async function oldPurgeDeletedEffects() {
    if (!game.user.isGM)
        return;
    let count = 0;
    for (let e of effectQueue.effects.keys()) {
        let { entityUuid, actorUuid, effectData } = effectQueue.effects.get(e);
        if (!entityUuid)
            entityUuid = actorUuid;
        if (actorUuid) {
            entityUuid = actorUuid;
            const efUuid = `${entityUuid}.ActiveEffect.${effectData._id}`;
            effectData.uuid = efUuid;
            effectQueue.effects.set(efUuid, { entityUuid, effectData });
            console.log("times-up | migrating old form entry ", e, effectData);
            effectQueue.effects.delete(e);
        }
        for (let e of effectQueue.effects.keys()) {
            //@ts-expect-error
            if (!fromUuidSync(e))
                effectQueue.effects.delete(e);
            console.log("times-up | Deleteing unreachable effect", e);
        }
    }
    saveQueue();
    if (count)
        console.warn("times-up | Deleted", count, "effects with no entity");
}
export function GMEffectQueue(action, effect) {
    //@ts-expect-error activeGM
    if (!game.users?.activeGM?.isSelf)
        return;
    switch (action) {
        case "createEffect":
            if (effect.uuid.startsWith("Compendium"))
                return;
            if (hasDuration(effect)) {
                if (!effectQueue.effects.has(effect.uuid)) {
                    warn("Adding effect to queue", effect.uuid);
                    effectQueue.effects.add(effect.uuid);
                    saveQueue();
                }
            }
            break;
        case "deleteEffect":
            warn("Delete effect", effect);
            if (effectQueue.effects.has(effect.uuid)) {
                warn("Removing effect from queue", effect.uuid);
                effectQueue.effects.delete(effect.uuid);
                saveQueue();
            }
            break;
    }
}
export function hasDuration(effect) {
    return hasExpiry(effect.duration);
}
export function hasExpiry(duration) {
    return duration && (duration.seconds || duration.turns || duration.rounds);
}
export function hasDurationSeconds(effectData) {
    return effectData.duration && effectData.duration.seconds;
}
