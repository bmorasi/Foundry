import { aboutTimeInstalled, timesUpInstalled, expireRealTime, simpleCalendarInstalled, allMacroEffects, getMacro, tokenForActor, delay, actorFromUuid, getTokenDocument, getToken } from "./dae.js";
import { warn, debug, error, debugEnabled } from "../dae.js";
export class GMActionMessage {
    action;
    sender;
    targetGM; // gm id
    data;
    constructor(action, sender, targetGM, data) {
        this.action = action;
        this.sender = sender;
        this.targetGM = targetGM;
        this.data = data;
    }
}
export var socketlibSocket = undefined;
export let setupSocket = () => {
    socketlibSocket = globalThis.socketlib.registerModule("dae");
    socketlibSocket.register("test", _testMessage);
    socketlibSocket.register("setTokenVisibility", _setTokenVisibility);
    socketlibSocket.register("setTileVisibility", _setTileVisibility);
    socketlibSocket.register("blindToken", _blindToken);
    socketlibSocket.register("restoreVision", _restoreVision);
    socketlibSocket.register("recreateToken", _recreateToken);
    socketlibSocket.register("createToken", _createToken);
    socketlibSocket.register("deleteToken", _deleteToken);
    socketlibSocket.register("renameToken", _renameToken);
    //  socketlibSocket.register("moveToken", _moveToken); TODO find out if this is used anywhere
    socketlibSocket.register("applyTokenMagic", _addTokenMagic);
    socketlibSocket.register("removeTokenMagic", _removeTokenMagic);
    socketlibSocket.register("applyActiveEffects", _applyActiveEffects);
    socketlibSocket.register("setTokenFlag", _setTokenFlag);
    socketlibSocket.register("setFlag", _setFlag);
    socketlibSocket.register("unsetFlag", _unsetFlag);
    socketlibSocket.register("deleteEffects", _deleteEffects);
    socketlibSocket.register("deleteUuid", _deleteUuid);
    socketlibSocket.register("suspendActiveEffect", _suspendActiveEffect);
    socketlibSocket.register("executeMacro", _executeMacro);
    socketlibSocket.register("createActorItem", _createActorItem);
    socketlibSocket.register("removeActorItem", _removeActorItem);
    socketlibSocket.register("_updateActor", _updateActor);
    socketlibSocket.register("itemReplaceEffects", _itemReplaceEffects);
};
async function _itemReplaceEffects(data) {
    //@ts-expect-error
    const item = fromUuidSync(data.itemUuid);
    // await item.update({"effects": []});
    return item.update({ "effects": data.effects });
}
async function _updateActor(data) {
    const actor = await fromUuid(data.actorUuid);
    return actor?.update(data.update);
}
async function _removeActorItem(data) {
    const { uuid, itemUuid, itemUuids } = data;
    for (let itemUuid of itemUuids ?? []) {
        const item = await fromUuid(itemUuid);
        if (!(item instanceof Item) || !item?.isOwned)
            continue; // Just in case we are trying to delete a world/compendium item
        await item.delete();
    }
}
async function _createActorItem(data) {
    const { uuid, itemDetails, effectUuid } = data;
    const [itemUuid, option] = itemDetails.split(",").map(s => s.trim());
    const item = await fromUuid(itemUuid);
    if (!item || !(item instanceof Item)) {
        error(`createActorItem could not find item ${itemUuid}`);
        return [];
    }
    let actor = actorFromUuid(uuid);
    if (!actor) {
        error(`createActorItem could not find Actor ${uuid}`);
        return [];
    }
    if (actor.token) { // need to delay for unliked tokens as there is a timing issue
        if (foundry.utils.isNewerVersion("11.293", game.version))
            await delay(250);
    }
    let itemData = item?.toObject(true);
    if (!itemData)
        return [];
    //@ts-expect-error unsupportedItemTypes
    if (actor?.sheet?.constructor.unsupportedItemTypes.has(itemData.type) || itemData.system.advancement?.length) {
        ui.notifications.warn(game.i18n.format("DND5E.ActorWarningInvalidItem", {
            itemType: game.i18n.localize(CONFIG.Item.typeLabels[itemData.type]),
            actorType: game.i18n.localize(CONFIG.Actor.typeLabels[actor.type])
        }));
        return [];
    }
    foundry.utils.setProperty(itemData, "flags.dae.DAECreated", true);
    //@ts-expect-error
    const documents = await actor.createEmbeddedDocuments("Item", [itemData]);
    if (data.callItemMacro) {
        const change = { key: "macro.itemMacro" };
        for (let item of documents) {
            const effectData = { itemUuid: item.uuid, flags: {} };
            const macro = await getMacro({ change, name: "" }, item, effectData);
            let lastArg = foundry.utils.mergeObject({ itemUuid: item.uuid }, {
                actorId: actor.id,
                actorUuid: actor.uuid,
            }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
            let data = {
                action: "onCreate",
                lastArg,
                args: [],
                macroData: { change, name: "", effectData: undefined },
                actor,
                token: tokenForActor(actor),
                item
            };
            _executeMacro(data);
            // const result = await macro.execute(data.action, ...data.args, data.lastArg)
        }
        ;
    }
    if (option === "permanent")
        return documents;
    //@ts-expect-error CONFIG
    const effect = await fromUuid(effectUuid);
    if (!effect) {
        console.warn(`dae | createActorItem could not fetch ${effectUuid}`);
        return documents;
    }
    const itemsToDelete = effect?.flags.dae?.itemsToDelete ?? [];
    itemsToDelete.push(documents[0].uuid);
    await effect.update({ "flags.dae.itemsToDelete": itemsToDelete });
    return documents;
}
async function _executeMacro(data) {
    const macro = await getMacro({ change: data.macroData.change, name: data.macroData.name }, data.item, data.macroData.effectData);
    let v11args = {};
    v11args[0] = "on";
    v11args[1] = data.lastArg;
    v11args.length = 2;
    v11args.lastArg = data.lastArg;
    const speaker = data.actor ? ChatMessage.getSpeaker({ actor: data.actor }) : undefined;
    const AsyncFunction = (async function () { }).constructor;
    //@ts-expect-error
    const fn = new AsyncFunction("speaker", "actor", "token", "character", "item", "args", macro.command);
    return fn.call(this, speaker, data.actor, data.token, undefined, data.item, v11args);
}
async function _suspendActiveEffect(data) {
    const effect = await fromUuid(data.uuid);
    if (!effect)
        return;
    if (effect instanceof CONFIG.ActiveEffect.documentClass) {
        return effect.update({ disabled: true });
    }
}
async function _deleteUuid(data) {
    // don't allow deletion of compendium entries or world Items
    if (data.uuid.startsWith("Compendium") || data.uuid.startsWith("Item"))
        return false;
    //@ts-expect-error fromUuidSync
    const entity = fromUuidSync(data.uuid);
    if (!entity)
        return false;
    if (entity instanceof CONFIG.Item.documentClass)
        return await entity.delete();
    if (entity instanceof CONFIG.Token.documentClass)
        return await entity.delete();
    if (entity instanceof CONFIG.ActiveEffect.documentClass)
        return await entity.delete();
    if (entity instanceof CONFIG.MeasuredTemplate.documentClass)
        return await entity.delete();
    return false;
}
function _testMessage(data) {
    console.log("DyamicEffects | test message received", data);
    return "Test message received and processed";
}
async function _setTokenVisibility(data) {
    //@ts-expect-error fromUuidSync
    await fromUuidSync(data.tokenUuid)?.update({ hidden: data.hidden });
}
async function _setTileVisibility(data) {
    //@ts-expect-error fromUuidSync
    return await fromUuidSync(data.tileUuid)?.update({ visible: data.hidden });
}
async function _applyActiveEffects(data) {
    return await applyActiveEffects(data);
}
async function _recreateToken(data) {
    //TODO this looks odd - should get the token data form the tokenUuid?
    await _createToken(data);
    //@ts-expect-error fromUuidSync
    const token = await fromUuidSync(data.tokenUuid);
    return token?.delete();
}
async function _createToken(data) {
    let scenes = game.scenes;
    let targetScene = scenes?.get(data.targetSceneId);
    //@ts-expect-error
    return await targetScene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(foundry.utils.duplicate(data.tokenData), { "x": data.x, "y": data.y, hidden: false }, { overwrite: true, inplace: true })]);
}
async function _deleteToken(data) {
    //@ts-expect-error fromUuidSync
    return await fromUuidSync(data.tokenUuid)?.delete();
}
async function _setTokenFlag(data) {
    const update = {};
    update[`flags.dae.${data.flagName}`] = data.flagValue;
    const tokenDocument = getTokenDocument(data.tokenUuid);
    return await tokenDocument?.update(update);
}
async function _setFlag(data) {
    if (data.actorUuid)
        return await actorFromUuid(data.actorUuid)?.setFlag("dae", data.flagId, data.value);
    else if (data.actorId)
        return await game.actors?.get(data.actorId)?.setFlag("dae", data.flagId, data.value);
    return undefined;
}
async function _unsetFlag(data) {
    return await actorFromUuid(data.actorUuid)?.unsetFlag("dae", data.flagId);
}
async function _blindToken(data) {
    const tokenDocument = getTokenDocument(data.tokenUuid);
    //@ts-expect-error .dfreds
    const dfreds = game.dfreds;
    if (!tokenDocument)
        return;
    if (tokenDocument.actor && dfreds?.effects?._blinded) {
        dfreds.effectInterface?.addEffect({ effectName: dfreds.effects._blinded.name, uuid: tokenDocument.actor?.uuid });
    }
    else {
        //@ts-expect-error .specialStatusEffects
        const blind = CONFIG.statusEffects.find(se => se.id === CONFIG.specialStatusEffects.BLIND);
        return await getToken(tokenDocument)?.toggleEffect(blind, { overlay: false, active: false });
    }
}
async function _restoreVision(data) {
    const tokenDocument = getTokenDocument(data.tokenUuid);
    //@ts-expect-error .dfreds
    const dfreds = game.dfreds;
    if (!tokenDocument)
        return;
    if (dfreds?.effects?._blinded && tokenDocument.actor) {
        dfreds.effectInterface?.removeEffect({ effectName: dfreds.effects._blinded.name, uuid: tokenDocument.actor.uuid });
    }
    else {
        //@ts-expect-error .specialStatusEffects
        const blind = CONFIG.statusEffects.find(se => se.id === CONFIG.specialStatusEffects.BLIND);
        return await getToken(tokenDocument)?.toggleEffect(blind, { overlay: false, active: false });
    }
}
async function _renameToken(data) {
    return await canvas.tokens?.placeables.find(t => t.id === data.tokenData._id)?.document.update({ "name": data.newName });
}
async function _addTokenMagic(data) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    const token = getToken(data.tokenUuid);
    if (token)
        return await tokenMagic.addFilters(token, data.effectId);
}
async function _removeTokenMagic(data) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    const token = getToken(data.tokenUuid);
    if (token)
        return await tokenMagic.deleteFilters(token, data.effectId);
}
async function _deleteEffects(data) {
    if (data.options === undefined)
        data.options = {};
    for (let idData of data.targets) {
        const actor = actorFromUuid(idData.uuid);
        if (!actor) {
            error("could not find actor for ", idData);
        }
        //@ts-expect-error .origin
        let effectsToDelete = actor?.effects?.filter(ef => ef.origin === data.origin && !data.ignore?.includes(ef.uuid));
        if (data.deleteEffects?.length > 0)
            effectsToDelete = effectsToDelete?.filter(ae => ae.id && data.deleteEffects.includes(ae.id));
        if (effectsToDelete && effectsToDelete?.length > 0) {
            try {
                if (!foundry.utils.getProperty(data, "options.expiry-reason"))
                    foundry.utils.setProperty(data, "options.expiry-reason", "programmed-removal");
                await actor?.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete.map(ef => ef.id ?? "XXX"), data.options);
            }
            catch (err) {
                warn("delete effects failed ", err);
                // TODO can get thrown since more than one thing tries to delete an effect
                return false;
            }
        }
    }
    if (globalThis.Sequencer && data.origin && data.removeSequencer !== false)
        globalThis.Sequencer.EffectManager.endEffects({ origin: data.origin });
    return true;
}
export async function applyActiveEffects({ activate, targetList, activeEffects, itemDuration, itemCardId = null, removeMatchLabel = false, toggleEffect = false, metaData = undefined, origin = undefined }) {
    // debug("apply active effect ", activate, tokenList, foundry.utils.duplicate(activeEffects), itemDuration)
    for (let targetId of targetList) {
        //@ts-expect-error
        let targetActor = fromUuidSync(targetId);
        if (!targetActor)
            continue;
        // Remove any existing effects that are not stackable or transfer from the same origin
        let currentStacks = 1;
        const origins = activeEffects.map(aeData => ({ origin: aeData.origin, name: (aeData.name || aeData.label) }));
        //const origins = actEffects.map(aeData => aeData.origin);
        // TODO: update exsiting count stacks rather than removing and adding.
        // find existing active effect that have same origin as one of our new effects 
        let removeList = targetActor.effects.filter(ae => {
            const notMulti = foundry.utils.getProperty(ae, "flags.dae.stackable") !== "multi";
            const noStackByName = (foundry.utils.getProperty(ae, "flags.dae.stackable") ?? "noneName") === "noneName";
            if (noStackByName) {
                return origins.find(o => o.name === ae.name && o.origin === ae.origin);
            }
            else
                return origins.find(o => {
                    const escapedLabel = o.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return o.origin === ae.origin
                        && (!removeMatchLabel || (new RegExp(`^${escapedLabel}( \\([0-9]+\\))?$`)).test(ae.name ?? ""));
                })
                    && foundry.utils.getProperty(ae, "flags.dae.transfer") === false
                    && !ae.transfer
                    && notMulti;
        });
        // TODO check why this is essentially done twice (noName, none)
        if (removeList.length > 0) {
            if (debugEnabled > 0)
                warn(`applyActiveEffects removing existing effects from actor ${targetActor?.name} ${toggleEffect}`, removeList);
            if (toggleEffect) {
                removeList = removeList.map(ef => ({ _id: ef.id, disabled: !ef.disabled, "duration.startTime": game.time.worldTime }));
                await targetActor.updateEmbeddedDocuments("ActiveEffect", removeList, { "expiry-reason": "toggle-effect" });
                activate = false;
            }
            else { // remove the effect
                const interval = removeList.some(ef => ef.flags.effectmacro || ef.changes.some(change => change.value.startsWith("macro"))) ? 250 : 1; // for unlinked tokens and effect macros that might create effects need a long delay
                currentStacks = removeList.filter(ae => foundry.utils.getProperty(ae, "flags.dae.stackable") === "count").reduce((acc, ae) => acc + (foundry.utils.getProperty(ae, "flags.dae.stacks") ?? 1), 1);
                removeList = removeList.map(ae => ae._id);
                await targetActor.deleteEmbeddedDocuments("ActiveEffect", removeList, { "expiry-reason": "effect-stacking" });
                if (targetActor.isToken && foundry.utils.isNewerVersion("11.293", game.version)) { // need to delay for unliked tokens as there is a timing issue
                    await delay(interval);
                }
            }
        }
        if (activate) {
            let dupEffects = foundry.utils.duplicate(activeEffects).filter(effectData => effectData.flags?.dae?.dontApply !== true); // .filter(aeData => !aeData.selfTarget));
            for (let aeData of dupEffects) {
                foundry.utils.setProperty(aeData, "flags.dae.actor", targetActor.uuid);
                if (foundry.utils.getProperty(aeData, "flags.dae.stackable") === "count") {
                    foundry.utils.setProperty(aeData, "flags.dae.stacks", currentStacks);
                    if (aeData.name || aeData.name === '')
                        aeData.name = `${aeData.name || aeData.label} (${foundry.utils.getProperty(aeData, "flags.dae.stacks")})`;
                    else
                        aeData.label = `${aeData.name || aeData.label} (${foundry.utils.getProperty(aeData, "flags.dae.stacks")})`;
                }
                if (aeData.changes.some(change => change.key === "macro.itemMacro")) { // populate the itemMacro data.
                    //@ts-expect-error fromUuidSync
                    const item = fromUuidSync(aeData.origin);
                    let macroCommand;
                    if (item instanceof Item) {
                        macroCommand = foundry.utils.getProperty(item, "flags.dae.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.data.command");
                    }
                    else if (aeData.flags?.dae?.itemData) {
                        const itemData = foundry.utils.getProperty(aeData, "flags.dae.itemData");
                        if (itemData)
                            macroCommand = foundry.utils.getProperty(itemData, "flags.dae.macro.command") ?? foundry.utils.getProperty(itemData, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(itemData, "flags.itemacro.macro.data.command");
                    }
                    foundry.utils.setProperty(aeData, "flags.dae.itemMacro", macroCommand);
                }
                // convert item duration to seconds/rounds/turns according to combat
                if (aeData.duration.seconds) {
                    aeData.duration.startTime = game.time.worldTime;
                    const inCombat = targetActor.inCombat;
                    let convertedDuration;
                    if (inCombat && (aeData.duration.rounds || aeData.duration.turns)) {
                        convertedDuration = {
                            type: "turns",
                            rounds: aeData.duration.rounds ?? 0,
                            turns: aeData.duration.turns ?? 0
                        };
                    }
                    else
                        convertedDuration = convertDuration({ value: aeData.duration.seconds, units: "second" }, inCombat);
                    if (aeData.duration.seconds === -1) { // special case duration of -1 seconds
                        delete convertedDuration.rounds;
                        delete convertedDuration.turns;
                        delete convertedDuration.seconds;
                    }
                    if (convertedDuration.type === "turns") {
                        aeData.duration.rounds = convertedDuration.rounds;
                        aeData.duration.turns = convertedDuration.turns;
                        aeData.startRound = game.combat?.round;
                        aeData.startTurn = game.combat?.turn;
                        delete aeData.duration.seconds;
                    }
                }
                else if (aeData.duration.rounds || aeData.duration.turns) {
                    aeData.duration.startRound = game.combat?.round;
                    aeData.duration.startTurn = game.combat?.turn;
                }
                else { // no specific duration on effect use spell duration
                    const inCombat = targetActor.inCombat;
                    const convertedDuration = convertDuration(itemDuration, inCombat);
                    debug("converted duration ", convertedDuration, inCombat, itemDuration);
                    if (convertedDuration.type === "seconds") {
                        aeData.duration.seconds = convertedDuration.seconds;
                        aeData.duration.startTime = game.time.worldTime;
                    }
                    else if (convertedDuration.type === "turns") {
                        aeData.duration.rounds = convertedDuration.rounds;
                        aeData.duration.turns = convertedDuration.turns;
                        aeData.duration.startRound = game.combat?.round;
                        aeData.duration.startTurn = game.combat?.turn;
                    }
                }
                warn("Apply active effects ", aeData, itemCardId);
                if (foundry.utils.isNewerVersion(game.version, "11.0")) {
                    if (aeData.flags?.core?.statusId)
                        aeData.statuses = [aeData.flags.core.statusId];
                    if (aeData.flags?.core?.statusId !== undefined)
                        delete aeData.flags.core.statusId;
                }
                foundry.utils.setProperty(aeData, "flags.dae.transfer", false);
                let source = await fromUuid(aeData.origin);
                let context = targetActor.getRollData();
                if (false && source instanceof CONFIG.Item.documentClass) {
                    context = source?.getRollData();
                }
                context = foundry.utils.mergeObject(context, { "target": getTokenDocument(targetActor)?.id, "targetUuid": getTokenDocument(targetActor)?.uuid, "targetActorUuid": targetActor?.uuid, "itemCardid": itemCardId, "@target": "target", "stackCount": "@stackCount", "item": "@item", "itemData": "@itemData" });
                let newChanges = [];
                for (let change of aeData.changes) {
                    if (allMacroEffects.includes(change.key) || ["flags.dae.onUpdateTarget", "flags.dae.onUpdateSource"].includes(change.key)) {
                        //@ts-expect-error fromUuidSync
                        let originEntity = fromUuidSync(aeData.origin);
                        let originItem;
                        let sourceActor;
                        if (originEntity instanceof Item) {
                            originItem = originEntity;
                            sourceActor = originEntity.actor;
                        }
                        else if (originEntity instanceof Actor)
                            sourceActor = originEntity;
                        //@ts-expect-error
                        else if (originEntity instanceof ActiveEffect && originEntity.transfer)
                            sourceActor = originEntity?.parent?.parent;
                        else if (originEntity instanceof ActiveEffect)
                            sourceActor = originEntity?.parent;
                        if (change.key === "flags.dae.onUpdateTarget") {
                            // for onUpdateTarget effects, put the source actor, the target uuid, the origin and the original change.value
                            change.value = `${aeData.origin}, ${getTokenDocument(targetActor)?.uuid}, ${tokenForActor(sourceActor)?.document.uuid ?? ""}, ${sourceActor.uuid}, ${change.value}`;
                        }
                        else if (change.key === "flags.dae.onUpdateSource") {
                            change.value = `${aeData.origin}, ${tokenForActor(sourceActor)?.document.uuid ?? ""}, ${getTokenDocument(targetActor)?.uuid}, ${sourceActor.uuid}, ${change.value}`;
                            const newEffectData = foundry.utils.duplicate(aeData);
                            newEffectData.changes = [foundry.utils.duplicate(change)];
                            newEffectData.changes[0].key = "flags.dae.onUpdateTarget";
                            const effects = await sourceActor.createEmbeddedDocuments("ActiveEffect", [newEffectData], { metaData });
                            if (effects)
                                for (let effect of effects) {
                                    if (effect.addDependent) {
                                        //@ts-expect-error
                                        const origin = fromUuidSync(effect.origin);
                                        //@ts-expect-error
                                        if (origin instanceof ActiveEffect && effect.addDependent)
                                            await origin.addDependent(effect);
                                    }
                                }
                        }
                        // if (["macro.execute", "macro.itemMacro", "roll", "macro.actorUpdate"].includes(change.key)) {
                        if (typeof change.value === "number") {
                        }
                        else if (typeof change.value === "string") {
                            //@ts-expect-error replaceFormulaData
                            change.value = Roll.replaceFormulaData(change.value, context, { missing: 0, warn: false });
                            change.value = change.value.replace("##", "@");
                        }
                        else {
                            change.value = foundry.utils.duplicate(change.value).map(f => {
                                if (f === "@itemCardId")
                                    return itemCardId;
                                if (f === "@target")
                                    return getToken(targetActor)?.id;
                                if (f === "@targetUuid")
                                    return getTokenDocument(targetActor)?.uuid;
                                return f;
                            });
                        }
                    }
                    else {
                        // context = me
                        // For non macros most @fields can be left to be evaluated when the change is applied by dae
                        // rgeObject(context, { "target": tokenOrDocument.id, "@target": "target", tokenUuid, "targetUuid": tokenUuid, "itemCardid": itemCardId, "stackCount": "@stackCount", "item": "@item", "itemData": "@itemData" }, { overwrite: true });
                        // change.value = Roll.replaceFormulaData(change.value, context, { missing: 0, warn: false })
                        const targetContext = { "targetUuid": getTokenDocument(targetActor)?.uuid, "target": getToken(targetActor)?.id, "tokenUuid": getTokenDocument(targetActor)?.uuid, "token": getToken(targetActor)?.id };
                        for (let key of Object.keys(targetContext)) {
                            change.value = change.value.replace(`@${key}`, targetContext[key]);
                        }
                    }
                    newChanges.push(change);
                }
                aeData.changes = newChanges;
            }
            if (dupEffects.length > 0) {
                if (debugEnabled > 0)
                    warn(`applyActiveEffects creating effects ${targetActor.name}`, dupEffects);
                // let timedRemoveList = await actionQueue.add(targetActor.createEmbeddedDocuments.bind(targetActor), "ActiveEffect", dupEffects, { metaData });
                let timedRemoveList = await targetActor.createEmbeddedDocuments("ActiveEffect", dupEffects, { metaData });
                for (let effect of timedRemoveList) {
                    if (effect.addDependent) {
                        //@ts-expect-error
                        const origin = fromUuidSync(effect.origin);
                        if (origin instanceof ActiveEffect) {
                            //@ts-expect-error
                            await origin.addDependent(effect);
                        }
                    }
                }
                ;
                setTimeout(() => {
                    if (globalThis.EffectCounter) {
                        for (let effectData of dupEffects) {
                            let flags = effectData.flags;
                            if (flags?.dae?.stackable === "count" && flags?.dae?.stacks) {
                                const counter = globalThis.EffectCounter.findCounter(getToken(targetActor), effectData.icon);
                                counter.setValue(flags.dae.stacks);
                            }
                        }
                    }
                }, 1000);
                //TODO remove this when timesup is in the wild.
                if (!timesUpInstalled) { // do the kludgey old form removal
                    let doRemoveEffect = async (tokenUuid, removeEffect) => {
                        const actor = actorFromUuid(tokenUuid);
                        let removeId = removeEffect._id;
                        if (removeId && actor?.effects.get(removeId)) {
                            //@ts-expect-error
                            await actor?.deleteEmbeddedDocuments("ActiveEffect", [removeId], { "expiry-reason": "deprecated real time expiry" });
                        }
                    };
                    if (!Array.isArray(timedRemoveList))
                        timedRemoveList = [timedRemoveList];
                    timedRemoveList.forEach((ae) => {
                        // need to do separately as they might have different durations
                        let duration = ae.duration?.seconds || 0;
                        if (!duration) {
                            duration = ((ae.duration.rounds ?? 0) + ((ae.duration.turns > 0) ? 1 : 0)) * CONFIG.time.roundTime;
                        }
                        warn("removing effect ", ae.toObject, " in ", duration, " seconds ");
                        if (duration && aboutTimeInstalled) {
                            //@ts-expect-error .Gametime
                            game.Gametime.doIn({ seconds: duration }, doRemoveEffect, tokenUuid, ae.toObject());
                        }
                        else if (duration && expireRealTime) { //TODO decide what to do for token magic vs macros
                            setTimeout(doRemoveEffect, duration * 1000 || 6000, targetActor.uuid, ae.toObject());
                        }
                    });
                }
            }
        }
        ;
    }
    ;
}
export function convertDuration(itemDuration, inCombat) {
    // TODO rewrite this abomination
    const useTurns = inCombat && timesUpInstalled;
    if (!itemDuration || (itemDuration.units === "second" && itemDuration.value < CONFIG.time.roundTime)) { // no duration or very short (less than 1 round)
        if (useTurns)
            return { type: "turns", seconds: 0, rounds: 0, turns: 1 };
        else
            return { type: "seconds", seconds: Math.min(1, itemDuration.value), rounds: 0, turns: 0 };
    }
    if (!simpleCalendarInstalled) {
        switch (itemDuration.units) {
            case "turn":
            case "turns": return { type: useTurns ? "turns" : "seconds", seconds: 1, rounds: 0, turns: itemDuration.value };
            case "round":
            case "rounds": return { type: useTurns ? "turns" : "seconds", seconds: itemDuration.value * CONFIG.time.roundTime, rounds: itemDuration.value, turns: 0 };
            case "second":
            case "seconds":
                return { type: useTurns ? "turns" : "seconds", seconds: itemDuration.value, rounds: itemDuration.value / CONFIG.time.roundTime, turns: 0 };
            case "minute":
            case "minutes":
                let durSeconds = itemDuration.value * 60;
                if (durSeconds / CONFIG.time.roundTime <= 10) {
                    return { type: useTurns ? "turns" : "seconds", seconds: durSeconds, rounds: durSeconds / CONFIG.time.roundTime, turns: 0 };
                }
                else {
                    return { type: "seconds", seconds: durSeconds, rounds: durSeconds / CONFIG.time.roundTime, turns: 0 };
                }
            case "hour":
            case "hours": return { type: "seconds", seconds: itemDuration.value * 60 * 60, rounds: 0, turns: 0 };
            case "day":
            case "days": return { type: "seconds", seconds: itemDuration.value * 60 * 60 * 24, rounds: 0, turns: 0 };
            case "week":
            case "weeks": return { type: "seconds", seconds: itemDuration.value * 60 * 60 * 24 * 7, rounds: 0, turns: 0 };
            case "month":
            case "months": return { type: "seconds", seconds: itemDuration.value * 60 * 60 * 24 * 30, rounds: 0, turns: 0 };
            case "year":
            case "years": return { type: "seconds", seconds: itemDuration.value * 60 * 60 * 24 * 30 * 365, rounds: 0, turns: 0 };
            case "inst": return { type: useTurns ? "turns" : "seconds", seconds: 1, rounds: 0, turns: 1 };
            case "spec": return { type: useTurns ? "none" : "seconds", seconds: undefined, rounds: undefined, turns: undefined };
            default:
                console.warn("dae | unknown time unit found", itemDuration.units);
                return { type: useTurns ? "none" : "seconds", seconds: undefined, rounds: undefined, turns: undefined };
        }
    }
    else {
        switch (itemDuration.units) {
            case "perm":
                return { type: "seconds", seconds: undefined, rounds: undefined, turns: undefined };
            case "turn":
            case "turns": return { type: useTurns ? "turns" : "seconds", seconds: 1, rounds: 0, turns: itemDuration.value };
            case "round":
            case "rounds": return { type: useTurns ? "turns" : "seconds", seconds: itemDuration.value * CONFIG.time.roundTime, rounds: itemDuration.value, turns: 0 };
            case "second":
                return { type: useTurns ? "turns" : "seconds", seconds: itemDuration.value, rounds: itemDuration.value / CONFIG.time.roundTime, turns: 0 };
            case "inst": return { type: useTurns ? "turns" : "seconds", seconds: 1, rounds: 0, turns: 1 };
            case "spec": return { type: useTurns ? "none" : "seconds", seconds: undefined, rounds: undefined, turns: undefined };
            default:
                let interval = {};
                interval[itemDuration.units] = itemDuration.value;
                const durationSeconds = globalThis.SimpleCalendar.api.timestampPlusInterval(game.time.worldTime, interval) - game.time.worldTime;
                if (durationSeconds / CONFIG.time.roundTime <= 10) {
                    return { type: useTurns ? "turns" : "seconds", seconds: durationSeconds, rounds: Math.floor(durationSeconds / CONFIG.time.roundTime), turns: 0 };
                }
                else {
                    return { type: "seconds", seconds: durationSeconds, rounds: Math.floor(durationSeconds / CONFIG.time.roundTime), turns: 0 };
                }
            //      default: return {type: combat ? "none" : "seconds", seconds: CONFIG.time.roundTime, rounds: 0, turns: 1};
        }
    }
}