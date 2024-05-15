import { applyDaeEffects, daeSystemClass } from "../dae.js";
import { DAESystemDND5E } from "./DAEdnd5e.js";
import { ValidSpec, wildcardEffects } from "./DAESystem.js";
//@ts-ignore
const CONFIG = globalThis.CONFIG;
const SW5ESystemFlags = [
    "flags.sw5e.advantage.all",
    "flags.sw5e.advantage.attack.all",
    "flags.sw5e.advantage.attack.mwak",
    "flags.sw5e.advantage.attack.rwak",
    "flags.sw5e.advantage.attack.mpak",
    "flags.sw5e.advantage.attack.rpak",
    "flags.sw5e.advantage.attack.str",
    "flags.sw5e.advantage.attack.dex",
    "flags.sw5e.advantage.attack.con",
    "flags.sw5e.advantage.attack.int",
    "flags.sw5e.advantage.attack.wis",
    "flags.sw5e.advantage.attack.cha",
    "flags.sw5e.advantage.attack.hon",
    "flags.sw5e.advantage.attack.san",
    "flags.sw5e.grants.advantage.attack.all",
    "flags.sw5e.grants.advantage.attack.mwak",
    "flags.sw5e.grants.advantage.attack.rwak",
    "flags.sw5e.grants.advantage.attack.mpak",
    "flags.sw5e.grants.advantage.attack.rpak",
    "flags.sw5e.advantage.ability.all",
    "flags.sw5e.advantage.ability.check.all",
    "flags.sw5e.advantage.ability.check.str",
    "flags.sw5e.advantage.ability.check.dex",
    "flags.sw5e.advantage.ability.check.con",
    "flags.sw5e.advantage.ability.check.int",
    "flags.sw5e.advantage.ability.check.wis",
    "flags.sw5e.advantage.ability.check.cha",
    "flags.sw5e.advantage.ability.check.hon",
    "flags.sw5e.advantage.ability.check.san",
    "flags.sw5e.advantage.skill.all",
    "flags.sw5e.advantage.skill.acr",
    "flags.sw5e.advantage.skill.ani",
    "flags.sw5e.advantage.skill.ath",
    "flags.sw5e.advantage.skill.dec",
    "flags.sw5e.advantage.skill.ins",
    "flags.sw5e.advantage.skill.itm",
    "flags.sw5e.advantage.skill.inv",
    "flags.sw5e.advantage.skill.lor",
    "flags.sw5e.advantage.skill.med",
    "flags.sw5e.advantage.skill.nat",
    "flags.sw5e.advantage.skill.prc",
    "flags.sw5e.advantage.skill.prf",
    "flags.sw5e.advantage.skill.per",
    "flags.sw5e.advantage.skill.pil",
    "flags.sw5e.advantage.skill.slt",
    "flags.sw5e.advantage.skill.ste",
    "flags.sw5e.advantage.skill.sur",
    "flags.sw5e.advantage.skill.tec",
    "flags.sw5e.advantage.ability.save.all",
    "flags.sw5e.advantage.ability.save.str",
    "flags.sw5e.advantage.ability.save.dex",
    "flags.sw5e.advantage.ability.save.con",
    "flags.sw5e.advantage.ability.save.int",
    "flags.sw5e.advantage.ability.save.wis",
    "flags.sw5e.advantage.ability.save.cha",
    "flags.sw5e.advantage.ability.save.hon",
    "flags.sw5e.advantage.ability.save.san",
    "flags.sw5e.advantage.deathSave",
    "flags.sw5e.disadvantage.all",
    "flags.sw5e.disadvantage.attack.all",
    "flags.sw5e.disadvantage.attack.mwak",
    "flags.sw5e.disadvantage.attack.rwak",
    "flags.sw5e.disadvantage.attack.mpak",
    "flags.sw5e.disadvantage.attack.rpak",
    "flags.sw5e.disadvantage.attack.str",
    "flags.sw5e.disadvantage.attack.dex",
    "flags.sw5e.disadvantage.attack.con",
    "flags.sw5e.disadvantage.attack.int",
    "flags.sw5e.disadvantage.attack.wis",
    "flags.sw5e.disadvantage.attack.cha",
    "flags.sw5e.disadvantage.attack.hon",
    "flags.sw5e.disadvantage.attack.san",
    "flags.sw5e.disadvantage.ability.all",
    "flags.sw5e.disadvantage.ability.check.all",
    "flags.sw5e.disadvantage.ability.check.str",
    "flags.sw5e.disadvantage.ability.check.dex",
    "flags.sw5e.disadvantage.ability.check.con",
    "flags.sw5e.disadvantage.ability.check.int",
    "flags.sw5e.disadvantage.ability.check.wis",
    "flags.sw5e.disadvantage.ability.check.cha",
    "flags.sw5e.disadvantage.ability.check.hon",
    "flags.sw5e.disadvantage.ability.check.san",
    "flags.sw5e.disadvantage.skill.all",
    "flags.sw5e.disadvantage.skill.acr",
    "flags.sw5e.disadvantage.skill.ani",
    "flags.sw5e.disadvantage.skill.ath",
    "flags.sw5e.disadvantage.skill.dec",
    "flags.sw5e.disadvantage.skill.ins",
    "flags.sw5e.disadvantage.skill.itm",
    "flags.sw5e.disadvantage.skill.inv",
    "flags.sw5e.disadvantage.skill.lor",
    "flags.sw5e.disadvantage.skill.med",
    "flags.sw5e.disadvantage.skill.nat",
    "flags.sw5e.disadvantage.skill.prc",
    "flags.sw5e.disadvantage.skill.prf",
    "flags.sw5e.disadvantage.skill.per",
    "flags.sw5e.disadvantage.skill.pil",
    "flags.sw5e.disadvantage.skill.slt",
    "flags.sw5e.disadvantage.skill.ste",
    "flags.sw5e.disadvantage.skill.sur",
    "flags.sw5e.disadvantage.skill.tec",
    "flags.sw5e.disadvantage.ability.save.all",
    "flags.sw5e.disadvantage.ability.save.str",
    "flags.sw5e.disadvantage.ability.save.dex",
    "flags.sw5e.disadvantage.ability.save.con",
    "flags.sw5e.disadvantage.ability.save.int",
    "flags.sw5e.disadvantage.ability.save.wis",
    "flags.sw5e.disadvantage.ability.save.cha",
    "flags.sw5e.disadvantage.ability.save.hon",
    "flags.sw5e.disadvantage.ability.save.san",
    "flags.sw5e.disadvantage.deathSave",
    "flags.sw5e.advantage.tool.all",
    "flags.sw5e.advantage.tool.artisan",
    "flags.sw5e.advantage.tool.specialist",
    "flags.sw5e.advantage.tool.game",
    "flags.sw5e.advantage.tool.music",
    "flags.sw5e.advantage.ability.save.tech.all",
    "flags.sw5e.advantage.ability.save.tech.str",
    "flags.sw5e.advantage.ability.save.tech.dex",
    "flags.sw5e.advantage.ability.save.tech.con",
    "flags.sw5e.advantage.ability.save.tech.int",
    "flags.sw5e.advantage.ability.save.tech.wis",
    "flags.sw5e.advantage.ability.save.tech.cha",
    "flags.sw5e.advantage.ability.save.tech.hon",
    "flags.sw5e.advantage.ability.save.tech.san",
    "flags.sw5e.advantage.ability.save.force.all",
    "flags.sw5e.advantage.ability.save.force.str",
    "flags.sw5e.advantage.ability.save.force.dex",
    "flags.sw5e.advantage.ability.save.force.con",
    "flags.sw5e.advantage.ability.save.force.int",
    "flags.sw5e.advantage.ability.save.force.wis",
    "flags.sw5e.advantage.ability.save.force.cha",
    "flags.sw5e.advantage.ability.save.force.hon",
    "flags.sw5e.advantage.ability.save.force.san",
    "flags.sw5e.disadvantage.tool.all",
    "flags.sw5e.disadvantage.tool.artisan",
    "flags.sw5e.disadvantage.tool.specialist",
    "flags.sw5e.disadvantage.tool.game",
    "flags.sw5e.disadvantage.tool.music",
    "flags.sw5e.disadvantage.ability.save.tech.all",
    "flags.sw5e.disadvantage.ability.save.tech.str",
    "flags.sw5e.disadvantage.ability.save.tech.dex",
    "flags.sw5e.disadvantage.ability.save.tech.con",
    "flags.sw5e.disadvantage.ability.save.tech.int",
    "flags.sw5e.disadvantage.ability.save.tech.wis",
    "flags.sw5e.disadvantage.ability.save.tech.cha",
    "flags.sw5e.disadvantage.ability.save.tech.hon",
    "flags.sw5e.disadvantage.ability.save.tech.san",
    "flags.sw5e.disadvantage.ability.save.force.all",
    "flags.sw5e.disadvantage.ability.save.force.str",
    "flags.sw5e.disadvantage.ability.save.force.dex",
    "flags.sw5e.disadvantage.ability.save.force.con",
    "flags.sw5e.disadvantage.ability.save.force.int",
    "flags.sw5e.disadvantage.ability.save.force.wis",
    "flags.sw5e.disadvantage.ability.save.force.cha",
    "flags.sw5e.disadvantage.ability.save.force.hon",
    "flags.sw5e.disadvantage.ability.save.force.san",
];
export class DAESystemSW5E extends DAESystemDND5E {
    static get systemConfig() {
        return CONFIG.SW5E;
    }
    static modifyBaseValues(actorType, baseValues, characterSpec) {
        super.modifyBaseValues(actorType, baseValues, characterSpec);
        let charFlagKeys = Object.keys(CONFIG.SW5E.characterFlags);
        charFlagKeys.forEach(key => {
            let theKey = `flags.sw5e.${key}`;
            if ([`flags.sw5e.weaponCriticalThreshold`,
                `flags.sw5e.powerCriticalThreshold`,
                `flags.sw5e.meleeCriticalDamageDice`,
                `flags.dnd5e.spellCriticalThreshold`].includes(theKey)) {
                delete baseValues[theKey];
            }
        });
    }
    static modifySpecials(actorType, specials, characterSpec) {
        super.modifySpecials(actorType, specials, characterSpec);
        //@ts-ignore
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        specials["system.traits.sdi.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdi.value"] = ["", -1];
        specials["system.traits.sdi.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdr.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdr.value"] = ["", -1];
        specials["system.traits.sdr.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdv.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdv.value"] = ["", -1];
        specials["system.traits.sdv.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceLightDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceDarkDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceUnivDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerTechDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        for (let flag of SW5ESystemFlags) {
            specials[flag] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        }
        // move all the characteer flags to specials so that the can be custom effects only
        let charFlagKeys = Object.keys(CONFIG.SW5E.characterFlags);
        charFlagKeys.forEach(key => {
            let theKey = `flags.sw5e.${key}`;
            if ([`flags.sw5e.weaponCriticalThreshold`,
                `flags.sw5e.powerCriticalThreshold`,
                `flags.sw5e.meleeCriticalDamageDice`,
                `flags.sw5e.spellCriticalThreshold`].includes(theKey)) {
                specials[theKey] = [0, -1];
            }
        });
    }
    static async editConfig() {
        if (game.system.id === "sw5e") {
            try {
                const armorPack = game.packs.get("sw5e.armor");
                let pack;
                const profs = [
                    { type: "tool", list: this.toolProfList },
                    { type: "armor", list: this.armorProfList },
                    { type: "weapon", list: this.weaponProfList }
                ];
                for (let { type, list } of profs) {
                    let choices = CONFIG.SW5E[`${type}Proficiencies`];
                    const ids = CONFIG.SW5E[`${type}Ids`];
                    if (ids !== undefined) {
                        const typeProperty = (type !== "armor") ? `${type}Type` : `armor.type`;
                        for (const [key, id] of Object.entries(ids)) {
                            const item = await fromUuid(`Compendium.${id}`);
                            list[key] = item?.name;
                        }
                    }
                }
                this.profInit = true;
            }
            catch (err) {
                console.error(err);
                this.profInit = false;
            }
        }
    }
    static configureLists(daeConfig) {
        daeSystemClass.traitList = foundry.utils.duplicate(CONFIG.SW5E.damageResistanceTypes);
        Object.keys(CONFIG.SW5E.damageResistanceTypes).forEach(type => {
            daeSystemClass.traitList[`-${type}`] = `-${CONFIG.SW5E.damageResistanceTypes[type]}`;
        });
        daeSystemClass.languageList = foundry.utils.duplicate(CONFIG.SW5E.languages);
        Object.keys(CONFIG.SW5E.languages).forEach(type => {
            daeSystemClass.languageList[`-${type}`] = `-${CONFIG.SW5E.languages[type]}`;
        });
        daeSystemClass.conditionList = foundry.utils.duplicate(CONFIG.SW5E.conditionTypes);
        Object.keys(CONFIG.SW5E.conditionTypes).forEach(type => {
            daeSystemClass.conditionList[`-${type}`] = `-${CONFIG.SW5E.conditionTypes[type]}`;
        });
        if (daeSystemClass.profInit) {
            daeSystemClass.toolProfList = daeSystemClass.toolProfList;
            daeSystemClass.armorProfList = daeSystemClass.armorProfList;
            daeSystemClass.weaponProfList = daeSystemClass.weaponProfList;
        }
        else {
            daeSystemClass.toolProfList = foundry.utils.duplicate(CONFIG.SW5E.toolProficiencies);
            Object.keys(CONFIG.SW5E.toolProficiencies).forEach(type => {
                daeSystemClass.toolProfList[`-${type}`] = `-${CONFIG.SW5E.toolProficiencies[type]}`;
            });
            daeSystemClass.armorProfList = foundry.utils.duplicate(CONFIG.SW5E.armorProficiencies);
            Object.keys(CONFIG.SW5E.armorProficiencies).forEach(type => {
                daeSystemClass.armorProfList[`-${type}`] = `-${CONFIG.SW5E.armorProficiencies[type]}`;
            });
            daeSystemClass.weaponProfList = foundry.utils.duplicate(CONFIG.SW5E.weaponProficiencies);
            Object.keys(CONFIG.SW5E.weaponProficiencies).forEach(type => {
                daeSystemClass.weaponProfList[`-${type}`] = `-${CONFIG.SW5E.weaponProficiencies[type]}`;
            });
        }
    }
    static get applyBaseEffectsFunc() {
        return applyBaseActiveEffectssw5e;
    }
    static getOptionsForSpec(spec) {
        if (!spec.key)
            return undefined;
        if (spec.key.includes("system.skills") && spec.key.includes("value"))
            return { 0: "Not Proficient", 0.5: "Trained", 1: "Proficient", 2: "Expertise", 3: "Master", 4: "High Master", 5: "Grand Master" };
        if (spec.key.includes("system.skills") && spec.key.includes("ability"))
            return CONFIG.SW5E.abilities;
        return super.getOptionsForSpec(spec);
    }
    static initSystemData() {
        super.initSystemData();
        daeSystemClass.daeActionTypeKeys = daeSystemClass.daeActionTypeKeys.concat(Object.keys(CONFIG.SW5E.itemActionTypes));
        daeSystemClass.spellAttacks = daeSystemClass.spellAttacks.concat(["mpak", "rpak"]);
        for (let flag of SW5ESystemFlags) {
            const midiFlag = flag.replace("flags.sw5e", "flags.midi-qol");
            daeSystemClass.bonusSelectors[flag] = { replaceList: [flag, midiFlag] };
        }
    }
    static initActions() {
        super.initActions();
    }
}
// this function replaces applyActiveEffects in Actor
function applyBaseActiveEffectssw5e() {
    if (this._prepareScaleValues)
        this._prepareScaleValues();
    if (this.system?.prepareEmbeddedData instanceof Function)
        this.system.prepareEmbeddedData();
    // The Active Effects do not have access to their parent at preparation time, so we wait until this stage to
    // determine whether they are suppressed or not.
    this.effects.forEach(e => e.determineSuppression());
    applyDaeEffects.bind(this)({ specList: ValidSpec.specs[this.type].baseSpecsObj, completedSpecs: {}, allowAllSpes: false, wildCardsInclude: wildcardEffects, wildCardsExclude: [], doStatusEffects: true });
}
if (!globalThis.daeSystems)
    globalThis.daeSystems = {};
foundry.utils.setProperty(globalThis.daeSystems, "sw5e", DAESystemSW5E);