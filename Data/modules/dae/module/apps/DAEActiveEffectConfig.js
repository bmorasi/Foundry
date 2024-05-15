import { confirmDelete, cltActive, ceActive, atlActive, daeSystemClass } from "../dae.js";
import { i18n, confirmAction, daeSpecialDurations, daeMacroRepeats, log } from "../../dae.js";
import { ValidSpec } from "../Systems/DAESystem.js";
export var otherFields = [];
export function addAutoFields(fields) {
    fields.forEach(f => {
        if (!otherFields.includes(f))
            otherFields.push(f);
    });
    otherFields.sort();
}
export class DAEActiveEffectConfig extends ActiveEffectConfig {
    tokenMagicEffects;
    fieldsList;
    cltConditionList;
    ceEffectList;
    statusEffectList;
    ConditionalVisibilityList;
    ConditionalVisibilityVisionList;
    ATLPresets;
    ATLVisionModes;
    validFields;
    // object: any; Patch 4535992 Why ???
    constructor(object = {}, options = {}) {
        super(object, options);
        this.tokenMagicEffects = {};
        if (game.modules.get("tokenmagic")?.active) {
            globalThis.TokenMagic.getPresets().forEach(preset => {
                this.tokenMagicEffects[preset.name] = preset.name;
            });
        }
        else
            this.tokenMagicEffects["invalid"] = "module not installed";
        //@ts-expect-error
        let validSpecsToUse = ValidSpec.specs?.union;
        if (!validSpecsToUse) {
            ui.notifications.error("DAE | No valid specs found");
            return;
        }
        if (this.object.parent instanceof CONFIG.Actor.documentClass) {
            validSpecsToUse = ValidSpec.specs[this.object.parent.type];
        }
        this.fieldsList = Object.keys(validSpecsToUse.allSpecsObj);
        this.fieldsList = this.fieldsList.concat(otherFields);
        // if (window.MidiQOL?.midiFlags)  this.fieldsList = this.fieldsList.concat(window.MidiQOL.midiFlags);
        this.fieldsList.sort();
        //@ts-expect-error
        log(`There are ${this.fieldsList.length} fields to choose from of which ${window.MidiQOL?.midiFlags?.length || 0} come from midi-qol and ${validSpecsToUse.allSpecs.length} from dae`);
        this.fieldsList = this.fieldsList.join(", ");
        daeSystemClass.configureLists(this);
        if (cltActive) {
            this.cltConditionList = {};
            //@ts-expect-error .clt
            game.clt.conditions?.forEach(cltc => {
                this.cltConditionList[cltc.id] = cltc.name;
            });
        }
        this.statusEffectList = {};
        let efl = CONFIG.statusEffects;
        efl = efl.filter(se => se.id)
            .map(se => {
            if (se.id.startsWith("Convenient Effect:"))
                return { id: se.id, name: `${se.name ?? se.label} (CE)` };
            if (foundry.utils.getProperty(se, "flags.condition-lab-triggler"))
                return { id: se.id, name: `${se.name ?? se.label} (CLT)` };
            return { id: se.id, name: i18n(se.name ?? se.label) };
        })
            .sort((a, b) => a.name < b.name ? -1 : 1);
        efl.forEach(se => {
            this.statusEffectList[se.id] = se.name;
        });
        if (ceActive) {
            this.ceEffectList = {};
            //@ts-expect-error /dfreds
            game.dfreds?.effects?.all.forEach(ceEffect => {
                this.ceEffectList[ceEffect.name] = ceEffect.name;
            });
        }
        if (atlActive) {
            this.ATLPresets = {};
            //@ts-expect-error
            game.settings.get("ATL", "presets")?.forEach(preset => this.ATLPresets[preset.name] = preset.name);
            //@ts-expect-error
            Object.keys(CONFIG.Canvas.detectionModes).forEach(dm => {
                otherFields.push([`ATL.detectionModes.${dm}.range`]);
            });
            this.ATLVisionModes = {};
            //@ts-expect-error visionModes
            Object.values(CONFIG.Canvas.visionModes)
                //@ts-expect-error TokenConfig, the core sheet for a token does this filtering, I think we should too
                .filter(f => f.tokenConfig)
                //@ts-expect-error
                .forEach(f => this.ATLVisionModes[f.id] = i18n(f.label));
        }
        this.validFields = { "__": "" };
        this.validFields = validSpecsToUse.allSpecs
            .filter(e => e._fieldSpec.includes(""))
            .reduce((mods, em) => {
            mods[em._fieldSpec] = em._label;
            return mods;
        }, this.validFields);
        for (let field of otherFields) {
            this.validFields[field] = field;
        }
    }
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sheet", "active-effect-sheet window-app"],
            title: "EFFECT.ConfigTitle",
            template: `./modules/dae/templates/DAEActiveSheetConfig.html`,
            width: 900,
            height: "auto",
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: "form", initial: "details" }],
            dragDrop: [{ dropSelector: ".value" }],
            scrollY: [".dae-scrollable-list .scrollable"],
            //@ts-expect-error DOCUMENT_OWNERSHIP_LEVELS
            viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
    }
    /* ----------------------------------------- */
    get id() {
        return `${this.constructor.name}-${this.document.uuid.replace(/\./g, "-")}`;
        const object = this.object;
        let id = `ActiveEffectsConfig-${object?.id}`;
        if (object?.isToken)
            id += `-${object.token.id}`;
        return id;
    }
    /* ----------------------------------------- */
    getOptionsForSpec(spec) {
        if (!spec?.key)
            return undefined;
        if (spec.key.includes("tokenMagic"))
            return this.tokenMagicEffects;
        if (spec.key === "macro.CUB")
            return this.cltConditionList;
        if (spec.key === "macro.CE")
            return this.ceEffectList;
        if (spec.key === "macro.CLT")
            return this.cltConditionList;
        if (spec.key === "StatusEffect")
            return this.statusEffectList;
        if (spec.key === "macro.ConditionalVisibility")
            return this.ConditionalVisibilityList;
        if (spec.key === "macro.ConditionalVisibilityVision")
            return this.ConditionalVisibilityVisionList;
        if (spec.key === "ATL.preset")
            return this.ATLPresets;
        if (spec.key === "ATL.sight.visionMode")
            return this.ATLVisionModes;
        return daeSystemClass.getOptionsForSpec(spec);
    }
    /** @override */
    async getData(options) {
        if (foundry.utils.getProperty(this.object, "flags.dae.specialDuration") === undefined)
            foundry.utils.setProperty(this.object, "flags.dae.specialDuration", []);
        if (foundry.utils.getProperty(this.object, "flags.dae.stackable") === undefined)
            foundry.utils.setProperty(this.object, "flags.dae.stackable", "noneName");
        const data = await super.getData(options);
        let validSpecsToUse;
        if (!this.object.parent || !(this.object.parent instanceof CONFIG.Actor.documentClass)) {
            validSpecsToUse = ValidSpec.specs["union"];
        }
        else {
            validSpecsToUse = ValidSpec.specs[this.object.parent.type];
        }
        await daeSystemClass.editConfig();
        const allModes = Object.entries(CONST.ACTIVE_EFFECT_MODES)
            .reduce((obj, e) => {
            obj[e[1]] = game.i18n.localize("EFFECT.MODE_" + e[0]);
            return obj;
        }, {});
        data.modes = allModes;
        data.specialDuration = daeSpecialDurations;
        data.macroRepeats = daeMacroRepeats;
        const translations = geti18nTranslations();
        //@ts-expect-error
        data.stackableOptions = translations.stackableOptions ?? { "noneName": "Effects do not stack by name and origin", "noneNameOnly": "Effects do not stack by name", "none": "Effects do not stack", "multi": "Stacking effects apply the effect multiple times", "count": "each stack increase stack count by 1" };
        if (this.object.parent) {
            data.isItemEffect = this.object.parent instanceof CONFIG.Item.documentClass;
            data.isActorEffrect = this.object.parent instanceof CONFIG.Actor.documentClass;
        }
        if (data.isItemEffect)
            validSpecsToUse = ValidSpec.specs["union"]; // TODO think about what it means to edit an item effect
        if (data.isActorEffect)
            validSpecsToUse = ValidSpec.specs[this.object.parent.type];
        data.validFields = this.validFields;
        data.submitText = "EFFECT.Submit";
        data.effect.changes.forEach(change => {
            if ([-1, undefined].includes(validSpecsToUse.allSpecsObj[change.key]?.forcedMode)) {
                change.modes = allModes;
            }
            else if (validSpecsToUse.allSpecsObj[change.key]) {
                const mode = {};
                mode[validSpecsToUse.allSpecsObj[change.key]?.forcedMode] = allModes[validSpecsToUse.allSpecsObj[change.key]?.forcedMode];
                change.modes = mode;
            }
            else if (!validSpecsToUse.allSpecsObjchange.key.startsWith("flags.midi-qol")) {
                change.modes = allModes; //change.mode ? allModes: [allModes[CONST.ACTIVE_EFFECT_MODES.CUSTOM]];
            }
            if (validSpecsToUse.allSpecsObj[change.key]?.options)
                change.options = validSpecsToUse.allSpecsObj[change.key]?.options;
            else
                change.options = this.getOptionsForSpec(change);
            if (!change.priority)
                change.priority = change.mode * 10;
        });
        const simpleCalendar = globalThis.SimpleCalendar?.api;
        if (simpleCalendar && data.effect.duration?.startTime) {
            const dateTime = simpleCalendar.formatDateTime(simpleCalendar.timestampToDate(data.effect.duration.startTime));
            data.startTimeString = dateTime.date + " " + dateTime.time;
            if (data.effect.duration.seconds) {
                const duration = simpleCalendar.formatDateTime(simpleCalendar.timestampToDate(data.effect.duration.startTime + data.effect.duration.seconds));
                data.durationString = duration.date + " " + duration.time;
            }
        }
        foundry.utils.setProperty(data.effect, "flags.dae.durationExpression", this.object.flags?.dae?.durationExpression);
        if (!data.effect.flags?.dae?.specialDuration || !(data.effect.flags.dae.specialDuration instanceof Array))
            foundry.utils.setProperty(data.effect.flags, "dae.specialDuration", []);
        data.sourceName = await this.object.sourceName;
        data.fieldsList = this.fieldsList;
        data.midiActive = globalThis.MidiQOL !== undefined;
        //@ts-expect-error
        data.useIcon = game.release.generation < 12;
        return data;
    }
    _keySelected(event) {
        const target = event.target;
        if (target.selectedIndex === 0)
            return; // Account for dummy element 0
        $(target.parentElement.parentElement.parentElement.children[0]).find(".awesomplete").val(target.value);
        return this.submit({ preventClose: true })?.then(() => this.render());
    }
    /* ----------------------------------------- */
    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".keylist").change(this._keySelected.bind(this));
        html.find(".awesomplete").on("awesomplete-selectcomplete", this._textSelected.bind(this));
    }
    /* ----------------------------------------- */
    _textSelected(event) {
        //@ts-expect-error
        return this.submit({ preventClose: true }).then(() => this.render());
    }
    _onDragStart(ev) { }
    async _onDrop(ev) {
        ev.preventDefault();
        //@ts-expect-error getDragEventData
        const data = TextEditor.getDragEventData(ev);
        const item = await fromUuid(data.uuid);
        const targetValue = ev.target.value?.split(",")[1];
        if (data.uuid)
            ev.target.value = data.uuid + (targetValue ? `, ${targetValue}` : "");
    }
    /* ----------------------------------------- */
    _onEffectControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        switch (button.dataset.action) {
            case "add":
                return this._addEffectChange();
            case "delete":
                return confirmAction(confirmDelete, () => {
                    button.closest(".effect-change").remove();
                    //@ts-expect-error
                    this.submit({ preventClose: true }).then(() => this.render());
                });
            case "add-specDur":
                this._addSpecDuration();
                //@ts-expect-error
                return this.submit({ preventClose: true }).then(() => this.render());
            case "delete-specDur":
                return confirmAction(confirmDelete, () => {
                    button.closest(".effect-special-duration").remove();
                    //@ts-expect-error
                    this.submit({ preventClose: true }).then(() => this.render());
                });
        }
    }
    _addSpecDuration() {
        const idx = this.object.flags?.dae.specialDuration?.length ?? 0;
        if (idx === 0)
            foundry.utils.setProperty(this.object, "flags.dae.specialDuration", []);
        return this.submit({
            preventClose: true, updateData: {
                [`flags.dae.specialDuration.${idx}`]: ""
            }
        });
    }
    /* ----------------------------------------- */
    async _addEffectChange() {
        //@ts-expect-error .document
        const idx = (this.document ?? this.object).changes.length;
        return (this.submit({
            preventClose: true, updateData: {
                [`changes.${idx}`]: { key: "", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "" }
            }
        })) ?? this;
    }
    _getSubmitData(updateData = {}) {
        const data = super._getSubmitData(updateData);
        for (let change of data.changes) {
            if (typeof change.priority === "string")
                change.priority = Number(change.priority);
            if (change.priority === undefined || isNaN(change.priority))
                change.priority = change.mode ? change.mode * 10 : 0;
        }
        if (!data.tint || data.tint === "")
            data.tint = null;
        // fixed for very old items
        if (this.object.origin?.includes("OwnedItem."))
            data.origin = this.object.origin.replace("OwnedItem.", "Item.");
        if (data.transfer)
            data.origin = this.object.parent?.uuid;
        else
            delete data.origin;
        foundry.utils.setProperty(data, "flags.dae.specialDuration", Array.from(Object.values(data.flags?.dae?.specialDuration ?? {})));
        return data;
    }
    /* ----------------------------------------- */
    /** @override */
    async _updateObject(event, formData) {
        if (formData.duration) {
            //@ts-expect-error isNumeric
            if (Number.isNumeric(formData.duration?.startTime) && Math.abs(Number(formData.duration.startTime) < 3600)) {
                let startTime = parseInt(formData.duration.startTime);
                if (Math.abs(startTime) <= 3600) { // Only acdept durations of 1 hour or less as the start time field
                    formData.duration.startTime = game.time.worldTime + parseInt(formData.duration.startTime);
                }
            }
            else if (this.object.parent.isOwned)
                formData.duration.startTime = null;
        }
        await this.object.update(formData);
    }
}
export function geti18nTranslations() {
    let translations = game.i18n.translations["dae"];
    //@ts-expect-error _fallback not accessible
    if (!translations)
        translations = game.i18n._fallback["dae"];
    return translations ?? {};
}
Hooks.once("setup", () => {
    DocumentSheetConfig.registerSheet(CONFIG.ActiveEffect.documentClass, "core", DAEActiveEffectConfig, {
        label: i18n("dae.EffectSheetLabel"),
        makeDefault: true,
        //@ts-expect-error canBeDefault missing
        canBeDefault: true,
        canConfigure: true
    });
});