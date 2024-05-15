import { debug, debugEnabled, error, i18n, warn } from "../../dae.js";
import { applyDaeEffects, daeSystemClass, libWrapper } from "../dae.js";
export let wildcardEffects = [];
export let _characterSpec = { data: {}, flags: {} };
export class ValidSpec {
    //  static specs: {allSpecs: ValidSpec[], allSpecsObj: {}, baseSpecs: ValidSpec[], baseSpecsObj: {}, derivedSpecsObj: {}, derivedSpecs: ValidSpec[]}; 
    static specs;
    _fieldSpec;
    get fieldSpec() { return this._fieldSpec; }
    ;
    set fieldSpec(spec) { this._fieldSpec = spec; }
    _fieldType;
    get fieldType() { return this._fieldType; }
    set fieldType(value) { this._fieldType = value; }
    _label;
    get label() { return this._label; }
    set label(label) { this._label = label; }
    _forcedMode;
    get forcedMode() { return this._forcedMode; }
    set forcedMode(mode) { this._forcedMode = mode; }
    _options;
    get options() { return this._options; }
    set options(options) { this._options = options; }
    constructor(fs, sv, forcedMode = -1, label = undefined, options = undefined) {
        this._fieldSpec = fs;
        this._fieldType = sv;
        this._label = label ?? fs;
        this._forcedMode = forcedMode;
        this._options = options;
    }
    static createValidMods() {
        //@ts-ignore
        this.specs = {};
        //@ts-ignore
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        //@ts-ignore
        const system = globalThis.CONFIG.DAE.systemClass;
        // for (let specKey of Object.keys(game.system.model.Actor)) {
        //@ts-expect-error dataModels
        for (let specKey of Object.keys(CONFIG.Actor.dataModels)) {
            this.specs[specKey] = { allSpecs: [], allSpecsObj: {}, baseSpecs: [], baseSpecsObj: {}, derivedSpecsObj: {}, derivedSpecs: [] };
            _characterSpec["system"] = game.system.model ? foundry.utils.duplicate(game.system.model.Actor[specKey] ?? {}) : {};
            let baseValues = foundry.utils.flattenObject(_characterSpec);
            for (let prop in baseValues) {
                baseValues[prop] = [baseValues[prop], -1];
            }
            daeSystemClass.modifyBaseValues(specKey, baseValues, _characterSpec);
            Hooks.callAll("dae.modifyBaseValues", specKey, baseValues, _characterSpec);
            // baseValues["items"] = ""; // TODO one day work this out.
            if (game.modules.get("gm-notes")?.active) {
                baseValues["flags.gm-notes.notes"] = ["", -1];
                baseValues["system.att"];
            }
            var specials = {};
            //@ts-ignore
            specials["macro.CUB"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["macro.CLT"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["macro.CE"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["StatusEffect"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["StatusEffectLabel"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["StatusEffectName"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            daeSystemClass.modifySpecials(specKey, specials, _characterSpec);
            Hooks.callAll("dae.modifySpecials", specKey, specials, _characterSpec);
            // TODO reactivate when cond vis is v10 ready
            // specials["macro.ConditionalVisibility"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            // specials["macro.ConditionalVisibilityVision"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["flags.dae.onUpdateTarget"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            specials["flags.dae.onUpdateSource"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            Object.keys(specials).forEach(key => {
                if (debugEnabled > 0 && baseValues[key])
                    warn(`DAE | specials ${key} is already defined in baseValues - removing`);
                delete baseValues[key];
            });
            // baseSpecs are all those fields defined in template.json game.system.model and are things the user can directly change
            this.specs[specKey].baseSpecs = Object.keys(baseValues).map(spec => {
                let validSpec = new ValidSpec(spec, baseValues[spec][0] ?? baseValues[spec], baseValues[spec][1], baseValues[spec][2], baseValues[spec][3]);
                validSpec = daeSystemClass.modifyValidSpec(spec, validSpec); // System specific modifations
                this.specs[specKey].baseSpecsObj[spec] = validSpec;
                return validSpec;
            });
            //@ts-ignore
            if (game.modules.get("tokenmagic")?.active) {
                specials["macro.tokenMagic"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
            }
            daeSystemClass.modifyDerivedSpecs(specKey, this.specs[specKey].derivedSpecs, _characterSpec);
            Hooks.callAll("dae.modifyDerivedSpecs", specKey, this.specs[specKey].derivedSpecs, _characterSpec);
            Object.entries(specials).forEach(special => {
                //@ts-expect-error
                let validSpec = new ValidSpec(special[0], special[1][0], special[1][1], special[1][2], special[1][3]);
                this.specs[specKey].derivedSpecs.push(validSpec);
            });
            this.specs[specKey].allSpecs = this.specs[specKey].baseSpecs.concat(this.specs[specKey].derivedSpecs);
            // TDO come back and clean this up
            if (["dnd5e", "sw5e"].includes(game.system.id)) {
                // Special case for armor/hp which can depend on derived attributes - like dexterity mod or constituion mod
                // and initiative bonus depends on advantage on initiative
                this.specs[specKey].allSpecs.forEach(m => {
                    if (["attributes.hp", "attributes.ac"].includes(m._fieldSpec)) {
                        m._fieldType = 0;
                    }
                });
            }
            this.specs[specKey].allSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
            this.specs[specKey].baseSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
            this.specs[specKey].derivedSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
            this.specs[specKey].allSpecs.forEach(ms => this.specs[specKey].allSpecsObj[ms._fieldSpec] = ms);
            this.specs[specKey].baseSpecs.forEach(ms => this.specs[specKey].baseSpecsObj[ms._fieldSpec] = ms);
            this.specs[specKey].derivedSpecs.forEach(ms => this.specs[specKey].derivedSpecsObj[ms._fieldSpec] = ms);
        }
        let allSpecsObj = {};
        let baseSpecsObj = {};
        let derivedSpecsObj = {};
        //@ts-expect-error
        for (let specKey of Object.keys(CONFIG.Actor.dataModels)) {
            Object.keys(this.specs[specKey].allSpecsObj).forEach(key => allSpecsObj[key] = this.specs[specKey].allSpecsObj[key]);
            Object.keys(this.specs[specKey].baseSpecsObj).forEach(key => baseSpecsObj[key] = this.specs[specKey].baseSpecsObj[key]);
            Object.keys(this.specs[specKey].derivedSpecsObj).forEach(key => derivedSpecsObj[key] = this.specs[specKey].derivedSpecsObj[key]);
        }
        this.specs["union"] = { allSpecs: [], allSpecsObj: {}, baseSpecs: [], baseSpecsObj: {}, derivedSpecsObj: {}, derivedSpecs: [] };
        this.specs["union"].allSpecsObj = allSpecsObj;
        this.specs["union"].baseSpecsObj = baseSpecsObj;
        this.specs["union"].derivedSpecsObj = derivedSpecsObj;
        this.specs["union"].allSpecs = Object.keys(this.specs["union"].allSpecsObj).map(k => this.specs["union"].allSpecsObj[k]);
        this.specs["union"].baseSpecs = Object.keys(this.specs["union"].baseSpecsObj).map(k => this.specs["union"].baseSpecsObj[k]);
        this.specs["union"].derivedSpecs = Object.keys(this.specs["union"].derivedSpecsObj).map(k => this.specs["union"].derivedSpecsObj[k]);
        this.specs["union"].allSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
        this.specs["union"].baseSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
        this.specs["union"].derivedSpecs.sort((a, b) => { return a._fieldSpec.toLocaleLowerCase() < b._fieldSpec.toLocaleLowerCase() ? -1 : 1; });
    }
    static localizeSpecs() {
        if (!ValidSpec.specs) {
            ValidSpec.createValidMods();
        }
        ;
        if (!ValidSpec.specs) {
            ui.notifications.error("DAE | Initialisation failed - no specs defined");
            return;
        }
        //@ts-expect-error dataModels
        for (let specKey of Object.keys(CONFIG.Actor.dataModels)) {
            if (!this.specs[specKey])
                continue; // not all of the actor types are defined in the system
            const fieldStart = `flags.${game.system.id}.`;
            this.specs[specKey].allSpecs = this.specs[specKey].allSpecs.map(m => {
                m._label = m._label.replace("data.", "").replace(`{game.system.id}.`, "").replace(".value", "").split(".").map(str => game.i18n.localize(`dae.${str}`).replaceAll("dae.", "")).join(" ");
                if (m.fieldSpec.includes(`flags.${game.system.id}`)) {
                    const fieldId = m.fieldSpec.replace(fieldStart, "");
                    //@ts-expect-error
                    const characterFlags = game.system.config?.characterFlags ?? {};
                    const localizedString = i18n(characterFlags[fieldId]?.name) ?? i18n(`dae.${fieldId}`);
                    m._label = `Flags ${localizedString}`;
                }
                const saveBonus = m._fieldSpec.match(/system.abilities.(\w\w\w).save/);
                const checkBonus = m._fieldSpec.match(/system.abilities.(\w\w\w).mod/);
                const skillMod = m._fieldSpec.match(/system.skills.(\w\w\w).mod/);
                const skillPassive = m._fieldSpec.match(/system.skills.(\w\w\w).passive/);
                if (saveBonus)
                    m._label = `${m._label} (Deprecated)`;
                else if (checkBonus)
                    m._label = `${m._label} (Deprecated)`;
                else if (skillMod)
                    m._label = `${m._label} (Deprecated)`;
                else if (skillPassive)
                    m._label = `${m._label} (Deprecated)`;
                else if (m._fieldSpec === "StatusEffectLabel")
                    m._label = `${m._label} (Deprecated)`;
                else if (m._fieldSpec === "system.attributes.ac.value")
                    m._label = `${m._label} (Deprecated)`;
                else if (this.specs[specKey].derivedSpecsObj[m._fieldSpec])
                    m._label = `${m._label} (*)`;
                return m;
            });
        }
    }
}
function getRollData(wrapped, ...args) {
    // need to be careful - default foundry getRollData() returns the "live" actor.system
    return wrapped(args);
}
export class DAESystem {
    static spellAttacks;
    static weaponAttacks;
    static attackTypes;
    static bonusSelectors;
    static daeActionTypeKeys;
    static detectionModeList;
    static fieldMappings = {};
    static get systemConfig() {
        //@ts-expect-error
        return game.system.config;
    }
    static getActorDataModelFields(actorType) {
        //@ts-expect-error
        return CONFIG.Actor.dataModels[actorType]?.schema?.fields;
        /*
        const dataModels: any = game.system.dataModels;
        const actorModel: any = dataModels.actor;
        let actorModels = { "character": actorModel.CharacterData.schema.fields, "npc": actorModel.NPCData.schema.fields, "group": actorModel.GroupData.schema.fields, "vehicle": actorModel.VehicleData.schema.fields }
        return actorModels[actorType];
        */
    }
    static getRollDataFunc() {
        return getRollData;
    }
    /**
     * accepts a string field specificaiton, e.g. system.traits.languages.value. Used extensively in ConfigPanel.ts
     * return an object or false.
     * Keys are valid options for the field specificaiton and the value is the user facing text for that option
     * e.g. {common: "Common"}
     * */
    static getOptionsForSpec(specification) {
        if (!specification.key)
            return undefined;
        if (specification?.key === "ATE.detectionMode") {
            return this.detectionModeList;
        }
        return undefined;
    }
    // Configure any lookp lists that might be required by getOptionsForSpec.
    static configureLists(daeConfig) {
        this.detectionModeList = {};
        //@ts-expect-error detectionModes
        Object.values(CONFIG.Canvas.detectionModes).forEach(dm => {
            //@ts-expect-error .id .label
            this.detectionModeList[dm.id] = i18n(`${dm.label}`);
        });
    }
    static async editConfig() {
        return;
    }
    static modifyBaseValues(actorType, baseValues, characterSpec) {
    }
    ;
    static modifySpecials(actorType, specials, characterSpec) {
        //@ts-ignore
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        specials["macro.execute"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.execute.local"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.execute.GM"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.itemMacro"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.itemMacro.local"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.itemMacro.GM"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.actorUpdate"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.createItem"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["macro.createItemRunMacro"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        // specials["macro.createToken"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
    }
    ;
    static modifyDerivedSpecs(actorType, derivedSpecs, characterSpec) {
    }
    static effectDisabled(actor, effect, itemData = null) {
        return effect.disabled;
    }
    static modifyValidSpec(spec, validSpec) {
        return validSpec;
    }
    static doCustomValue(actor, current, change, validValues) {
        if ((current || []).includes(change.value))
            return true;
        if (!validValues.includes(change.value))
            return true;
        foundry.utils.setProperty(actor, change.key, current.concat([change.value]));
        return true;
    }
    static doCustomArrayValue(actor, current, change, validValues) {
        if (current instanceof Array) {
            if (foundry.utils.getType(change.value) === "string" && change.value[0] === "-") {
                const checkValue = change.value.slice(1);
                const currentIndex = (current ?? []).indexOf(checkValue);
                if (currentIndex === -1)
                    return true;
                if (!validValues?.includes(checkValue))
                    return true;
                const returnValue = foundry.utils.duplicate(current);
                returnValue.splice(currentIndex, 1);
                foundry.utils.setProperty(actor, change.key, returnValue);
            }
            else {
                if ((current ?? []).includes(change.value))
                    return true;
                if (!validValues?.includes(change.value))
                    return true;
                foundry.utils.setProperty(actor, change.key, current.concat([change.value]));
            }
        }
        else if (current instanceof Set) {
            if (foundry.utils.getType(change.value) === "string" && change.value[0] === "-") {
                const checkValue = change.value.slice(1);
                if (!current.has(checkValue))
                    return true;
                if (validValues && !validValues.includes(checkValue))
                    return true;
                const returnValue = foundry.utils.deepClone(current);
                returnValue.delete(checkValue);
                foundry.utils.setProperty(actor, change.key, returnValue);
            }
            else {
                if ((current ?? new Set()).has(change.value))
                    return true;
                if (validValues && !validValues.includes(change.value))
                    return true;
                let returnValue = foundry.utils.deepClone(current);
                returnValue.add(change.value);
                foundry.utils.setProperty(actor, change.key, returnValue);
            }
        }
        return true;
    }
    static initSystemData() {
        this.spellAttacks = [];
        this.weaponAttacks = [];
        this.attackTypes = [];
        this.bonusSelectors = {};
        this.daeActionTypeKeys = [];
    }
    static addDAEMetaData(activeEffectData, item, options) {
        foundry.utils.setProperty(activeEffectData, "flags.dae.itemData", item.toObject(false));
        foundry.utils.setProperty(activeEffectData, "flags.dae.transfer", false);
        if (options.metaData)
            foundry.utils.mergeObject(activeEffectData, options.metaData);
    }
    static safeEval(expression, sandbox, onErrorReturn = undefined) {
        let result;
        try {
            const src = 'with (sandbox) { return ' + expression + '}';
            const evl = new Function('sandbox', src);
            //@ts-expect-error
            sandbox = foundry.utils.mergeObject(sandbox, { Roll, fromUuidSync: foundry.utils.fromUuidSync });
            const sandboxProxy = new Proxy(sandbox, {
                has: () => true,
                get: (t, k) => k === Symbol.unscopables ? undefined : (t[k] ?? Math[k]),
                //@ts-expect-error
                set: () => console.error("You may not set properties of the sandbox environment") // No-op
            });
            result = evl(sandboxProxy);
        }
        catch (err) {
            const message = `dae | safeEval | expression evaluation failed ${expression}`;
            console.warn(message, err);
            result = onErrorReturn;
        }
        if (Number.isNumeric(result))
            return Number(result);
        return result;
    }
    ;
    static safeEvalExpression(input, context, depth = 0) {
        if (typeof input !== "string")
            return input;
        input = Roll.replaceFormulaData(input, context);
        let validFunctionName = /^[a-zA-Z_$][0-9a-zA-Z_$.]*$/; // regex for valid JS function name
        if (depth > 20) {
            console.error("It's turtles all the way down....");
            return input;
        }
        let stack = [];
        let output = '';
        let temp;
        let functionStack = []; // additional stack for function name
        for (let char of input) {
            if (char === '(') {
                let funcName = '';
                while (stack.length > 0 && /[a-zA-Z_$0-9.]/.test(stack[stack.length - 1])) {
                    funcName = stack.pop() + funcName;
                }
                if (Math[funcName])
                    funcName = funcName = `Math.${funcName}`;
                if (!validFunctionName.test(funcName) && funcName.length > 0) {
                    throw new Error(`Invalid function name: ${funcName}`);
                }
                functionStack.push(funcName);
                stack.push('(');
            }
            else if (char === ')') {
                temp = '';
                let poppedChar;
                // Pop elements from the stack until we find the matching opening parenthesis
                while ((poppedChar = stack.pop()) !== '(') {
                    temp = poppedChar + temp;
                }
                // Pop the function name
                let funcName = functionStack.pop();
                // Evaluate the function call
                if (funcName === "dae.eval")
                    stack.push(`${this.safeEval(this.safeEvalExpression(temp, context, depth + 1), context)}`);
                else if (funcName === "dae.roll") {
                    try {
                        //@ts-expect-error
                        if (game.release.generation > 11) {
                            error(`%c dae.roll in ${input} is not supported in expression ${input} in foundry version 12 and has been discarded`, "color: red", context.name, context.actorUuid);
                            stack.push(this.safeEval("0", context)); // v12 does not support synchronous dice rolling)
                        }
                        else {
                            console.warn(`%c dae.roll in ${input} is not supported in foundry version 12 and will be discarded`, "color: red", context.name, context.actorUuid);
                            const rollExpression = `new Roll(${temp}).evaluate({async: false}).total`;
                            stack.push(this.safeEval(rollExpression, context));
                        }
                    }
                    catch (err) {
                        console.warn(`dae | dae.roll bad dice expression ${temp}`, err);
                        stack.push(0);
                    }
                }
                else if (depth) {
                    const expression = `${funcName}(${this.safeEvalExpression(temp, context, depth + 1)})`;
                    stack.push(`${this.safeEval(expression, context)}`);
                }
                else
                    stack.push(`${funcName}(${temp})`);
            }
            else {
                stack.push(char);
            }
        }
        output = stack.join('');
        return output; // depth ? this.safeEval(output, context) : output;
    }
    static daeCustomEffect(actor, change) {
        if (typeof change.value === "string" && (change.value?.includes("dae.eval(") || change.value?.includes("dae.roll("))) {
            const context = actor.getRollData();
            context.actor = actor;
            change.value = this.safeEvalExpression(change.value, context, 0);
            foundry.utils.setProperty(actor, change.key, change.value);
        }
        if (change.key === "flags.dae.onUpdateTarget" && change.value?.includes(",")) {
            const values = change.value.split(",").map(str => str.trim());
            if (values.length < 5) {
                error("custom effect flags.dae.onUpdateTarget details incomplete", values);
                return;
            }
            const origin = values[0];
            const targetTokenUuid = values[1];
            const sourceTokenUuid = values[2];
            const sourceActorUuid = values[3];
            const flagName = values[4];
            const macroName = ["none", ""].includes(values[5] ?? "") ? "" : values[5];
            const filter = ["none", ""].includes(values[6] ?? "") ? "system" : values[6];
            ;
            const args = values.slice(7);
            let flagValue = foundry.utils.getProperty(actor, "flags.dae.onUpdateTarget") ?? [];
            flagValue.push({ flagName, macroName, origin, sourceTokenUuid, args, targetTokenUuid, filter, sourceActorUuid });
            foundry.utils.setProperty(actor, "flags.dae.onUpdateTarget", flagValue);
        }
        return true;
    }
    /*
    * replace the default actor prepareData
    * call applyDaeEffects
    * add an additional pass after derivfed data
    */
    static initActions() {
        Hooks.callAll("dae.addFieldMappings", this.fieldMappings);
        // We will call this in prepareData
        libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.applyActiveEffects", applyBaseActiveEffects, "OVERRIDE");
        // Might have to be tailored to other systems.
        libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.prepareData", prepareData, "WRAPPER");
        // This supplies DAE custom effects
        Hooks.on("applyActiveEffect", daeSystemClass.daeCustomEffect.bind(daeSystemClass));
    }
    static readyActions() {
    }
    static setupActions() {
    }
    static get applyBaseEffects() {
        return applyBaseActiveEffects;
    }
}
/*
* replace the default actor prepareData
* call applyDaeEffects
* add an additional pass after derivfed data
*/
function prepareData(wrapped) {
    if (!ValidSpec.specs) {
        ValidSpec.createValidMods();
    }
    if (!this.statuses)
        this.statuses = new Set();
    // Identify which special statuses had been active
    const specialStatuses = new Map();
    if (foundry.utils.isNewerVersion(game.version, "11.293")) {
        //@ts-expect-error specialStatusEffects
        for (const statusId of Object.values(CONFIG.specialStatusEffects)) {
            specialStatuses.set(statusId, this.statuses.has(statusId));
        }
        this.statuses.clear();
    }
    foundry.utils.setProperty(this, "flags.dae.onUpdateTarget", foundry.utils.getProperty(this._source, "flags.dae.onUpdateTarget"));
    debug("prepare data: before passes", this.name, this._source);
    this.overrides = {};
    wrapped();
    // Add an extra pass after prepareData has completed for "specials" to be applied
    applyDaeEffects.bind(this)({ specList: ValidSpec.specs[this.type].derivedSpecsObj, completedSpecs: ValidSpec.specs[this.type].baseSpecsObj, allowAllSpecs: true, wildCardsInclude: [], wildCardsExclude: wildcardEffects, doStatusEffects: true });
    if (foundry.utils.isNewerVersion(game.version, "11.293")) {
        // Apply special statuses that changed to active tokens
        let tokens;
        for (const [statusId, wasActive] of specialStatuses) {
            const isActive = this.statuses.has(statusId);
            if (isActive === wasActive)
                continue;
            if (!tokens)
                tokens = this.getActiveTokens();
            for (const token of tokens)
                token._onApplyStatusEffect(statusId, isActive);
        }
    }
    //TODO find another way to tdo this
    // this._prepareOwnedItems(this.items)
    debug("prepare data: after passes", this);
}
// this function replaces applyActiveEffects in Actor
function applyBaseActiveEffects() {
    applyDaeEffects.bind(this)({ specList: ValidSpec.specs[this.type].baseSpecsObj, completedSpecs: {}, allowAllSpecs: false, wildCardsInclude: wildcardEffects, wildCardsExclude: [], doStatusEffects: true });
}
foundry.utils.setProperty(globalThis, "CONFIG.DAE.systemClass", DAESystem);
Hooks.on("dae.modifySpecials", (specKey, specials, characterSpec) => {
    // Prelim support for ATE v10 - need some more detail.
    //@ts-ignore
    const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
    if (game.modules.get("ATL")?.active) {
        for (let label of ["dimSight", "brightSight"]) {
            specials[`ATL.${label}`] = ["number", -1];
        }
        specials["ATL.alpha"] = ["number", -1];
        specials["ATL.elevation"] = ["number", -1];
        specials["ATL.height"] = ["number", -1];
        specials["ATL.width"] = ["number", -1];
        specials["ATL.hidden"] = [false, -1];
        specials["ATL.rotation"] = ["number", -1];
        specials["ATL.light.animation"] = ["", -1]; //{intensity: 1:1"number", reverse: true/false, speed: 1:1"number", type: "X"}	Light Animation settings, see below for Animation Types
        specials["ATL.light.alpha"] = ["number", -1];
        specials["ATL.light.angle"] = ["number", -1];
        specials["ATL.light.attenuation"] = ["number", -1];
        specials["ATL.light.bright"] = ["number", -1];
        specials["ATL.light.color"] = ["number", -1];
        specials["ATL.light.coloration"] = ["number", -1];
        specials["ATL.light.contrast"] = ["number", -1];
        specials["ATL.light.dim"] = ["number", -1];
        specials["ATL.light.luminosity"] = ["number", -1];
        specials["ATL.light.saturation"] = ["number", -1];
        specials["ATL.light.shadows"] = ["number", -1];
        specials["ATL.light.darkness.max"] = ["number", -1];
        specials["ATL.light.darkness.min"] = ["number", -1];
        // specials["ATL.detectionModes.basicSight.range"] = ["number", -1];
        // specials["ATL.detectionModes.seeInvisibility.range"] = ["number", -1];
        // specials["ATL.detectionModes.senseInvisibility.range"] = ["number", -1];
        // specials["ATL.detectionModes.feelTremor.range"] = ["number", -1];
        // specials["ATL.detectionModes.seeAll.range"] = ["number", -1];
        // specials["ATL.detectionModes.senseAll.range"] = ["number", -1];
        specials["ATL.sight.visionMode"] = ["", 0]; // selection list
        specials["ATL.light.animation"] = ["", -1]; // json string
        specials["ATL.preset"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["ATL.sight.angle"] = ["number", -1];
        specials["ATL.sight.attenuation"] = ["number", -1];
        specials["ATL.sight.brightness"] = ["number", -1];
        specials["ATL.sight.contrast"] = ["number", -1];
        specials["ATL.sight.enabled"] = ["number", -1];
        specials["ATL.sight.range"] = ["number", -1];
        specials["ATL.sight.saturation"] = ["number", -1];
        specials["ATL.sight.color"] = ["", 0 - 1];
    }
    else if (game.modules.get("ATL")?.active) {
        // support new version of ATL
        //@ts-expect-error .version
        if (foundry.utils.isNewerVersion("0.3.04", game.modules.get("ATL")?.version)) {
            for (let label of ["dimLight", "brightLight", "dimSight", "brightSight", "sightAngle", "lightColor", "lightAnimation", "lightAlpha", "lightAngle"]) {
                specials[`ATL.${label}`] = ["number", -1];
            }
        }
        else {
            for (let label of ["light.dim", "light.bright", "dimSight", "brightSight", "sightAngle", "light.color", "light.animation", "light.alpha", "light.angle"]) {
                specials[`ATL.${label}`] = ["number", -1];
            }
        }
        specials["ATL.preset"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
    }
});