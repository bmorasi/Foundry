import { applyActiveEffects, socketlibSocket } from "./GMAction.js";
import { warn, error, debug, setDebugLevel, i18n, debugEnabled } from "../dae.js";
import { ActiveEffects } from "./apps/ActiveEffects.js";
import { macroActorUpdate } from "./daeMacros.js";
import { ValidSpec } from "./Systems/DAESystem.js";
import { DAESystemDND5E } from "./Systems/DAEdnd5e.js";
import { DAESystemSW5E } from "./Systems/DAEsw5e.js";
import { DIMEditor } from "./apps/DIMEditor.js";
let templates = {};
export var aboutTimeInstalled = false;
export var timesUpInstalled = false;
export var simpleCalendarInstalled = false;
export var cltActive;
export var ceActive;
export var atlActive;
export var furnaceActive;
export var itemacroActive;
export var midiActive;
export var statusCounterActive;
// export var useAbilitySave;
export var activeConditions;
export var confirmDelete;
export var ehnanceStatusEffects;
export var expireRealTime;
export var noDupDamageMacro;
export var disableEffects;
export var daeTitleBar;
export var DIMETitleBar;
export var daeColorTitleBar;
export var daeNoTitleText;
export var libWrapper;
export var needStringNumericValues;
export var actionQueue;
export var linkedTokens;
export var CECustomEffectsItemUuid;
export var rewriteTransferOrigin;
export var allMacroEffects = ["macro.execute", "macro.execute.local", "macro.execute.GM", "macro.itemMacro", "macro.itemMacro.local", "macro.itemMacro.GM", "macro.actorUpdate"];
export var macroDestination = {
    "macro.execute": "mixed",
    "macro.execute.local": "local",
    "macro.execute.GM": "GM",
    "macro.itemMacro": "mixed",
    "macro.itemMacro.local": "local",
    "macro.itemMacro.GM": "GM",
    "macro.actorUpdate": "mixed"
};
export var daeSystemClass;
if (!globalThis.daeSystems)
    globalThis.daeSystems = {};
// export var showDeprecation = true;
export var showInline = false;
let debugLog = true;
function flagChangeKeys(actor, change) {
    if (!(["dnd5e", "sw5e"].includes(game.system.id)))
        return;
    const hasSaveBonus = change.key.startsWith("data.abilities.") && change.key.endsWith(".save") && !change.key.endsWith(".bonuses.save");
    if (hasSaveBonus) {
        const saveBonus = change.key.match(/data.abilities.(\w\w\w).save/);
        const abl = saveBonus[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use system.abilities.${abl}.bonuses.save instead`);
        // change.key = `data.abilities.${abl}.bonuses.save`;
        return;
    }
    const hasCheckBonus = change.key.startsWith("data.abilities.") && change.key.endsWith(".mod");
    if (hasCheckBonus) {
        const checkBonus = change.key.match(/data.abilities.(\w\w\w).mod/);
        const abl = checkBonus[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.abilities.${abl}.bonuses.check instead`);
        // change.key = `data.abilities.${abl}.bonuses.check`;
        return;
    }
    const hasSkillMod = change.key.startsWith("data.skills") && change.key.endsWith(".mod");
    if (hasSkillMod) {
        const skillMod = change.key.match(/data.skills.(\w\w\w).mod/);
        const abl = skillMod[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.check instead`);
        // change.key = `data.skills.${abl}.bonuses.check`;
        return;
    }
    const hasSkillPassive = change.key.startsWith("data.skills.") && !change.key.endsWith(".bonuses.passive") && change.key.endsWith(".passive");
    if (hasSkillPassive) {
        const skillPassive = change.key.match(/data.skills.(\w\w\w).passive/);
        const abl = skillPassive[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.passive instead`);
        // change.key = `data.dkills.${abl}.bonuses.passive`;
        return;
    }
    const hasSkillBonus = change.key.startsWith("flags.skill-customization-5e");
    if (hasSkillBonus) {
        const skillPassive = change.key.match(/lags.skill-customization-5e.(\w\w\w).skill-bonus/);
        const abl = skillPassive[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.check instead`);
        // change.key = `data.dkills.${abl}.bonuses.passive`;
        return;
    }
}
/*
 * Replace default appplyAffects to do value lookups
 */
export function applyDaeEffects({ specList = [], completedSpecs = {}, allowAllSpecs = false, wildCardsInclude = [], wildCardsExclude = [], doStatusEffects = true }) {
    if (disableEffects)
        return;
    const overrides = {};
    debug("prepare data: before passes", this.name, this._source);
    const specialStatuses = new Map();
    if (foundry.utils.isNewerVersion(game.version, "11.293")) {
        this.statuses = this.statuses ?? new Set();
        // Identify which special statuses had been active
        //@ts-expect-error
        for (const statusId of Object.values(CONFIG.specialStatusEffects)) {
            specialStatuses.set(statusId, this.statuses.has(statusId));
        }
        this.statuses.clear();
    }
    for (let effect of this.allApplicableEffects())
        if (effect.determineSuppression)
            effect.determineSuppression();
    const effects = this.appliedEffects.filter(ef => !ef.disabled && !ef.isSuppressed);
    if (!effects || effects.size === 0)
        return this.overrides || {};
    const changes = effects.reduce((changes, effect) => {
        if (doStatusEffects) {
            for (const statusId of effect.statuses) {
                this.statuses.add(statusId);
            }
        }
        if (!effects || effects.size === 0)
            return this.overrides || {};
        // TODO find a solution for flags.? perhaps just a generic speclist
        return changes.concat(expandEffectChanges(foundry.utils.duplicate(effect.changes))
            .filter(c => {
            if (daeSystemClass.fieldMappings[c.key]) {
                const mappedField = daeSystemClass.fieldMappings[c.key];
                console.warn(`Actor ${this.name} ${c.key} dprecated use ${daeSystemClass.fieldMappings[c.key]} instead`, this);
                if (mappedField.startsWith("system.traits.da") && mappedField.endsWith(".value")) {
                    const damageType = c.key.split(".").slice(-1)[0];
                    c.key = mappedField;
                    c.value = damageType;
                    if (c.mode === CONST.ACTIVE_EFFECT_MODES.CUSTOM)
                        c.mode = CONST.ACTIVE_EFFECT_MODES.ADD;
                }
                else {
                    if (c.key.includes("DR") && c.value?.length > 0)
                        c.value = `-(${c.value})`;
                    if (debugEnabled > 0)
                        warn("Doing field mapping mapping ", c.key, daeSystemClass.fieldMappings[c.key]);
                    c.key = daeSystemClass.fieldMappings[c.key];
                }
            }
            return !completedSpecs[c.key]
                && (allowAllSpecs || specList[c.key] !== undefined || wildCardsInclude.some(re => c.key.match(re) !== null))
                && (!wildCardsExclude.some(re => c.key.match(re) !== null))
                && !c.key.startsWith("ATL.");
        })
            .map(c => {
            c = foundry.utils.duplicate(c);
            flagChangeKeys(this, c);
            if (c.key.startsWith("flags.midi-qol.optional")) { // patch for optional effects
                const parts = c.key.split(".");
                if (["save", "check", "skill", "damage", "attack"].includes(parts[parts.length - 1])) {
                    console.error(`dae/midi-qol | deprecation error ${c.key} should be ${c.key}.all on actor ${this.name}`);
                    c.key = `${c.key}.all`;
                }
            }
            if (c.key === "flags.midi-qol.OverTime")
                c.key = `flags.midi-qol.OverTime.${foundry.utils.randomID()}`;
            c.effect = effect;
            if (["system.traits.ci.value", "system.traits.ci.all", "system.traits.ci.custom"].includes(c.key))
                c.priority = 0;
            else
                c.priority = c.priority ?? (c.mode * 10);
            return c;
        }));
    }, []);
    // Organize non-disabled effects by their application priority
    changes.sort((a, b) => a.priority - b.priority);
    if (changes.length > 0 && debugEnabled > 0)
        warn("Applying effect ", this.name, changes);
    // Apply all changes
    for (let c of changes) {
        if (!c.key)
            continue;
        //TODO remove @data sometime
        if (typeof c.value === "string" && c.value.includes("@data.")) {
            const parentInfo = c.effect.parent ? ` on ${c.effect.parent.name} (${c.effect.parent.id})` : '';
            console.warn(`dae | @data.key is deprecated, use @key instead (${c.effect.name} (${c.effect.id})${parentInfo} has value ${c.value})`);
            c.value = c.value.replace(/@data./g, "@");
        }
        if (c.value.includes("dae.eval(") || c.value.includes("dae.roll(")) {
            c.value = daeSystemClass.safeEvalExpression(c.value, this.getRollData());
        }
        const stackCount = c.effect.flags?.dae?.stacks ?? c.effect.flags?.dae?.statuscounter?.counter.value ?? 1;
        const sampleValue = foundry.utils.getProperty(this, c.key) ?? ValidSpec.specs[this.type].allSpecsObj[c.key]?.fieldType ?? "";
        if (typeof sampleValue !== "number" || c.mode === CONST.ACTIVE_EFFECT_MODES.CUSTOM)
            c.value = c.value.replace("@stackCount", stackCount);
        if (c.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
            if (typeof sampleValue === "number" && typeof c.value === "string") {
                debug("appplyDaeEffects: Doing eval of ", c, c.value);
                const rollData = this.getRollData();
                rollData.stackCount = stackCount;
                c.value = c.value.replace("@item.level", "@itemLevel");
                //@ts-expect-error replaceFormulaData
                let value = Roll.replaceFormulaData(c.value, rollData, { missing: 0, warn: false });
                try { // Roll parser no longer accepts some expressions it used to so we will try and avoid using it
                    if (needStringNumericValues) {
                        c.value = `${Roll.safeEval(value)}`;
                    }
                    else {
                        c.value = Roll.safeEval(value);
                    }
                }
                catch (err) { // safeEval failed try a roll
                    try {
                        let roll = new Roll(value);
                        //@ts-expect-error
                        if (game.release.generation < 12) {
                            if (!roll.isDeterministic) {
                                console.warn("%c dae | you are using dice expressions in a numeric field. This will be disabled in foundry version 12", "color: red; font-size:14px;");
                                console.warn(`%c Actor ${this.name} ${this.uuid} Change is ${c.key}: ${c.value}`, "color: red; font-size:14px;");
                            }
                            c.value = `${roll.evaluate({ async: false }).total}`;
                        }
                        else {
                            if (!roll.isDeterministic) {
                                console.error(`%c dae | you are using dice expressions in a numeric field which is not supported in ${game.version} dice terms ignored`, "color: red;");
                                console.error(`Actor ${this.name} ${this.uuid} Change is ${c.key}: ${c.value}`);
                            }
                            //@ts-expect-error evaluateSync
                            c.value = `${new Roll(value).evaluateSync({ strict: false }).total}`;
                        }
                    }
                    catch (err) {
                        console.warn("change value calculation failed for", err, this, c);
                    }
                }
            }
        }
        const currentValue = foundry.utils.getProperty(this, c.key);
        if (typeof (currentValue ?? ValidSpec.specs[this.type].allSpecsObj[c.key]?.fieldType) === "number" && typeof currentValue !== "number") {
            const guess = Number.fromString ? Number.fromString(currentValue || "0") : Number(currentValue) || "0";
            if (!Number.isNaN(guess))
                foundry.utils.setProperty(this, c.key, guess);
            else
                foundry.utils.setProperty(this, c.key, 0);
        }
        const result = c.effect.apply(this, c);
        Object.assign(overrides, result);
    }
    if (foundry.utils.isNewerVersion(game.version, "11.293")) {
        // Apply special statuses that changed to active tokens
        let tokens;
        for (const [statusId, wasActive] of specialStatuses) {
            const isActive = this.statuses.has(statusId);
            if (isActive === wasActive)
                continue;
            tokens = tokens ?? this.getActiveTokens();
            for (const token of tokens)
                token._onApplyStatusEffect(statusId, isActive);
        }
    }
    // Expand the set of final overrides + merge sincey
    this.overrides = foundry.utils.mergeObject(this.overrides || {}, foundry.utils.expandObject(overrides) || {}, { inplace: true, overwrite: true });
}
function expandEffectChanges(changes) {
    let returnChanges = changes.reduce((list, change) => {
        if (!daeSystemClass.bonusSelectors[change.key]) {
            list.push(change);
        }
        else {
            if (daeSystemClass.bonusSelectors[change.key].replaceList) {
                daeSystemClass.bonusSelectors[change.key].replaceList.forEach(replace => {
                    const c = foundry.utils.duplicate(change);
                    c.key = replace;
                    list.push(c);
                });
            }
            else {
                const attacks = daeSystemClass.bonusSelectors[change.key].attacks;
                const selector = daeSystemClass.bonusSelectors[change.key].selector;
                attacks.forEach(at => {
                    const c = foundry.utils.duplicate(change);
                    c.key = `system.bonuses.${at}.${selector}`;
                    list.push(c);
                });
            }
        }
        return list;
    }, []);
    return returnChanges;
}
export async function addCreateItemChange(change, actor, effect) {
    await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "createActorItem", { uuid: actor.uuid, itemDetails: change.value, effectUuid: effect.uuid, callItemMacro: change.key === "macro.createItemRunMacro" });
}
export async function removeCreateItemChange(itemId, actor, effect) {
    let [uuid, option] = itemId.split(",").map(s => s.trim());
    if (option === "permanent")
        return; // don't delete permanent items
    if ((effect.flags?.dae?.itemsToDelete ?? []).length === 0)
        return;
    await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "removeActorItem", { uuid: actor.uuid, itemUuid: itemId, itemUuids: effect.flags?.dae?.itemsToDelete });
}
export async function addTokenMagicChange(actor, change, tokens) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    for (let token of tokens) {
        if (token.object)
            token = token.object; // in case we have a token document
        const tokenUuid = token.document.uuid;
        // Put this back if TMFX does awaited calls
        // await actionQueue.add(tokenMagic.addFilters, token, change.value); - see if gm execute solve problem
        await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "applyTokenMagic", { tokenUuid, effectId: change.value });
    }
}
export async function removeTokenMagicChange(actor, change, tokens) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    for (let token of tokens) {
        if (token.object)
            token = token.object; // in case we have a token document
        // put this back if TMFX does awaited calls
        // await actionQueue.add(tokenMagic.deleteFilters, token, change.value);
        const tokenUuid = token.document.uuid;
        await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "removeTokenMagic", { tokenUuid, effectId: change.value });
    }
}
async function myRemoveCEEffect(effectName, uuid, origin, isToken, metaData) {
    //@ts-expect-error game.dfreds
    const ceInterface = game?.dfreds?.effectInterface;
    let interval = 1;
    if (foundry.utils.isNewerVersion("11.294", game.version))
        interval = isToken ? 250 : 1;
    await delay(interval); // let all of the stuff settle down
    return await ceInterface.removeEffect({ effectName, uuid, origin, metaData });
}
export async function removeConvenientEffectsChange(effectName, uuid, origin, isToken, metaData = {}) {
    if (isToken)
        await delay(1); // let all of the stuff settle down
    const returnValue = await actionQueue.add(myRemoveCEEffect, effectName, uuid, origin, isToken, metaData);
    return returnValue;
}
async function myAddCEEffectWith(effectData, uuid, origin, overlay, isToken) {
    //@ts-expect-error dfreds
    const ceInterface = game?.dfreds?.effectInterface;
    let interval = 1;
    if (foundry.utils.isNewerVersion("11.294", game.version))
        interval = isToken ? 250 : 0;
    if (interval)
        await delay(interval);
    return await ceInterface.addEffectWith({ effectData, uuid, origin, overlay: false });
}
export async function addConvenientEffectsChange(effectName, uuid, origin, context, isToken, CEmetaData = {}) {
    //@ts-expect-error dfreds
    let ceEffect = game.dfreds.effects.all.find(e => (e.name ?? e.label) === effectName);
    if (!ceEffect)
        return;
    let effectData = foundry.utils.mergeObject(ceEffect.toObject(), context.metaData);
    let returnValue;
    effectData.orgin = origin;
    returnValue = await actionQueue.add(myAddCEEffectWith, effectData, uuid, origin, false, isToken);
    return returnValue;
}
export async function addCLTChange(conditionId, tokens, options = {}) {
    //@ts-expect-error clt
    const cltInterface = game?.clt;
    if (cltInterface) {
        // const condition = cltInterface.conditions.find(c => conditionId === foundry.utils.getProperty(c, "flags.condition-lab-triggler.conditionId"));
        const condition = cltInterface.conditions.find(c => conditionId === c.id);
        if (condition) {
            await actionQueue.add(cltInterface.addCondition, condition.name, tokens, options);
        }
    }
}
export async function removeCLTChange(conditionId, tokens, options = { warn: false }) {
    //@ts-expect-error clt
    const cltInterface = game?.clt;
    if (cltInterface) {
        //const condition = cltInterface.conditions.find(c => conditionId === foundry.utils.getProperty(c, "flags.condition-lab-triggler.conditionId"));
        const condition = cltInterface.conditions.find(c => conditionId === c.id);
        if (condition)
            await actionQueue.add(cltInterface.removeCondition, condition.name, tokens, options);
    }
}
export async function addStatusEffectChange(actor, change, tokens, sourceEffect) {
    if (change.key !== "StatusEffect")
        return;
    let statusEffect = CONFIG.statusEffects.find(se => se.id === change.value);
    if (statusEffect) {
        if (!statusEffect._id) { // fiddle for CE effects - since it doesn't set it can presmuably be anyting;
            statusEffect._id = randomID();
        }
        //@ts-expect-error
        statusEffect = await ActiveEffect.implementation.fromStatusEffect(change.value, { parent: actor });
        statusEffect.updateSource({ origin: sourceEffect.uuid });
        //@ts-expect-error
        await ActiveEffect.implementation.create(statusEffect, { parent: actor, keepId: true });
    }
}
export async function removeStatusEffectChange(actor, change, tokens, effect) {
    // TODO this might remove too many effects
    const effectsToRemove = actor.effects.filter(ef => ef.origin === effect.uuid)?.map(ef => ef.id);
    if (effectsToRemove && effectsToRemove.length > 0)
        await actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", effectsToRemove);
}
export function prepareLastArgData(effect, actor, lastArgOptions = {}) {
    if (!effect.changes)
        return effect;
    let tokenUuid;
    if (actor.token)
        tokenUuid = actor.token.uuid;
    else {
        const selfTarget = getSelfTarget(actor);
        if (selfTarget instanceof Token)
            tokenUuid = selfTarget.document.uuid;
        else
            tokenUuid = selfTarget.uuid;
    }
    let lastArg = foundry.utils.mergeObject(lastArgOptions, {
        effectId: effect.id,
        origin: effect.origin,
        efData: effect.toObject(false),
        actorId: actor.id,
        actorUuid: actor.uuid,
        tokenId: actor.token ? actor.token.id : getSelfTarget(actor)?.id,
        tokenUuid,
    }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
    return lastArg;
}
function createActiveEffectHook(...args) {
    let [effect, context, userId] = args;
    if (userId !== game.user?.id)
        return true;
    if (context.isUndo)
        return;
    //@ts-expect-error
    if (!effect.parent || (CONFIG.ActiveEffect.legacyTransferral === true && !(effect.parent instanceof CONFIG.Actor.documentClass)))
        return true;
    let actor = effect.parent;
    if (actor instanceof CONFIG.Item.documentClass)
        actor = effect.parent.parent;
    if (!actor) {
        // not an effect on an actor so do nothing
        return;
    }
    const tokens = actor.isToken ? [actor.token?.object] : actor.getActiveTokens();
    if (!(tokens[0] instanceof Token))
        return;
    const token = tokens[0];
    if (effect.determindSuppression)
        effect.determineSuppression();
    if (effect.changes && !effect.disabled && !effect.isSuppressed) {
        let changeLoop = async () => {
            try {
                const selfAuraChange = foundry.utils.getProperty(effect, "flags.ActiveAuras.isAura") === true
                    && foundry.utils.getProperty(effect, "flags.ActiveAuras.ignoreSelf") === true
                    && effect.origin.startsWith(actor.uuid);
                // don't apply macro or macro like effects if active aura and not targeting self
                if (selfAuraChange)
                    return;
                for (let change of effect.changes) {
                    if (cltActive && ["macro.CUB", "macro.CLT"].includes(change.key) && token) {
                        await addCLTChange(change.value, [token]);
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await addConvenientEffectsChange(change.value, actor.uuid, effect.origin, context, actor.isToken, lastArg);
                    }
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await addCreateItemChange(change, actor, effect);
                    }
                    const tokenMagic = globalThis.TokenMagic;
                    if (tokenMagic && change.key === "macro.tokenMagic" && token)
                        await addTokenMagicChange(actor, change, tokens); //TODO check disabled
                }
                if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    await actionQueue.add(daeMacro, "on", actor, effect.toObject(false), { effectUuid: effect.uuid }); // TODO revisit to see if passing the effect is ok
                }
            }
            catch (err) {
                const message = "dae | createActiveEffectHook | create effect error";
                if (globalThis.MidiQOL?.TroubleShooter) {
                    globalThis.MidiQOL.TroubleShooter.recordError(err, message);
                }
                console.warn(message, err);
            }
            finally {
                return true;
            }
        };
        changeLoop();
    }
    return true;
}
async function _preCreateActiveEffectRemoveExisting(wrapped, ...args) {
    if (debugEnabled > 0)
        warn("preCreateActiveEffectRemoveExisting", args);
    try {
        let [effectData, options, user] = args;
        if (options.isUndo)
            return;
        const parent = this.parent;
        options.deleted = false;
        if (!(parent instanceof CONFIG.Actor.documentClass))
            return;
        if (!foundry.utils.getProperty(this, "flags.dae.stackable")) {
            if (effectData.origin === parent?.uuid)
                this.updateSource({ "flags.dae.stackable": "multi" });
            else
                this.updateSource({ "flags.dae.stackable": "noneName" });
        }
        const stackable = foundry.utils.getProperty(this, "flags.dae.stackable");
        if (["noneName", "none", "noneNameOnly"].includes(stackable)) {
            if (!parent)
                return;
            const hasExisting = parent.effects.filter(ef => {
                //@ts-expect-error .origin
                const efOrigin = ef.origin;
                switch (stackable) {
                    case "noneName":
                        // Effects with no origin are ignored
                        //@ts-expect-error label - label may still be used by some modules
                        return this.origin && efOrigin === this.origin && (ef.name ?? ef.label) === (this.name ?? this.label);
                    case "noneNameOnly":
                        //@ts-expect-error label - label may still be used by some modules
                        return (ef.name ?? ef.label) === (this.name ?? this.label);
                    case "none":
                        // All hand applied CE effects or applied via the interface with no specified origin have a special origin so do not count those.
                        // If the effect has the CE special origin treat it as if there was no origin.
                        if (efOrigin === CECustomEffectsItemUuid)
                            return false;
                        return this.origin && efOrigin !== CECustomEffectsItemUuid && efOrigin === this.origin;
                }
                return false;
            });
            if (hasExisting.length === 0)
                return;
            if (debugEnabled > 0)
                warn("deleting existing effects ", parent.name, parent, hasExisting);
            this.parent.deleteEmbeddedDocuments("ActiveEffect", hasExisting.map(ef => ef.id), { "expiry-reason": "effect-stacking" });
        }
    }
    catch (err) {
        error("removeExistingEffects ", err);
    }
    finally {
        return wrapped(...args);
    }
}
async function _preCreateActiveEffect(wrapped, data, options, user) {
    if (debugEnabled > 0)
        warn("_preCreateActiveEffect", this, data, options, user);
    // Make changes to the effect data as needed
    let result = true;
    try {
        if (options.isUndo)
            return result = true;
        const parent = this.parent;
        if (!(parent instanceof CONFIG.Actor.documentClass) /*|| actor.isToken*/)
            return result = true;
        // Check if we are trying to create an existing effect - not quite sure how that might happen
        if (parent.effects?.find(ef => ef.id === data._id && false)) {
            if (debugEnabled > 0)
                warn("Blocking creation of duplcate effect", this, parent.effects?.find(ef => ef.id === data._idid));
            return result = false; // "finally" will return the value
        }
        if (!this.flags?.dae?.specialDuration)
            this.updateSource({ "flags.dae.specialDuration": [] });
        if (parent instanceof Actor) {
            let updates = {};
            //@ts-expect-error
            if (CONFIG.ActiveEffect.legacyTransferral) {
                foundry.utils.setProperty(updates, "flags.dae.transfer", data.transfer === true ? true : false);
            }
            // Update the duration on the effect if needed
            if (this.flags?.dae?.durationExpression && parent instanceof Actor) {
                let sourceActor = parent;
                if (!data.transfer) { // for non-transfer effects we might be poiting to a different actor
                    //@ts-expect-error
                    const thing = fromUuidSync(this.origin);
                    if (thing?.actor)
                        sourceActor = thing.actor;
                }
                let theDurationRoll = new Roll(`${this.flags.dae.durationExpression}`, sourceActor?.getRollData());
                let theDuration = await theDurationRoll.evaluate();
                const inCombat = game.combat?.turns?.some(turnData => turnData.actor?.uuid === parent.uuid);
                if (inCombat) {
                    updates["duration.rounds"] = Math.floor(theDuration.total / CONFIG.time.roundTime + 0.5);
                    updates["duration.seconds"] = null;
                }
                else
                    updates["duration.seconds"] = theDuration.total;
            }
            let changesChanged = false;
            let newChanges = [];
            for (let change of this.changes) {
                if (typeof change.value === "string") {
                    const token = getSelfTarget(parent);
                    //@ts-expect-error .document
                    const context = { "@actorUuid": parent?.uuid, "@tokenUuid": token?.uuid ?? token?.document?.uuid, "@targetUuid": token?.uuid ?? token?.document?.uuid };
                    for (let key of Object.keys(context)) {
                        // Can't do a Roll.replaceFormula because of non-matches being replaced.
                        let newValue;
                        if (change.value.includes(`@${key}`))
                            continue;
                        newValue = change.value.replaceAll(key, context[key]);
                        if (newValue !== change.value) {
                            changesChanged = true;
                            change.value = newValue;
                        }
                    }
                }
                const inline = typeof change.value === "string" && change.value.includes("[[");
                if (change.key === "StatusEffect") {
                    const statusEffect = CONFIG.statusEffects.find(se => se.id === change.value);
                    if (statusEffect) {
                        newChanges = newChanges.concat(statusEffect.changes ?? []);
                        //@ts-expect-error
                        if (game.release.generation < 12)
                            updates["icon"] = statusEffect.icon;
                        else
                            updates["img"] = statusEffect.img ?? statusEffect.icon;
                        updates["name"] = i18n(statusEffect.name ?? statusEffect.label);
                        if (statusEffect._id) { // if there is an _id make sure we use it - e.g. for dnd5e statuses
                            updates._id = statusEffect._id;
                            options.keepId = true;
                        }
                        changesChanged = true;
                        if (statusEffect.flags) {
                            updates.flags = foundry.utils.mergeObject(updates.flags ?? {}, statusEffect.flags, { insertKeys: true, insertValues: true, overwrite: true });
                        }
                        if (foundry.utils.isNewerVersion(game.version, "11.0")) {
                            updates["statuses"] = new Set(statusEffect.statuses ?? []);
                            updates.statuses.add(statusEffect.id);
                            updates.statuses = Array.from(updates.statuses);
                        }
                        else
                            updates["flags.core.statusId"] = statusEffect.id;
                    }
                }
                else if (["StatusEffectLabel", "StatusEffectName"].includes(change.key)) {
                    updates["name"] = change.value;
                }
                else if (inline) {
                    const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                    const newChange = foundry.utils.duplicate(change);
                    changesChanged = true;
                    for (let match of change.value.matchAll(rgx)) {
                        if (!match[1]) {
                            const newValue = await evalInline(match[2], parent, this);
                            newChange.value = newChange.value.replace(match[0], `${newValue}`);
                        }
                    }
                    newChanges.push(newChange);
                }
                else if (change.key.startsWith("macro.itemMacro")) {
                    //@ts-expect-error
                    const item = fromUuidSync(this.origin);
                    if (item instanceof Item) {
                        let macroCommand = foundry.utils.getProperty(item, "flags.dae.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.data.command");
                        foundry.utils.setProperty(updates, `flags.dae.itemMacro`, macroCommand);
                    }
                }
                else
                    newChanges.push(change);
            }
            if (changesChanged)
                updates["changes"] = newChanges;
            this.updateSource(updates);
        }
    }
    catch (err) {
        console.warn("dae | preCreateActiveEffectHook", err);
    }
    finally {
        return wrapped(data, options, user);
    }
}
async function evalInline(expression, actor, effect) {
    try {
        warn("Doing inlinve eval", expression);
        expression = expression.replaceAll("@data.", "@");
        const roll = await (new Roll(expression, actor?.getRollData())).evaluate();
        if (showInline) {
            roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${effect.name ?? effect.label} ${expression}`, chatMessage: true });
        }
        return `${roll.total}`;
    }
    catch (err) {
        console.warn(`dae | evaluate args error: rolling ${expression} failed`, err);
        return "0";
    }
}
export function preDeleteCombatHook(...args) {
    // This could cause race conditions....
    const [combat, options, user] = args;
    if (user !== game.user?.id)
        return;
    for (let combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor)
            continue;
        const effectsToDelete = actor.effects.filter(ef => ef.flags.dae?.specialDuration?.includes("combatEnd")).map(ef => ef.id);
        actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", effectsToDelete);
        const effectsToDisable = actor.appliedEffects.filter(ef => ef.flags.dae?.specialDuration?.includes("combatEnd") && ef.transfer);
        if (effectsToDisable.length === 0)
            continue;
        const effectUpdates = [];
        for (let effect of effectsToDisable) {
            effectUpdates.push({ _id: effect.id, disabled: true });
        }
        actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "ActiveEffect", effectUpdates);
    }
}
export function preCreateCombatantHook(...args) {
    const [combatant, data, options, user] = args;
    const actor = combatant.actor;
    if (!actor)
        return;
    const effectsToDelete = actor.effects.filter(ef => ef.flags.dae?.specialDuration?.includes("joinCombat")).map(ef => ef.id);
    actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", effectsToDelete);
    const effectsToDisable = actor.appliedEffects.filter(ef => ef.flags.dae?.specialDuration?.includes("joinCombat") && ef.transfer);
    if (effectsToDisable.length > 0) {
        const effectUpdates = [];
        for (let effect of effectsToDisable) {
            effectUpdates.push({ _id: effect.id, disabled: true });
        }
        actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "ActiveEffect", effectUpdates);
    }
}
function recordDisabledSuppressedHook(...args) {
    let [effect, updates, context, userId] = args;
    foundry.utils.setProperty(context, "dae.active", { wasDisabled: effect.disabled, wasSuppressed: effect.isSuppressed, oldChanges: foundry.utils.duplicate(effect.changes) });
    return true;
}
export function updateActiveEffectHook(...args) {
    let [effect, updates, context, userId] = args;
    let result = true;
    if (context.isUndo)
        return result = true;
    if (userId !== game.user?.id)
        return result = true;
    const parent = effect.parent;
    if (!parent)
        return true;
    // if ((foundry.utils.getProperty(updates, "flags.dae.itemsToDelete") ?? []).length > 0) return true;
    let actor;
    //@ts-expect-error legacyTransferral
    if (!CONFIG.ActiveEffect.legacyTransferral && parent instanceof CONFIG.Item.documentClass) {
        if (!effect.transfer)
            return;
        // Suppressed effects are covered by the item update
        actor = effect.parent?.parent;
        if (actor instanceof CONFIG.Actor.documentClass) {
            // if disabled status changed remove dependent effects macro.execute, createItem etc
            const wasDisabled = context.dae?.active?.wasDisabled ?? false;
            const becameDisabled = effect.disabled && !(context.dae?.active.wasDisabled ?? false);
            const becameEnabled = (context.dae?.active.wasDisabled ?? false) && !(effect.disabled ?? false);
            const item = effect.parent;
            if (becameDisabled) {
                for (let change of effect.changes) {
                    removeEffectChange(actor, [], effect, item, change);
                }
            }
            else if (becameEnabled) {
                for (let change of effect.changes) {
                    addEffectChange(actor, [], effect, item, change);
                }
            }
            return true;
        }
    }
    if (parent instanceof CONFIG.Actor.documentClass)
        actor = parent;
    else if (parent instanceof CONFIG.Item.documentClass)
        actor = parent.parent;
    // if (effect.disabled === context.dae?.active?.disabled && effect.isSuppressed === context.dae?.active?.isSuppressed) return true;
    if (!actor)
        return true;
    let changeLoop = async () => {
        try {
            // const item = await fromUuid(effect.origin);
            const tokens = actor.isToken ? [actor.token?.object] : actor.getActiveTokens();
            const token = tokens[0];
            if (!(token instanceof Token))
                return;
            if (effect.determineSuppression)
                effect.determineSuppression();
            // Just deal with equipped etc
            warn("add active effect actions", actor, updates);
            const tokenMagic = globalThis.TokenMagic;
            let addedChanges = [];
            let removedChanges = [];
            let existingChanges = [];
            let oldChanges = [];
            let newChanges = [];
            if (updates.changes) {
                // const removedChanges = (context.dae?.active?.oldChanges ?? []).filter(change => !effect.changes.some(c => c.key === change.key)); 
                oldChanges = (foundry.utils.getProperty(context, "dae.active.oldChanges") ?? []).sort((a, b) => a.key < b.key ? -1 : 1);
                newChanges = effect.changes.filter(c => c.key && c.key !== "").sort((a, b) => a.key < b.key ? -1 : 1);
                removedChanges = oldChanges.filter(change => !newChanges.some(c => c.key === change.key && c.mode === change.mode && c.value === change.value));
                existingChanges = oldChanges.filter(change => newChanges.some(c => c.key === change.key && c.mode === change.mode && c.value === change.value));
                addedChanges = newChanges.filter(change => !oldChanges.some(c => c.key === change.key && c.mode === change.mode && c.value === change.value));
                if (debugEnabled > 0) {
                    warn("updateActor hook | old changes", oldChanges);
                    warn("updateActor hook | new changes", newChanges);
                    warn("updateActor hook | removed Changes ", removedChanges);
                    warn("updateActor hook | added changes ", addedChanges);
                    warn("updateActor hook | existing changes", existingChanges);
                }
            }
            else
                existingChanges = effect.changes;
            const wasDisabled = context.dae?.active?.wasDisabled ?? false;
            const wasSuppressed = context.dae?.active?.wasSuppressed ?? false;
            const becameDisabled = effect.disabled && !(context.dae?.active.wasDisabled ?? false);
            const becameSuppressed = effect.isSuppressed && !(context.dae?.active.wasSuppressed ?? false);
            // TODO Come back and make this use addEffectChange and removeEffectChange instead of the below
            if (becameSuppressed || becameDisabled || removedChanges.length > 0) {
                let changesToDisable = [];
                if (becameSuppressed || becameDisabled) {
                    // newly disabled disable everything
                    changesToDisable = existingChanges.concat(removedChanges);
                }
                else if (!wasDisabled && !wasSuppressed) {
                    // changes being removed were enabled so disable them
                    changesToDisable = removedChanges;
                }
                for (let change of changesToDisable) {
                    if (token && cltActive && ["macro.CUB", "macro.CLT"].includes(change.key)) {
                        await removeCLTChange(change.value, [token], { warn: false });
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await removeConvenientEffectsChange(change.value, actor.uuid, undefined, actor.isToken, lastArg);
                    }
                    if (token && tokenMagic && change.key === "macro.tokenMagic")
                        removeTokenMagicChange(actor, change, tokens);
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await removeCreateItemChange(change.value, actor, effect);
                    }
                    if (change.key === "StatusEffect") {
                        await removeStatusEffectChange(actor, change, tokens, effect);
                    }
                }
                if (changesToDisable.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    warn("dae add macro off", actionQueue._queue.length);
                    const effectData = effect.toObject(false);
                    if (updates.changes)
                        effectData.changes = oldChanges;
                    let options = {};
                    if (becameDisabled)
                        options = { "expiry-reason": "effect-disabled" };
                    else if (becameSuppressed)
                        options = { "expiry-reason": "effect-suppressed" };
                    else
                        options = { "expiry-reason": "change-deleted" };
                    options.effectUuid = effect.uuid;
                    await actionQueue.add(daeMacro, "off", actor, effectData, options);
                }
            }
            const becameEnabled = (context.dae?.active.wasDisabled ?? false) && !(effect.disabled ?? false);
            const becameUnsuppressed = (context.dae?.active.wasSuppressed ?? false) && !(effect.isSuppressed ?? false);
            if (becameEnabled || becameUnsuppressed || addedChanges.length > 0) {
                let changesToEnable = [];
                if (becameEnabled || becameUnsuppressed) {
                    // newly enabled enable everything
                    changesToEnable = existingChanges.concat(addedChanges);
                }
                else if (!effect.disabled && !effect.suppressed) {
                    // changes being added need to be enabled
                    changesToEnable = addedChanges;
                }
                for (let change of changesToEnable) {
                    if (token && cltActive && ["macro.CUB", "macro.CLT"].includes(change.key)) {
                        await addCLTChange(change.value, [token]);
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await addConvenientEffectsChange(change.value, actor.uuid, undefined, actor.isToken, lastArg);
                    }
                    if (token && tokenMagic && change.key === "macro.tokenMagic")
                        addTokenMagicChange(actor, change, tokens);
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await addCreateItemChange(change, actor, effect);
                    }
                    if (change.key === "StatusEffect") {
                        await addStatusEffectChange(actor, change, tokens, effect);
                    }
                }
                if (changesToEnable.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    warn("action queue add dae macro on ", actionQueue._queue.length);
                    await actionQueue.add(daeMacro, "on", actor, effect.toObject(false), { effectUuid: effect.uuid });
                }
            }
        }
        catch (err) {
            console.warn("dae | updating active effect error", err);
        }
        finally {
            return result;
        }
    };
    changeLoop();
    return result = true;
}
export function preUpdateActiveEffectEvalInlineHook(candidate, updates, options, user) {
    const parent = candidate.parent;
    if (options.isUndo)
        return true;
    if (!parent)
        return true;
    //@ts-expect-error legacyTransferral
    if (CONFIG.ActiveEffect.legacyTransferral && !(parent instanceof CONFIG.Actor.documentClass))
        return true;
    let actor;
    if (parent instanceof CONFIG.Actor.documentClass)
        actor = parent;
    else if (parent instanceof CONFIG.Item.documentClass && effectIsTransfer(candidate))
        actor = parent.parent;
    if (!actor)
        return true;
    try {
        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
        for (let change of candidate.changes ?? []) {
            let inline = typeof change.value === "string" && change.value.includes("[[");
            if (inline) {
                const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                let newChangeValue = foundry.utils.duplicate(change.value);
                for (let match of change.value.matchAll(rgx)) {
                    if (!match[1]) {
                        const newValue = evalInline(match[2], actor, candidate);
                        newChangeValue = newChangeValue.replace(match[0], `${newValue}`);
                    }
                }
                change.value = newChangeValue;
            }
            ;
        }
    }
    catch (err) {
        console.warn(`dae | update active effect Actor ${actor.name}, Effect ${candidate.name ?? candidate.label}`, updates, err);
    }
    finally {
        return true;
    }
}
export function deleteActiveEffectHook(...args) {
    let [effect, options, userId] = args;
    if (game.user?.id !== userId)
        return true;
    if (options.isUndo)
        return true;
    if (!effect.parent)
        return true;
    let actor;
    //@ts-expect-error legacyTransferral
    if (CONFIG.ActiveEffect.legacyTransferral && !(effect.parent instanceof CONFIG.Actor.documentClass))
        return true;
    if (effect.parent instanceof CONFIG.Actor.documentClass)
        actor = effect.parent;
    else if (effect.parent instanceof CONFIG.Item.documentClass && effect.transfer)
        actor = effect.parent.parent;
    if (!actor)
        return true;
    let changesLoop = async () => {
        const tokens = actor.token ? [actor.token] : actor.getActiveTokens();
        const token = tokens[0];
        const tokenMagic = globalThis.TokenMagic;
        /// if (actor.isToken) await delay(1);
        try {
            let entityToDelete;
            if (effect.changes) {
                for (let change of effect.changes) {
                    if (token && tokenMagic && change.key === "macro.tokenMagic")
                        await removeTokenMagicChange(actor, change, tokens);
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await removeCreateItemChange(change.value, actor, effect);
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await removeConvenientEffectsChange(change.value, actor.uuid, lastArg.origin, actor.isToken, lastArg);
                    }
                    if (token && cltActive && ["macro.CUB", "macro.CLT"].includes(change.key)) {
                        await removeCLTChange(change.value, [token], { warn: false });
                    }
                    if (change.key === "flags.dae.deleteUuid" && change.value) {
                        await socketlibSocket.executeAsGM("deleteUuid", { uuid: change.value });
                    }
                    if (change.key === "flags.dae.suspendActiveEffect" && change.value) {
                        await socketlibSocket.executeAsGM("suspendActiveEffect", { uuid: change.value });
                    }
                    if (change.key === "flags.dae.deleteOrigin")
                        entityToDelete = effect.origin;
                }
                if (!foundry.utils.getProperty(options, "expiry-reason"))
                    foundry.utils.setProperty(options, "expiry-reason", "effect-deleted");
                if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    options.effectUuid = effect.uuid;
                    warn("action queue dae macro add off ", actionQueue._queue.length);
                    await actionQueue.add(daeMacro, "off", actor, effect.toObject(false), options);
                }
                if (entityToDelete)
                    await socketlibSocket.executeAsGM("deleteUuid", { uuid: entityToDelete });
            }
            if (effect.origin) {
                let origin = await fromUuid(effect.origin);
                // Remove the associated animation if the origin points to the actor or if the items actor is the effects actor
                // Covers the spirit guardian case where all the aura's point back to the source item.
                if (globalThis.Sequencer && (origin === actor || origin?.parent === actor))
                    globalThis.Sequencer.EffectManager.endEffects({ origin: effect.origin });
                /* Not used anymore
                if (canvas?.scene && (origin === actor || origin?.parent === actor)) {
                //@ts-expect-error .flags
                const removeTiles = canvas.scene.tiles.filter(tile => tile.flags?.autoanimations?.origin === effect.origin).map(tile => tile.id);
                if (removeTiles.length > 0) await canvas.Scene.deleteEmbeddedDocuments("Tile", removeTiles);
              }
                */
            }
        }
        catch (err) {
            console.warn("dae | error deleting active effect ", err);
        }
    };
    changesLoop();
    return true;
}
export function getSelfTarget(actor) {
    if (actor?.token)
        return actor.token.object;
    const speaker = ChatMessage.getSpeaker({ actor });
    if (speaker.token) {
        const token = canvas.tokens?.get(speaker.token);
        if (token)
            return token;
    }
    const tokenData = actor.prototypeToken.toObject(false);
    return new CONFIG.Token.documentClass(tokenData, { actor });
}
export async function daeMacro(action, actor, effectData, lastArgOptions = {}) {
    let result;
    let effects;
    let selfTarget;
    let v11args = {};
    let macro;
    let theItem;
    // Work out what itemdata should be
    warn("Dae macro ", action, actor, effectData, lastArgOptions);
    if (!effectData.changes)
        return effectData;
    if (effectData instanceof ActiveEffect) {
        //@ts-expect-error
        if (effectData.transfer && effectData.parent instanceof Item)
            theItem = effectData.parent;
        effectData = effectData.toObject(false);
    }
    if (lastArgOptions.item)
        theItem = lastArgOptions.item;
    if (!theItem) {
        //@ts-expect-error fromUuidSync
        let source = effectData.origin ? fromUuidSync(effectData.origin) : undefined;
        if (source instanceof CONFIG.Item.documentClass)
            theItem = source;
    }
    if (!theItem && effectData.flags.dae?.itemUuid) {
        //@ts-expect-error fromUuidSync
        theItem = fromUuidSync(effectData.flags.dae.itemUuid);
    }
    if (!theItem && effectData.flags?.dae?.itemData) {
        theItem = new CONFIG.Item.documentClass(effectData.flags.dae.itemData, { parent: actor });
    }
    if (!theItem) {
        const origin = await fromUuid(effectData.origin);
        if (origin instanceof Item)
            theItem = origin;
    }
    let context = actor.getRollData();
    if (theItem) {
        context.item = theItem;
        context.itemData = theItem.toObject(false);
        if (theItem)
            foundry.utils.setProperty(effectData, "flags.dae.itemData", theItem.toObject());
    }
    let tokenUuid;
    if (actor.token) {
        tokenUuid = actor.token.uuid;
        selfTarget = actor.token.object;
    }
    else {
        selfTarget = getSelfTarget(actor);
        tokenUuid = selfTarget.uuid ?? selfTarget.document.uuid;
    }
    for (let change of effectData.changes) {
        try {
            if (!allMacroEffects.includes(change.key))
                continue;
            context.stackCount = effectData.flags?.dae?.stacks ?? effectData.flags?.dae?.statuscounter?.counter.value ?? 1;
            let functionMatch;
            if (typeof change.value === "string")
                change.value = change.value.trim();
            if (change.value.startsWith("function.")) {
                const paramRe = /function\.\w+(\.\w+)*\("[^"]*"(?:\s*,\s*"[^"]*")+?\)/;
                const paramMatch = change.value.match(paramRe);
                if (paramMatch)
                    functionMatch = paramMatch[0];
                else
                    functionMatch = change.value.split(" ")[0];
                functionMatch = functionMatch.replace("function.", "");
                if (change.key.includes("macro.execute"))
                    change.value = change.value.replace(functionMatch, "FunctionMatch");
            }
            const theChange = await evalArgs({ item: theItem, effectData, context, actor, change, doRolls: true });
            let args = [];
            let v11args = {};
            if (typeof theChange.value === "string") {
                tokenizer.tokenize(theChange.value, (token) => args.push(token));
                if (theItem)
                    args = args.map(arg => {
                        if ("@itemData" === arg) {
                            return theItem.toObject(false);
                        }
                        else if ("@item" === arg) {
                            return theItem;
                        }
                        if (typeof arg === "string") {
                            const splitArg = arg.split("=");
                            if (splitArg.length === 2) {
                                if (splitArg[1] === "@itemData") {
                                    const itemData = theItem?.toObject(false);
                                    v11args[splitArg[0]] = itemData;
                                    return itemData;
                                }
                                else if (splitArg[1] === "@item") {
                                    v11args[splitArg[0]] = theItem;
                                    return theItem;
                                }
                                else
                                    v11args[splitArg[0]] = splitArg[1];
                            }
                        }
                        return arg;
                    });
            }
            else
                args = change.value;
            if (theChange.key.includes("macro.execute") || theChange.key.includes("macro.itemMacro")) {
                if (functionMatch) {
                    macro = new CONFIG.Macro.documentClass({
                        name: "DAE-Item-Macro",
                        type: "script",
                        img: null,
                        //@ts-expect-error ownership v12 DOCUMENT_PERMISSION_LEVELS -> DOCUMENT_OWNERSHIP_LEVELS
                        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_PERMISSION_LEVELS.OWNER },
                        author: game.user?.id,
                        command: `return await ${functionMatch}.bind(this)({ speaker, actor, token, character, item, args, scope })`,
                    }, { displaySheet: false, temporary: true });
                }
                else
                    macro = await getMacro({ change, name: args[0] }, theItem, effectData);
                if (!macro) {
                    //TODO localize this
                    if (action !== "off") {
                        ui.notifications.warn(`macro.execute/macro.itemMacro | No macro ${args[0]} found`);
                        warn(`macro.execute/macro.itemMacro | No macro ${args[0]} found`);
                        continue;
                    }
                }
                //@ts-expect-error - doing this refetch to try and make sure the actor has not been deleted
                if (!fromUuidSync(actor.uuid)) {
                    error("actor vanished", actor.name, actor.uuid);
                    return;
                }
                let lastArg = foundry.utils.mergeObject(lastArgOptions, {
                    effectId: effectData._id,
                    origin: effectData.origin,
                    efData: effectData,
                    actorId: actor.id,
                    actorUuid: actor.uuid,
                    tokenId: selfTarget.id,
                    effectUuid: lastArgOptions.effectUuid,
                    tokenUuid,
                }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
                if (theChange.key.includes("macro.execute"))
                    args = args.slice(1);
                let macroArgs = [action];
                macroArgs = macroArgs.concat(args).concat(lastArg);
                //@ts-expect-error
                const effect = fromUuidSync(lastArgOptions.effectUuid);
                const scope = { actor, token: selfTarget, lastArgValue: lastArg, item: theItem, macroItem: theItem, effect };
                scope.args = macroArgs.filter(arg => {
                    if (typeof arg === "string") {
                        const parts = arg.split("=");
                        if (parts.length === 2) {
                            scope[parts[0]] = parts[1];
                            return false;
                        }
                    }
                    return true;
                });
                return await macro.execute(scope);
            }
            else if (theChange.key === "macro.actorUpdate") {
                let lastArg = foundry.utils.mergeObject(lastArgOptions, {
                    effectId: effectData._id,
                    origin: effectData.origin,
                    efData: effectData,
                    actorId: actor.id,
                    actorUuid: actor.uuid,
                    tokenId: selfTarget.id,
                    tokenUuid,
                }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
                //@ts-expect-error try and make sure the actor has not vanished
                if (!fromUuidSync(actor.uuid)) {
                    error("actor vanished", actor.name, actor.uuid);
                }
                await macroActorUpdate(action, ...args, lastArg);
                // result = await macroActorUpdate(action, ...args, lastArg);
            }
        }
        catch (err) {
            const message = `daeMacro | "${action}" macro "${macro?.name}" for actor ${actor?.name} in ${theItem ? "item " + theItem.name : ""} ${actor?.uuid} ${theItem?.uuid}`;
            console.warn(message, err);
            if (globalThis.MidiQOL?.TroubleShooter)
                globalThis.MidiQOL.TroubleShooter.recordError(err, message);
        }
    }
    ;
    return effectData;
}
export async function evalArgs({ effectData, item, context, actor, change, spellLevel = 0, damageTotal = 0, doRolls = false, critical = false, fumble = false, whisper = false, itemCardId = null }) {
    const itemId = item?.id ?? foundry.utils.getProperty(effectData.flags, "dae.itemId");
    const itemUuid = item?.uuid ?? foundry.utils.getProperty(effectData.flags, "dae.itemUuid");
    if (!item && itemUuid)
        item = await fromUuid(itemUuid);
    if (typeof change.value !== 'string')
        return change; // nothing to do
    const returnChange = foundry.utils.duplicate(change);
    let contextToUse = foundry.utils.mergeObject({
        scene: canvas.scene?.id,
        token: ChatMessage.getSpeaker({ actor }).token,
        target: "@target",
        targetUuid: "@targetUuid",
        targetActorUuid: "@targetActorUuid",
        spellLevel,
        itemLevel: spellLevel,
        damage: damageTotal,
        itemCardId: itemCardId,
        unique: foundry.utils.randomID(),
        actor: actor.id,
        actorUuid: actor.uuid,
        critical,
        fumble,
        whisper,
        change: JSON.stringify(change.toJSON),
        itemId: item?.id,
        itemUuid: item?.uuid,
    }, context, { overwrite: true });
    //contextToUse["item"] = "@item";
    if (item) {
        foundry.utils.setProperty(effectData, "flags.dae.itemUuid", item.uuid);
        foundry.utils.setProperty(effectData, "flags.dae.itemData", item.toObject(false));
        contextToUse["itemData"] = "@itemData";
        contextToUse["item"] = item.getRollData()?.item;
    }
    else {
        contextToUse["itemData"] = "@itemData";
        contextToUse["item"] = "@item";
    }
    returnChange.value = returnChange.value.replace("@item.level", "@itemLevel");
    returnChange.value = returnChange.value.replace(/@data./g, "@");
    const returnChangeValue = Roll.replaceFormulaData(returnChange.value, contextToUse, { missing: "0", warn: false });
    if (typeof returnChange.value === "object") {
        console.error("object returned from replaceFormula Data", returnChange.value);
    }
    else {
        returnChange.value = returnChangeValue;
    }
    returnChange.value = returnChange.value.replaceAll("##", "@");
    if (typeof returnChange.value === "string" && !returnChange.value.includes("[[")) {
        switch (change.key) {
            case "macro.itemMacro":
            case "macro.itemMacro.local":
            case "macro.itemMacro.GM":
            case "macro.execute":
            case "macro.execute.local":
            case "macro.execute.GM":
            case "macro.actorUpdate":
                break;
            case "macro.CE":
            case "macro.CUB":
            case "macro.CLT":
            case "macro.tokenMagic":
            case "macro.createItem":
            case "macro.createItemRunMacro":
            case "macro.summonToken":
                break;
            default:
                const currentValue = foundry.utils.getProperty(actor, change.key);
                if (doRolls && typeof (currentValue ?? ValidSpec.specs[actor.type].allSpecsObj[change.key]?.fieldType) === "number") {
                    const roll = new Roll(returnChange.value, contextToUse);
                    if (!roll.isDeterministic) {
                        //@ts-expect-error v12 has evaluateSync
                        if (roll.evaluateSync) {
                            error("evalargs: expression is not deterministic dice terms ignored", actor.name, actor.uuid, returnChange.value);
                            //@ts-expect-error v12 has evaluateSync
                            returnChange.value = roll.evaluateSync({ strict: false }).total;
                        }
                        else {
                            console.warn("%c evalargs: expression is not deterministic and dice terms will be ignored in foundry version 12", "color: red", actor.name, actor.uuid, returnChange.value);
                        }
                        returnChange.value = roll.evaluate({ async: false }).total;
                    }
                }
                ;
                break;
        }
        ;
        debug("evalargs: change is ", returnChange);
    }
    return returnChange;
}
export async function getMacro({ change, name }, item, effectData) {
    if (change.key.includes("macro.execute")) {
        let macro = game.macros?.getName(name);
        if (macro)
            return macro;
        let itemOrMacro;
        itemOrMacro = await fromUuid(name);
        if (itemOrMacro) {
            if (itemOrMacro instanceof Item) {
                const macroData = foundry.utils.getProperty(item, "flags.dae.macro") ?? foundry.utils.getProperty(item, "flags.itemacro.macro");
                if (macroData && !macroData.command && macroData.data?.command) {
                    macroData.command = macroData.data.command;
                    delete macroData.data.command;
                }
                ;
                macroData.flags = foundry.utils.mergeObject(macroData.flags ?? {}, { "dnd5e.itemMacro": true });
                //@ts-expect-error displaySheet
                return new CONFIG.Macro.documentClass(macroData, { displaySheet: false, temporary: true });
            }
            else if (itemOrMacro instanceof Macro) {
                return itemOrMacro;
            }
            // Other uuids are not valid
            return undefined;
        }
    }
    else if (change.key.startsWith("macro.itemMacro")) {
        let macroCommand = foundry.utils.getProperty(item, "flags.dae.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.data.command");
        const itemData = foundry.utils.getProperty(effectData, "flags.dae.itemData");
        if (!macroCommand && itemData)
            macroCommand = foundry.utils.getProperty(itemData, "flags.dae.macro.command");
        if (!macroCommand && itemData)
            macroCommand = foundry.utils.getProperty(itemData, "flags.itemacro.macro.command");
        if (!macroCommand && itemData)
            macroCommand = foundry.utils.getProperty(itemData, "flags.itemacro.macro.data.command");
        if (!macroCommand && !item) { // we never got an item do a last ditch attempt
            warn("eval args: fetching item from effectData/origin ", effectData?.origin);
            //@ts-expect-error fromUuidSync
            item = fromUuidSync(effectData?.origin); // Try and get it from the effectData
            macroCommand = foundry.utils.getProperty(item, "flags.dae.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(item, "flags.itemacro.macro.data.command");
        }
        if (!macroCommand) {
            const itemOrMacro = await fromUuid(name);
            if (itemOrMacro instanceof Macro)
                macroCommand = foundry.utils.getProperty(itemOrMacro, "command");
            if (itemOrMacro instanceof Item) {
                const macro = foundry.utils.getProperty(itemOrMacro, "flags.dae.macro") ?? foundry.utils.getProperty(itemOrMacro, "flags.itemacro.macro");
                macroCommand = foundry.utils.getProperty(macro, "command");
            }
        }
        if (!macroCommand) {
            macroCommand = effectData.flags?.dae?.itemMacro;
        }
        if (!macroCommand) {
            macroCommand = `if (!args || args[0] === "on") {ui.notifications.warn("macro.itemMacro | No macro found for item ${item?.name}");}`;
            warn(`No macro found for item ${item?.name}`);
        }
        //@ ts-expect-error displaySheet
        return new CONFIG.Macro.documentClass({
            name: "DAE-Item-Macro",
            type: "script",
            img: null,
            command: macroCommand,
            author: game.user?.id,
            //@ts-expect-error ownership v12 DOCUMENT_PERMISSION_LEVELS -> DOCUMENT_OWNERSHIP_LEVELS
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_PERMISSION_LEVELS.OWNER },
            // TODO see if this should change.
            flags: { "dnd5e.itemMacro": true }
        }, { displaySheet: false, temporary: true });
    }
    else if (change.key === "actorUpdate") {
        console.error("Should not be trying to lookup the macro for actorUpdate");
    }
    return undefined;
}
/*
 * appply non-transfer effects to target tokens - provided for backwards compat
 */
export async function doEffects(item, activate, targets = undefined, options = {
    whisper: false, spellLevel: 0, damageTotal: null, itemCardId: null, critical: false,
    fumble: false, effectsToApply: [], removeMatchLabel: false, toggleEffect: false, origin: item.uuid,
    selfEffects: "none"
}) {
    return await applyNonTransferEffects(item, activate, targets, options);
}
// Apply non-transfer effects to targets.
// macro arguments are evaluated in the context of the actor applying to the targets
// @target is left unevaluated.
// request is passed to a GM client if the token is not owned
export async function applyNonTransferEffects(item, activate, targets, options = { whisper: false, spellLevel: 0, damageTotal: null, itemCardId: null, critical: false, fumble: false, tokenId: undefined, effectsToApply: [], removeMatchLabel: false, toggleEffect: false, selfEffects: "none" }) {
    if (!targets)
        return;
    let macroLocation = "mixed";
    let appliedEffects = [];
    switch (options.selfEffects) {
        case "selfEffectsAlways":
            appliedEffects = item.effects.filter(ae => ae.transfer !== true && ae.flags?.dae?.selfTargetAlways).map(ae => {
                const data = ae.toObject(false);
                foundry.utils.setProperty(data, "flags.core.sourceId", ae.uuid);
                return data;
            });
            break;
        case "selfEffectsAll":
            appliedEffects = item.effects.filter(ae => ae.transfer !== true && (ae.flags?.dae?.selfTargetAlways || ae.flags?.dae?.selfTarget)).map(ae => {
                const data = ae.toObject(false);
                foundry.utils.setProperty(data, "flags.core.sourceId", ae.uuid);
                return data;
            });
            break;
        case "none":
        default:
            appliedEffects = item.effects.filter(ae => ae.transfer !== true && !ae.flags?.dae?.selfTargetAlways && !ae.flags?.dae?.selfTarget).map(ae => {
                const data = ae.toObject(false);
                foundry.utils.setProperty(data, "flags.core.sourceId", ae.uuid);
                return data;
            });
    }
    if (!options.applyAll)
        appliedEffects = appliedEffects.filter(aeData => foundry.utils.getProperty(aeData, "flags.dae.dontApply") !== true);
    else
        appliedEffects.forEach(aeData => foundry.utils.setProperty(aeData.flags, "dae.dontApply", false));
    if (options.effectsToApply?.length > 0)
        appliedEffects = appliedEffects.filter(aeData => options.effectsToApply.includes(aeData._id));
    if (appliedEffects.length === 0)
        return;
    const rollData = item.getRollData(); //TODO if not caster eval move to evalArgs call
    for (let [aeIndex, activeEffectData] of appliedEffects.entries()) {
        for (let [changeIndex, change] of activeEffectData.changes.entries()) {
            const doRolls = allMacroEffects.includes(change.key);
            if (doRolls) {
                if (macroDestination[change.key] === "local" && macroLocation !== "GM") {
                    macroLocation = "local";
                }
                else if (macroDestination[change.key] === "GM")
                    macroLocation = "GM";
            }
            // eval args before calling GMAction so macro arguments are evaled in the casting context.
            // Any @fields for macros are looked up in actor context and left unchanged otherwise
            rollData.stackCount = activeEffectData.flags?.dae?.stacks ?? activeEffectData.flags?.dae?.statuscounter?.counter.value ?? 1;
            const evalArgsOptions = foundry.utils.mergeObject(options, {
                effectData: activeEffectData,
                context: rollData,
                change,
                doRolls
            });
            evalArgsOptions.item = item;
            if (item.actor)
                evalArgsOptions.actor = item.actor;
            let newChange = await evalArgs(evalArgsOptions);
            activeEffectData.changes[changeIndex] = newChange;
        }
        ;
        activeEffectData.origin = options.origin ?? item.uuid;
        activeEffectData.duration.startTime = game.time.worldTime;
        daeSystemClass.addDAEMetaData(activeEffectData, item, options);
        appliedEffects[aeIndex] = activeEffectData;
    }
    // Split up targets according to whether they are owned on not. Owned targets have effects applied locally, only unowned are passed ot the GM
    let targetList = Array.from(targets);
    targetList = targetList.map(t => 
    //@ts-expect-error
    (typeof t === "string") ? fromUuidSync(t)?.actor : t);
    targetList = targetList.map(t => (t instanceof Token) || (t instanceof TokenDocument) ? t.actor : t);
    targetList = targetList.filter(t => t instanceof Actor);
    let localTargets = targetList.filter(t => macroLocation === "local" || (t.isOwner && macroLocation === "mixed")).map(t => t.uuid);
    let gmTargets = targetList.filter(t => (!t.isOwner && macroLocation === "mixed") || macroLocation === "GM").map(t => t.uuid);
    debug("apply non-transfer effects: About to call gmaction ", activate, appliedEffects, targets, localTargets, gmTargets);
    if (gmTargets.length > 0) {
        await socketlibSocket.executeAsGM("applyActiveEffects", { userId: game.user?.id, activate, activeEffects: appliedEffects, targetList: gmTargets, itemDuration: item.system.duration, itemCardId: options.itemCardId, removeMatchLabel: options.removeMatchLabel, toggleEffect: options.toggleEffect, metaData: options.metaData });
    }
    if (localTargets.length > 0) {
        const result = await applyActiveEffects({ activate, targetList: localTargets, activeEffects: appliedEffects, itemDuration: item.system.duration, itemCardId: options.itemCardId, removeMatchLabel: options.removeMatchLabel, toggleEffect: options.toggleEffect, metaData: options.metaData, origin: options.origin });
    }
}
function preUpdateItemHook(candidate, updates, options, user) {
    return true;
}
export function addEffectChange(actor, tokens, effectToApply, item, change) {
    if (debugEnabled > 0)
        warn("addEffectChange ", actor, change, tokens, effectToApply);
    const token = tokens[0];
    switch (change.key) {
        case "macro.CE":
            const lastArg = prepareLastArgData(effectToApply, actor);
            addConvenientEffectsChange(change.value, actor.uuid, effectToApply.origin, {}, actor.isToken, lastArg);
            break;
        case "macro.CUB":
        case "macro.CLT":
            addCLTChange(change.value, [token]);
            break;
        case "macro.tokenMagic":
            addTokenMagicChange(actor, change, tokens);
            break;
        case "macro.createItem":
        case "macro.createItemRunMacro":
            //@ts-expect-error
            if (!CONFIG.ActiveEffect.legacyTransferral) {
                addCreateItemChange(change, actor, effectToApply);
            }
            else {
                for (let effect of actor.allApplicableEffects()) {
                    if (effect.origin === item.uuid && effectIsTransfer(effect)) {
                        addCreateItemChange(change, actor, effect);
                    }
                }
            }
            break;
        case "StatusEffect":
            //@ts-expect-error
            if (CONFIG.ActiveEffect.legacyTransferral === false)
                addStatusEffectChange(actor, change, token, effectToApply);
            break;
        default:
            if (change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate")) {
                if (debugEnabled > 0)
                    warn("action queue add dae macro on ", actionQueue._queue.length);
                actionQueue.add(daeMacro, "on", actor, effectToApply.toObject(false), { item, effectUuid: effectToApply.uuid });
                break;
            }
    }
}
export function removeEffectChange(actor, tokens, effectToApply, item, change) {
    let token = tokens[0];
    if (!token)
        tokens = [getToken(actor)];
    switch (change.key) {
        case "macro.CE":
            const lastArg = prepareLastArgData(effectToApply, actor);
            removeConvenientEffectsChange(change.value, actor.uuid, effectToApply.origin, actor.isToken, lastArg);
            break;
        case "macro.CUB":
        case "macro.CLT":
            removeCLTChange(change.value, tokens);
            break;
        case "macro.tokenMagic":
            removeTokenMagicChange(actor, change, tokens);
            break;
        case "macro.createItem":
        case "macro.createItemRunMacro":
            //@ts-expect-error
            if (CONFIG.ActiveEffect.legacyTransferral === false) {
                // for non legacy transferral the only effect is the one on the actor
                removeCreateItemChange(change.value, actor, effectToApply);
            }
            else {
                for (let effect of actor.allApplicableEffects()) {
                    if ((effect.origin === item.uuid || effect.parent.uuid === item.origin) && effectIsTransfer(effect)) {
                        removeCreateItemChange(change.value, actor, effect);
                    }
                }
            }
            break;
        case "StatusEffect":
            //@ ts-expect-error
            // if (CONFIG.ActiveEffect.legacyTransferral === false)
            removeStatusEffectChange(actor, change, tokens, effectToApply);
            break;
        default:
            if (change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate")) {
                if (debugEnabled > 0)
                    warn("dae add macro off", actionQueue._queue.length);
                actionQueue.add(daeMacro, "off", actor, effectToApply.toObject(false), { item, origin: item.uuid, effectUuid: effectToApply.uuid });
            }
            break;
    }
}
// Update the actor active effects when editing an owned item
function updateItemEffects(candidate, updates, options, user) {
    if (!candidate.isOwned)
        return true;
    if (user !== game.user?.id)
        return true;
    //@ts-expect-error
    if (CONFIG.ActiveEffect.legacyTransferral === false) {
        return true;
    }
    if (options.isUndo)
        return true;
    if (updates.system?.equipped !== undefined || updates.system?.attuned !== undefined) {
        // equipped / attuned updated.
        const isEnabled = (updates.system.equipped ?? candidate.system.equipped) && (updates.system.attuned ?? candidate.system.attuned) !== daeSystemClass.systemConfig.REQUIRED;
        const effects = candidate.effects.filter(ef => ef.transfer || ef.flags.dae.transfer);
    }
    if (options.isAdvancement) {
        console.warn(`Dae | Skipping effect re-creation for class advancement ${candidate.parent?.name ?? ""} item ${candidate.name}`);
        return;
    }
    if (updates.effects) { // item effects have changed - update transferred effects
        const itemUuid = candidate.uuid;
        // delete all actor effects for the given item
        let deletions = [];
        for (let aef of candidate.parent.effects) { // remove all transferred effects for the item
            const isTransfer = aef.flags.dae?.transfer;
            if (isTransfer && (aef.origin === itemUuid))
                deletions.push(aef.id);
        }
        ;
        // Now get all the item transfer effects
        let additions = candidate.effects.filter(aef => {
            const isTransfer = aef.transfer;
            foundry.utils.setProperty(aef, "flags.dae.transfer", isTransfer);
            return isTransfer;
        });
        additions = additions.map(ef => ef.toObject(false));
        additions.forEach(efData => {
            efData.origin = itemUuid;
        });
        if (deletions.length > 0) {
            actionQueue.add(candidate.parent.deleteEmbeddedDocuments.bind(candidate.parent), "ActiveEffect", deletions);
        }
        if (additions.length > 0) {
            actionQueue.add(candidate.parent.createEmbeddedDocuments.bind(candidate.parent), "ActiveEffect", additions);
        }
    }
    return true;
}
// Update the actor active effects when changing a transfer effect on an item
function updateTransferEffectsHook(candidate, updates, options, user) {
    if (user !== game.user?.id)
        return true;
    //@ts-expect-error
    if (CONFIG.ActiveEffect.legacyTransferral === false) { // if not legacy transfer do nothing
        // TODO consider rewriting the origin for the effect
        return true;
    }
    if (options.isUndo)
        return true;
    if (!(candidate.parent instanceof CONFIG.Item.documentClass))
        return true;
    const item = candidate.parent;
    if (!item.isOwned)
        return true;
    const actor = item.parent;
    // const isEnabled = item.system.equipped && item.system.attuned !== daeSystemClass.systemConfig?.attunementTypes?.REQUIRED;
    // const effects = candidate.effects.filter(ef => ef.transfer || ef.flags.dae.transfer)
    if (options.isAdvancement) {
        console.warn(`Dae | Skipping effect re-creation for class advancement ${candidate.parent?.name ?? ""} item ${candidate.name}`);
        return;
    }
    const itemUuid = item.uuid;
    // delete all actor effects for the given item
    let deletions = [];
    for (let aef of actor.effects) { // remove all transferred effects for the item
        const isTransfer = aef.flags.dae?.transfer;
        if (isTransfer && (aef.origin === itemUuid))
            deletions.push(aef.id);
    }
    ;
    // Now get all the item transfer effects
    let additions = item.effects.filter(aef => {
        const isTransfer = aef.transfer;
        foundry.utils.setProperty(aef, "flags.dae.transfer", isTransfer);
        return isTransfer;
    });
    additions = additions.map(ef => ef.toObject(false));
    additions.forEach(efData => {
        efData.origin = itemUuid;
    });
    if (deletions.length > 0) {
        actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", deletions);
    }
    if (additions.length > 0) {
        actionQueue.add(actor.createEmbeddedDocuments.bind(actor), "ActiveEffect", additions);
    }
    return true;
}
// When an item is created any effects have a source that points to the original item
// Need to update to refer to the created item
// THe id in the this is not the final _id
export function preCreateItemHook(candidate, data, options, user) {
    if (options.isUndo)
        return true;
    return true;
}
export async function deleteItemHook(...args) {
    let [candidateItem, options, user] = args;
    if (user !== game.user?.id)
        return;
    if (options.isUndo)
        return;
    //@ts-expect-error
    if (CONFIG.ActiveEffect.legacyTransferral)
        return;
    const actor = candidateItem.parent;
    if (!(actor instanceof Actor))
        return;
    const token = tokenForActor(actor);
    for (let effect of candidateItem.effects) {
        if (!effect.transfer)
            continue;
        if (effect.disabled || effect.isSuppressed)
            continue;
        try {
            const selfAuraChange = foundry.utils.getProperty(effect, "flags.ActiveAuras.isAura") === true
                && foundry.utils.getProperty(effect, "flags.ActiveAuras.ignoreSelf") === true
                && effect.origin.startsWith(actor.uuid);
            // don't apply macro or macro like effects if active aura and not targeting self
            if (selfAuraChange)
                return;
            for (let change of effect.changes) {
                removeEffectChange(actor, [token], effect, candidateItem, change);
            }
        }
        catch (err) {
            console.warn("dae | error creating active effect ", err);
        }
    }
    return;
}
export async function createItemHook(...args) {
    let [item, options, user] = args;
    if (options.isUndo)
        return;
    if (user !== game.user?.id)
        return;
    const actor = item.parent;
    if (!(actor instanceof Actor))
        return;
    //@ts-expect-error
    if (CONFIG.ActiveEffect.legacyTransferral)
        return;
    // rewrite the origin of passive effects to point to the current item, rather than the world item
    if (rewriteTransferOrigin) {
        const updates = [];
        for (let effect of item.effects) {
            if (effect.transfer) {
                effect.origin = item.uuid;
                updates.push({ _id: effect._id, origin: item.uuid });
            }
        }
        if (updates.length > 0) {
            await item.updateEmbeddedDocuments("ActiveEffect", updates);
        }
    }
    const token = tokenForActor(actor);
    for (let effect of item.effects) {
        if (!effect.transfer)
            continue;
        if (effect.disabled || effect.isSuppressed)
            continue;
        try {
            const selfAuraChange = foundry.utils.getProperty(effect, "flags.ActiveAuras.isAura") === true
                && foundry.utils.getProperty(effect, "flags.ActiveAuras.ignoreSelf") === true
                && effect.origin.startsWith(actor.uuid);
            // don't apply macro or macro like effects if active aura and not targeting self
            if (selfAuraChange)
                return;
            for (let change of effect.changes) {
                addEffectChange(actor, [token], effect, item, change);
            }
        }
        catch (err) {
            console.warn("dae | error creating active effect ", err);
        }
    }
    return;
}
// Process onUpdateTarget flags
export function preUpdateActorHook(candidate, updates, options, user) {
    let result = true;
    try {
        if (options.onUpdateCalled)
            return result = true;
        for (let onUpdate of (foundry.utils.getProperty(candidate, "flags.dae.onUpdateTarget") ?? [])) {
            if (onUpdate.macroName.length === 0)
                continue;
            if (onUpdate.filter.startsWith("data.")) {
                onUpdate.filter = onUpdate.filter.replace("data.", "system.");
            }
            if (foundry.utils.getProperty(updates, onUpdate.filter) === undefined)
                continue;
            //@ts-expect-error fromUuidSync
            const originObject = fromUuidSync(onUpdate.origin);
            //@ts-expect-error fromUuidSync
            const sourceTokenDocument = fromUuidSync(onUpdate.sourceTokenUuid);
            //@ts-expect-error fromUuidSync
            const targetTokenDocument = fromUuidSync(onUpdate.targetTokenUuid);
            const sourceActor = actorFromUuid(onUpdate.sourceActorUuid);
            const sourceToken = sourceTokenDocument?.object;
            const targetActor = targetTokenDocument?.actor;
            const targetToken = targetTokenDocument?.object;
            let originItem = (originObject instanceof Item) ? originObject : undefined;
            if (!originItem) {
                const theEffect = targetActor.appliedEffects.find(ef => ef.origin === onUpdate.origin);
                if (foundry.utils.getProperty(theEffect, "flags.dae.itemUuid")) {
                    //@ts-expect-error fromUUid type error
                    originItem = fromUuidSync(foundry.utils.getProperty(theEffect, "flags.dae.itemUuid"));
                }
            }
            let lastArg = {
                tag: "onUpdateTarget",
                effectId: null,
                origin: onUpdate.origin,
                efData: null,
                actorId: targetActor.id,
                actorUuid: targetActor.uuid,
                tokenId: targetToken.id,
                tokenUuid: targetTokenDocument.uuid,
                actor: candidate,
                updates,
                options,
                user,
                sourceActor,
                sourceToken,
                targetActor,
                targetToken,
                originItem
            };
            let macroText;
            if (onUpdate.macroName.startsWith("ItemMacro")) { // TODO Come back and make sure this is tagged to the effect
                if (onUpdate.macroName === "ItemMacro") {
                    macroText = foundry.utils.getProperty(originObject, "flags.dae.macro.command") ?? foundry.utils.getProperty(originObject, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(originObject, "flags.itemacro.macro.data.command");
                }
                else if (onUpdate.macroName.startsWith("ItemMacro.")) {
                    let macroObject = sourceActor?.items.getName(onUpdate.macroName.split(".")[1]);
                    if (!macroObject)
                        macroObject = originObject?.parent?.items.getName(onUpdate.macroName.split(".")[1]);
                    if (macroObject)
                        macroText = foundry.utils.getProperty(macroObject, "flags.dae.macro.command") ?? foundry.utils.getProperty(macroObject, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(macroObject, "flags.itemacro.macro.data.command");
                }
            }
            else {
                const theMacro = game.macros?.getName(onUpdate.macroName);
                if (!theMacro) {
                    console.warn(`dae | onUpdateActor no macro found for actor ${candidate.name} macro ${onUpdate.macroName}`);
                    continue;
                }
                //@ts-expect-error type v10
                if (theMacro?.type === "chat") {
                    theMacro.execute(); // use the core foundry processing for chat macros
                    continue;
                }
                //@ts-expect-error
                macroText = theMacro?.command;
            }
            try { // TODO make an actual macro and then call macro.execute....
                const speaker = ChatMessage.getSpeaker({ actor: candidate });
                const args = ["onUpdateActor"].concat(onUpdate.args);
                args.push(lastArg);
                const character = undefined; // game.user?.character;
                const scope = { args, lastArgValue: lastArg, item: originItem };
                args.forEach(argString => {
                    if (typeof argString === "string") {
                        const parts = argString.split("=");
                        if (parts.length === 2) {
                            scope[parts[0]] = parts[1];
                        }
                    }
                });
                macroText = `try { ${macroText} } catch(err) { console.warn("macro error", err) };`;
                const AsyncFunction = (async function () { }).constructor;
                const argNames = Object.keys(scope);
                const argValues = Object.values(scope);
                //@ts-expect-error
                const fn = new AsyncFunction("speaker", "actor", "token", "character", "scope", ...argNames, macroText);
                fn.call(this, speaker, candidate, targetTokenDocument?.object, character, scope, ...argValues);
            }
            catch (err) {
                ui.notifications?.error(`There was an error running your macro. See the console (F12) for details`);
                error("dae | Error evaluating macro for onUpdateActor", err);
            }
        }
    }
    catch (err) {
        console.warn("dae | error in onUpdateTarget ", err);
    }
    finally {
        return result;
        // return wrapped(updates, options, user);
    }
}
export function daeReadyActions() {
    ValidSpec.localizeSpecs();
    // initSheetTab();
    if (game.settings.get("dae", "disableEffects")) {
        ui?.notifications?.warn("DAE effects disabled no DAE effect processing");
        console.warn("dae disabled - no active effects");
    }
    daeSystemClass.readyActions();
    aboutTimeInstalled = game.modules.get("about-time")?.active ?? false;
    simpleCalendarInstalled = game.modules.get("foundryvtt-simple-calendar")?.active ?? false;
    timesUpInstalled = game.modules.get("times-up")?.active ?? false;
    if (game.modules.get("dfreds-convenient-effects")?.active) {
        const ceItemId = game.settings.get("dfreds-convenient-effects", "customEffectsItemId") ?? "";
        CECustomEffectsItemUuid = game.items?.get(ceItemId)?.uuid;
    }
    if (itemacroActive) {
        Hooks.on("preUpdateItem", DIMEditor.preUpdateItemHook);
    }
}
export function localDeleteFilters(tokenId, filterName) {
    let tokenMagic = globalThis.TokenMagic;
    let token = canvas.tokens?.get(tokenId);
    if (token)
        tokenMagic.deleteFilters(token, filterName);
}
export var tokenizer;
// Fix for v11 not adding effects as expected. i.e. token.effects.visible ending up false
async function drawEffects(wrapped) {
    //@ts-expect-error
    if (game.release.generation > 11) {
        this.effects.visible = this.effects.visible || this.actor?.temporaryEffects.length;
    }
    else {
        const tokenEffects = this.document.effects;
        const actorEffects = this.actor?.temporaryEffects || [];
        this.effects.visible = this.effects.visible || tokenEffects.length || actorEffects.length;
    }
    return wrapped();
}
Hooks.on("spotlightOmnisearch.indexBuilt", (index, promises) => {
    return;
    console.error("DAE | spotlightOmnisearch.indexBuild", index, promises);
    //@ts-expect-error
    console.error("Config spotlight", CONFIG.SpotlightOmniseach, CONFIG);
    //@ts-expect-error
    index.push(new CONFIG.SpotlightOmniseach.SearchTerm({
        data: { name: "system.attributes.hp.value" },
        icon: ["fas fa-heart"],
        name: "system.attributes.hp.value",
        query: "",
        keywords: ["dae"],
        type: "DAE attributes"
    }));
});
export function daeInitActions() {
    // Default systtem class is setup, this oeverrides with system specific calss
    const dnd5esystem = DAESystemDND5E; // force reference so they are installed?
    const sw5eSystem = DAESystemSW5E;
    libWrapper = globalThis.libWrapper;
    if (foundry.utils.getProperty(globalThis.daeSystems, game.system.id))
        daeSystemClass = foundry.utils.getProperty(globalThis.daeSystems, game.system.id);
    else
        //@ts-expect-error
        daeSystemClass = globalThis.CONFIG.DAE.systemClass;
    daeSystemClass.initActions();
    daeSystemClass.initSystemData();
    needStringNumericValues = foundry.utils.isNewerVersion("9.250", game.version);
    if (game.settings.get("dae", "disableEffects")) {
        ui?.notifications?.warn("DAE effects disabled no DAE effect processing");
        console.warn("DAE active effects disabled.");
        return;
    }
    // Augment actor get rollData with actorUuid, actorId, tokenId, tokenUuid
    libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.getRollData", daeSystemClass.getRollDataFunc(), "WRAPPER");
    libWrapper.register("dae", "CONFIG.Token.objectClass.prototype.drawEffects", drawEffects, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.applyActiveEffects", applyBaseActiveEffects, "OVERRIDE");
    // If updating item effects recreate actor effects for updated item.
    Hooks.on("updateItem", updateItemEffects);
    // Need to move this to _preCreateActiveEffect for dice rolls - Map some fields that need to be changed when the effect is created...
    // Hooks.on("preCreateActiveEffect", preCreateActiveEffectHook);
    Hooks.on("preUpdateItem", preUpdateItemHook);
    Hooks.on("createItem", createItemHook);
    Hooks.on("deleteItem", deleteItemHook);
    // libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype._preUpdate", preUpdateActor, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.Item.documentClass.prototype._preCreate", _preCreateItem, "WRAPPER");
    // process onUpdateTarget flags
    Hooks.on("preUpdateActor", preUpdateActorHook);
    // wrap so we can remove the existing effect before the new one is created
    libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype._preCreate", preCreateActiveEffect, "WRAPPER");
    async function preCreateActiveEffect(wrapped, data, options, user) {
        await _preCreateActiveEffectRemoveExisting.bind(this)(wrapped, data, user);
        return await _preCreateActiveEffect.bind(this)(wrapped, data, options, user);
    }
    ;
    // Hooks.on("createActiveEffect", removeExistingEffectsHook) - this fires too late
    Hooks.on("createActiveEffect", createActiveEffectHook);
    Hooks.on("deleteActiveEffect", deleteActiveEffectHook);
    Hooks.on("preUpdateActiveEffect", preUpdateActiveEffectEvalInlineHook);
    Hooks.on("preUpdateActiveEffect", recordDisabledSuppressedHook);
    Hooks.on("updateActiveEffect", updateActiveEffectHook);
    Hooks.on("updateActiveEffect", updateTransferEffectsHook);
    // Add the active effects title bar actions
    Hooks.on("getActorSheetHeaderButtons", attachActorSheetHeaderButton);
    Hooks.on("getItemSheetHeaderButtons", attachItemSheetHeaderButton);
    Hooks.on('renderActorSheet', updateSheetHeaderButton);
    Hooks.on('renderItemSheet', updateSheetHeaderButton);
    Hooks.on("preDeleteCombat", preDeleteCombatHook);
    Hooks.on("preCreateCombatant", preCreateCombatantHook);
    //@ts-expect-error
    tokenizer = new DETokenizeThis({
        shouldTokenize: ['(', ')', ',', '*', '/', '%', '+', '===', '==', '!=', '!', '<', '> ', '<=', '>=', '^']
    });
    actionQueue = new foundry.utils.Semaphore();
}
function attachActorSheetHeaderButton(app, buttons) {
    if (!daeTitleBar)
        return;
    const title = game.i18n.localize('dae.ActiveEffectName');
    const titleText = daeNoTitleText ? "" : title;
    buttons.unshift({
        label: titleText,
        class: 'dae-config-actorsheet',
        icon: 'fas fa-wrench',
        onclick: ev => { new ActiveEffects(app.document, {}).render(true); }
    });
}
function attachItemSheetHeaderButton(app, buttons) {
    if (daeTitleBar) {
        const title = game.i18n.localize('dae.ActiveEffectName');
        const titleText = daeNoTitleText ? "" : title;
        buttons.unshift({
            label: titleText,
            class: 'dae-config-itemsheet',
            icon: 'fas fa-wrench',
            onclick: ev => { new ActiveEffects(app.document, {}).render(true); }
        });
    }
    if (DIMETitleBar) {
        const DIMtitle = game.i18n.localize('dae.DIMEditor.Name');
        const DIMtitleText = daeNoTitleText ? "" : DIMtitle;
        buttons.unshift({
            label: DIMtitleText,
            class: 'dae-dimeditor',
            icon: 'fas fa-file-pen',
            onclick: ev => { new DIMEditor(app.document, {}).render(true); }
        });
    }
}
function updateSheetHeaderButton(app, [elem], options) {
    if (!daeColorTitleBar || !daeTitleBar)
        return;
    if (elem?.querySelector('.dae-config-actorsheet') || elem?.querySelector('.dae-config-itemsheet')) {
        const daeActorSheetButton = elem.closest('.window-app').querySelector('.dae-config-actorsheet');
        const daeItemSheetButton = elem.closest('.window-app').querySelector('.dae-config-itemsheet');
        let hasEffects;
        if (app.document instanceof CONFIG.Actor.documentClass)
            hasEffects = app.document.allApplicableEffects().next().value !== undefined;
        else
            hasEffects = app.document.effects?.size > 0;
        if (!!hasEffects) {
            const sheetButtonToUpdate = !!daeActorSheetButton ? daeActorSheetButton : daeItemSheetButton;
            sheetButtonToUpdate.style.color = 'green'; //that could be added in another setting
        }
    }
    if (elem?.querySelector('.dae-dimeditor')) {
        const daeSheetButton = elem.closest('.window-app').querySelector('.dae-dimeditor');
        const hasMacro = !!(foundry.utils.getProperty(app.object, "flags.dae.macro.command") ?? foundry.utils.getProperty(app.object, "flags.itemacro.macro.command") ?? foundry.utils.getProperty(app.object, "flags.itemacro.macro.data.command"));
        if (hasMacro)
            daeSheetButton.style.color = 'green'; //that could be added in another setting
    }
}
export function daeSetupActions() {
    cltActive = game.modules.get("condition-lab-triggler")?.active;
    //@ts-expect-error .version
    ceActive = game.modules.get("dfreds-convenient-effects")?.active && foundry.utils.isNewerVersion(game.modules?.get("dfreds-convenient-effects")?.version ?? "0", "1.6.2");
    //@ts-expect-error .version
    debug("Condition Lab Triggle Active ", cltActive, " and clt version is ", game.modules.get("condition-lab-triggler")?.version);
    atlActive = game.modules.get("ATL")?.active;
    //@ts-expect-error .version
    if (cltActive && !foundry.utils.isNewerVersion(game.modules.get("condition-lab-triggler")?.version, "1.4.0")) {
        ui.notifications.warn("Condition Lab Triggler needs to be version 1.4.0 or later - conditions disabled");
        console.warn("Condition Lab Triggler needs to be version 1.4.0 or later - conditions disabled");
        cltActive = false;
    }
    else if (cltActive) {
        debug("dae | Combat Utility Belt active and conditions enabled");
    }
    itemacroActive = game.modules.get("itemacro")?.active;
    furnaceActive = game.modules.get("furnace")?.active || game.modules.get("advanced-macros")?.active;
    midiActive = game.modules.get("midi-qol")?.active;
    statusCounterActive = game.modules.get("statuscounter")?.active;
    daeSystemClass.setupActions();
}
export function fetchParams() {
    //@ts-expect-error type string
    setDebugLevel(game.settings.get("dae", "ZZDebug"));
    // useAbilitySave = game.settings.get("dae", "useAbilitySave") disabled as of 0.8.74
    confirmDelete = game.settings.get("dae", "confirmDelete");
    noDupDamageMacro = game.settings.get("dae", "noDupDamageMacro");
    disableEffects = game.settings.get("dae", "disableEffects");
    daeTitleBar = game.settings.get("dae", "DAETitleBar");
    DIMETitleBar = game.settings.get("dae", "DIMETitleBar");
    daeColorTitleBar = game.settings.get("dae", "DAEColorTitleBar");
    daeNoTitleText = game.settings.get("dae", "DAENoTitleText");
    rewriteTransferOrigin = game.settings.get("dae", "rewriteTransferOrigin");
    expireRealTime = game.settings.get("dae", "expireRealTime");
    // showDeprecation = game.settings.get("dae", "showDeprecation") ?? true;
    showInline = game.settings.get("dae", "showInline") ?? false;
    Hooks.callAll("dae.settingsChanged");
}
export function getTokenDocument(tokenRef) {
    if (typeof tokenRef === "string") {
        //@ts-expect-error fromUuidSync
        const entity = fromUuidSync(tokenRef);
        if (entity instanceof TokenDocument)
            return entity;
        if (entity instanceof Token)
            return entity.document;
        if (entity instanceof Actor) {
            if (entity.isToken)
                return entity.token ?? undefined;
            else
                return entity.getActiveTokens()[0]?.document;
        }
        return undefined;
    }
    if (tokenRef instanceof TokenDocument)
        return tokenRef;
    if (tokenRef instanceof Token)
        return tokenRef.document;
    if (tokenRef instanceof Actor) {
        // actor.token returns a token document
        if (tokenRef.isToken)
            return tokenRef.token ?? undefined;
        else
            return tokenRef.getActiveTokens()[0]?.document;
    }
}
export function getToken(tokenRef) {
    if (typeof tokenRef === "string") {
        //@ts-expect-error fromUuidSync
        const entity = fromUuidSync(tokenRef);
        if (entity instanceof Token)
            return entity;
        //@ts-expect-error object type
        if (entity instanceof TokenDocument)
            return entity.object ?? undefined;
        if (entity instanceof Actor) {
            //@ts-expect-error object type entity.token returns a tokenDocument
            if (entity.isToken)
                return entity.token?.object ?? undefined;
            else
                return entity.getActiveTokens()[0];
        }
        return undefined;
    }
    if (tokenRef instanceof Token)
        return tokenRef;
    //@ts-expect-error object type
    if (tokenRef instanceof TokenDocument)
        return tokenRef.object ?? undefined;
    if (tokenRef instanceof Actor) {
        //@ts-expect-error object type
        if (tokenRef.isToken)
            return tokenRef.token?.object ?? undefined;
        else
            return tokenRef.getActiveTokens()[0];
    }
}
export function actorFromUuid(uuid) {
    //@ts-expect-error fromUuidSync
    let doc = fromUuidSync(uuid);
    if (doc instanceof CONFIG.Token.documentClass)
        doc = doc.actor;
    if (doc instanceof CONFIG.Actor.documentClass)
        return doc;
    return null;
}
// Allow limited recursion of the formula replace function for things like
// bonuses.heal.damage in spell formulas.
export function replaceFormulaData(wrapped, formula, data, { missing, warn = false } = { missing: undefined, warn: false }) {
    let result = formula;
    const maxIterations = 3;
    if (typeof formula !== "string")
        return formula;
    for (let i = 0; i < maxIterations; i++) {
        if (!result.includes("@"))
            break;
        try {
            result = wrapped(result, data, { missing, warn });
        }
        catch (err) {
            error(err, formula, data, missing, warn);
        }
    }
    return result;
}
export function tokenForActor(actor) {
    const tokens = actor.getActiveTokens();
    if (!tokens.length)
        return undefined;
    const controlled = tokens.filter(t => t._controlled);
    return controlled.length ? controlled.shift() : tokens.shift();
}
export function effectIsTransfer(effect) {
    if (effect.flags.dae?.transfer !== undefined)
        return effect.flags.dae.transfer;
    if (effect.transfer !== undefined)
        return effect.transfer;
    return false;
}
export async function delay(interval) {
    await new Promise(resolve => setTimeout(resolve, interval));
}
export function safeGetGameSetting(moduleName, settingName) {
    if (game.settings.settings.get(`${moduleName}.${settingName}`))
        return game.settings.get(moduleName, settingName);
    else
        return undefined;
}