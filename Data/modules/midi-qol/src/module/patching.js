import { log, debug, i18n, error, i18nFormat, warn, debugEnabled, GameSystemConfig } from "../midi-qol.js";
import { doAttackRoll, doDamageRoll, templateTokens, doItemUse, wrappedDisplayCard } from "./itemhandling.js";
import { configSettings, autoFastForwardAbilityRolls, checkRule, checkMechanic, safeGetGameSetting } from "./settings.js";
import { bonusDialog, checkDefeated, checkIncapacitated, ConvenientEffectsHasEffect, createConditionData, displayDSNForRoll, expireRollEffect, getAutoTarget, getConcentrationEffect, getConcentrationEffectsRemaining, getCriticalDamage, getDeadStatus, getOptionalCountRemainingShortFlag, getTokenForActor, getSpeaker, getUnconsciousStatus, getWoundedStatus, hasAutoPlaceTemplate, hasUsedAction, hasUsedBonusAction, hasUsedReaction, mergeKeyboardOptions, midiRenderRoll, MQfromUuid, notificationNotify, processOverTime, removeActionUsed, removeBonusActionUsed, removeReactionUsed, tokenForActor, expireEffects, DSNMarkDiceDisplayed, evalAllConditions, setRollMinDiceTerm, setRollMaxDiceTerm, evalAllConditionsAsync } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
import { untimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
let libWrapper;
var d20Roll;
function _isVisionSource(wrapped) {
	const isVisionSource = wrapped();
	if (this.document.hidden && !game.user?.isGM && this.actor?.testUserPermission(game.user, "OWNER")) {
		return true;
	}
	return isVisionSource;
}
function isVisible(wrapped) {
	const isVisible = wrapped();
	//@ts-ignore
	if (!game.user.isGM && this.actor?.testUserPermission(game.user, "OWNER")) {
		return true;
	}
	return isVisible;
}
;
export const defaultRollOptions = {
	event: undefined,
	advantage: false,
	disadvantage: false,
	fastForward: false,
	fastForwardSet: false,
	parts: undefined,
	chatMessage: undefined,
	rollToggle: undefined,
	other: undefined,
	versatile: false,
	critical: false,
	autoRollAttack: false,
	autoRollDamage: false,
	fastForwardAttack: false,
	fastForwardDamage: false,
	fastForwardAbility: false
};
export function collectBonusFlags(actor, category, detail) {
	if (!installedModules.get("betterrolls5e")) {
		let useDetail = false;
		const bonusFlags = Object.keys(actor.flags["midi-qol"]?.optional ?? [])
			.filter(flag => {
			const checkFlag = actor.flags["midi-qol"].optional[flag][category];
			if (checkFlag === undefined)
				return false;
			if (detail.startsWith("fail")) {
				const [_, type] = detail.split(".");
				return checkFlag.fail && checkFlag.fail[type] ? getOptionalCountRemainingShortFlag(actor, flag) > 0 : false;
			}
			else if (!(typeof checkFlag === "string" || checkFlag[detail] || checkFlag["all"] !== undefined))
				return false;
			if (actor.flags["midi-qol"].optional[flag].count === undefined)
				return true;
			return getOptionalCountRemainingShortFlag(actor, flag) > 0;
		})
			.map(flag => {
			const checkFlag = actor.flags["midi-qol"].optional[flag][category];
			if (typeof checkFlag === "string")
				return `flags.midi-qol.optional.${flag}`;
			else
				return `flags.midi-qol.optional.${flag}`;
		});
		return bonusFlags;
	}
	return [];
}
export async function bonusCheck(actor, result, category, detail, messageData = {}) {
	let bonusFlags = collectBonusFlags(actor, category, detail);
	if (bonusFlags.length > 0) {
		const data = {
			actor,
			roll: result,
			rollHTML: await midiRenderRoll(result),
			rollTotal: result.total,
			category,
			detail: detail,
			messageData
		};
		let title;
		let systemString = game.system.id.toUpperCase();
		if (GameSystemConfig.abilities[detail]?.label || GameSystemConfig.skills[detail]?.label) {
			if (detail.startsWith("fail"))
				title = "Failed Save Check";
			else if (category.startsWith("check"))
				title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: GameSystemConfig.abilities[detail].label ?? "" });
			else if (category.startsWith("save"))
				title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: GameSystemConfig.abilities[detail].label ?? "" });
			else if (category.startsWith("skill"))
				title = i18nFormat(`${systemString}.SkillPromptTitle`, { skill: GameSystemConfig.skills[detail].label ?? "" });
		}
		else {
			if (detail.startsWith("fail"))
				title = "Failed Save Check";
			else if (category.startsWith("check"))
				title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: GameSystemConfig.abilities[detail] ?? "" });
			else if (category.startsWith("save"))
				title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: GameSystemConfig.abilities[detail] ?? "" });
			else if (category.startsWith("skill"))
				title = i18nFormat(`${systemString}.SkillPromptTitle`, { skill: GameSystemConfig.skills[detail] ?? "" });
		}
		const newRoll = await bonusDialog.bind(data)(bonusFlags, detail ? `${category}.${detail}` : category, checkMechanic("displayBonusRolls"), `${actor.name} - ${title}`, data.roll, "roll", { messageData });
		result = newRoll;
	}
	return result;
}
async function doRollSkill(wrapped, ...args) {
	try {
		let [skillId, options = { event: {}, parts: [], advantage: false, disadvantage: false, simulate: false, targetValue: undefined }] = args;
		const chatMessage = options.chatMessage;
		const rollTarget = options.targetValue;
		let overtimeActorUuid;
		if (options.event) {
			const target = options.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
			if (target?.dataset?.midiOvertimeActorUuid)
				overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
			if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
				//@ts-expect-error
				const actualActor = fromUuidSync(overtimeActorUuid);
				if (actualActor)
					return actualActor.rollSkill(...args);
			}
		}
		const keyOptions = mapSpeedKeys(undefined, "ability");
		options.advantage || (options.advantage = options.event?.advantage);
		options.disadvantage || (options.disadvantage = options.event?.disadvantage);
		if (options.mapKeys !== false) {
			if (keyOptions?.advantage === true)
				options.advantage = true;
			if (keyOptions?.disadvantage === true)
				options.disadvantage = true;
			if (keyOptions?.fastForwardAbility === true)
				options.fastForward = true;
			if (keyOptions?.advantage || keyOptions?.disadvantage)
				options.fastForward = true;
		}
		// mergeKeyboardOptions(options, mapSpeedKeys(undefined, "ability"));
		options.event = {};
		let procOptions = options;
		if (configSettings.skillAbilityCheckAdvantage) {
			procOptions = await procAbilityAdvantage(this, "check", this.system.skills[skillId].ability, options);
		}
		procOptions = await procAdvantageSkill(this, skillId, procOptions);
		if (procOptions.advantage && procOptions.disadvantage) {
			procOptions.advantage = false;
			procOptions.disadvantage = false;
		}
		if (procAutoFailSkill(this, skillId)
			|| (configSettings.skillAbilityCheckAdvantage && procAutoFail(this, "check", this.system.skills[skillId].ability))) {
			options.parts = ["-100"];
		}
		let result;
		procOptions.chatMessage = false;
		if (!procOptions.parts || procOptions.parts.length === 0)
			delete procOptions.parts;
		delete procOptions.event;
		// result = await wrapped.call(this, skillId, procOptions);
		let messageData;
		Hooks.once(`${game.system.id}.preRollSkill`, (actor, rollData, skillId) => {
			messageData = rollData.messageData;
			if (overtimeActorUuid)
				messageData["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;
		});
		result = await wrapped(skillId, procOptions);
		if (!result)
			return result;
		let rollMode = result.options?.rollMode ?? game.settings.get("core", "rollMode");
		const saveRollMode = game.settings.get("core", "rollMode");
		const blindSkillRoll = configSettings.rollSkillsBlind.includes("all") || configSettings.rollSkillsBlind.includes(skillId);
		if (!game.user?.isGM && blindSkillRoll && ["publicroll", "roll", "gmroll"].includes(rollMode)) {
			rollMode = "blindroll";
			game.settings.set("core", "rollMode", "blindroll");
		}
		const flavor = result.options?.flavor;
		const maxflags = foundry.utils.getProperty(this, "flags.midi-qol.max") ?? {};
		const maxValue = (maxflags.skill && (maxflags.skill.all || maxflags.check[skillId])) ?? false;
		if (maxValue && Number.isNumeric(maxValue)) {
			result = setRollMaxDiceTerm(result, Number(maxValue));
		}
		const minflags = foundry.utils.getProperty(this, "flags.midi-qol.min") ?? {};
		const minValue = (minflags.skill && (minflags.skill.all || minflags.skill[skillId])) ?? false;
		if (minValue && Number.isNumeric(minValue)) {
			result = setRollMinDiceTerm(result, Number(minValue));
		}
		if (rollMode !== "blindroll")
			rollMode = result.options.rollMode;
		await displayDSNForRoll(result, "skill", rollMode);
		if (!options.simulate) {
			result = await bonusCheck(this, result, "skill", skillId, messageData);
			DSNMarkDiceDisplayed(result);
		}
		let success = undefined;
		if (rollTarget !== undefined) {
			success = result.total >= rollTarget;
			result.options.success = success;
		}
		if (chatMessage !== false && result) {
			await displayDSNForRoll(result, "skill", rollMode);
			if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true)
				await result.toMessage(messageData, { rollMode });
		}
		game.settings.set("core", "rollMode", saveRollMode);
		await expireRollEffect.bind(this)("Skill", skillId, success);
		return result;
	}
	catch (err) {
		const message = `doRollSkill error ${this.name}, ${this.uuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
function multiply(modifier) {
	const rgx = /mx([0-9])+/;
	const match = modifier.match(rgx);
	if (!match)
		return false;
	let [mult] = match.slice(1);
	const multiplier = parseInt(mult);
	for (let r of this.results) {
		r.count = multiplier * r.result;
		r.rerolled = true;
	}
	return true;
}
export function addDiceTermModifiers() {
	Die.MODIFIERS["mx"] = "multiply";
	foundry.utils.setProperty(Die.prototype, "multiply", multiply);
}
export function averageDice(roll) {
	roll.terms = roll.terms.map(term => {
		if (term instanceof DiceTerm) {
			const mult = term.modifiers.includes("mx2") ? 2 : 1;
			const newTerm = new NumericTerm({ number: Math.floor(term.number * mult * (term.faces + 1) / 2) });
			newTerm.options = term.options;
			return newTerm;
		}
		return term;
	});
	//@ts-expect-error _formula is private
	roll._formula = roll.constructor.getFormula(roll.terms);
	return roll;
}
function configureDamage(wrapped) {
	let useDefaultCritical = getCriticalDamage() === "default";
	useDefaultCritical || (useDefaultCritical = getCriticalDamage() === "explodeCharacter" && this.data.actorType !== "character");
	useDefaultCritical || (useDefaultCritical = getCriticalDamage() === "explodeNPC" && this.data.actorType !== "npc");
	if (!this.isCritical || useDefaultCritical) {
		while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
			this.terms.pop();
		wrapped();
		if (this.data.actorType === "npc" && configSettings.averageNPCDamage)
			averageDice(this);
		return;
	}
	// if (this.options.configured) return; seems this is not required.
	let bonusTerms = [];
	/* criticalDamage is one of
	"default": "DND5e Settings Only",
	"maxDamage": "Max Normal Damage",
	"maxCrit": "Max Critical Dice (flat number)",
	"maxCritRoll": "Max Critical Dice (roll dice)",
	"maxAll": "Max All Dice",
	"doubleDice": "Double Rolled Damage",
	"explode": "Explode all critical dice",
	"explodePlayer": "Explode Player critical dice",
	"explodeGM": "Explode GM crtical dice",
	"baseDamage": "Only Weapon Extra Critical",
	"maxBaseRollCrit": "Max base damage and roll critical dice"
	},
*/
	// if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;
	for (let [i, term] of this.terms.entries()) {
		let cm = this.options.criticalMultiplier ?? 2;
		let cb = (this.options.criticalBonusDice && (i === 0)) ? this.options.criticalBonusDice : 0;
		switch (getCriticalDamage()) {
			case "maxDamage":
				if (term instanceof DiceTerm)
					term.modifiers.push(`min${term.faces}`);
				break;
			case "maxDamageExplode":
				if (term instanceof DiceTerm)
					term.modifiers.push(`min${term.faces}`);
				if (term instanceof DiceTerm) {
					bonusTerms.push(new OperatorTerm({ operator: "+" }));
					//@ts-ignore
					const newTerm = new Die({ number: term.number + cb, faces: term.faces });
					newTerm.modifiers.push(`x${term.faces}`);
					newTerm.options = term.options;
					// foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
					bonusTerms.push(newTerm);
				}
				break;
			case "maxCrit": // Powerful critical
			case "maxCritRoll":
				if (term instanceof DiceTerm) {
					let critTerm;
					bonusTerms.push(new OperatorTerm({ operator: "+" }));
					if (getCriticalDamage() === "maxCrit")
						critTerm = new NumericTerm({ number: (term.number + cb) * term.faces });
					else {
						critTerm = new Die({ number: term.number + cb, faces: term.faces });
						critTerm.modifiers = foundry.utils.duplicate(term.modifiers);
						critTerm.modifiers.push(`min${term.faces}`);
					}
					critTerm.options = term.options;
					bonusTerms.push(critTerm);
				}
				else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
					term.number *= cm;
				}
				break;
			case "maxAll":
				if (term instanceof DiceTerm) {
					term.alter(cm, cb);
					term.modifiers.push(`min${term.faces}`);
				}
				else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
					term.number *= cm;
				}
				break;
			case "doubleDice":
				if (term instanceof DiceTerm) {
					//term.alter(cm, cb);
					term.modifiers.push("mx2");
				}
				else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
					term.number *= cm;
				}
				break;
			case "explode":
			case "explodeCharacter":
			case "explodeNPC":
				if (term instanceof DiceTerm) {
					bonusTerms.push(new OperatorTerm({ operator: "+" }));
					//@ts-ignore
					const newTerm = new Die({ number: term.number + cb, faces: term.faces });
					newTerm.modifiers.push(`x${term.faces}`);
					newTerm.options = term.options;
					// foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
					bonusTerms.push(newTerm);
				}
				break;
			case "maxBaseRollCrit":
				if (term instanceof DiceTerm)
					term.modifiers.push(`min${term.faces}`);
				if (term instanceof DiceTerm) {
					bonusTerms.push(new OperatorTerm({ operator: "+" }));
					//@ts-ignore
					const newTerm = new Die({ number: term.number, faces: term.faces });
					newTerm.options = term.options;
					// foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
					bonusTerms.push(newTerm);
				}
				break;
			case "baseDamage":
			default:
				break;
		}
	}
	if (bonusTerms.length > 0)
		this.terms.push(...bonusTerms);
	if (this.options.criticalBonusDamage) {
		const extra = new Roll(this.options.criticalBonusDamage, this.data);
		for (let term of extra.terms) {
			if (term instanceof DiceTerm || term instanceof NumericTerm)
				if (!term.options?.flavor)
					term.options = this.terms[0].options;
		}
		if (!(extra.terms[0] instanceof OperatorTerm))
			this.terms.push(new OperatorTerm({ operator: "+" }));
		this.terms.push(...extra.terms);
	}
	while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
		this.terms.pop();
	this._formula = this.constructor.getFormula(this.terms);
	this.options.configured = true;
	if (this.data.actorType === "npc" && configSettings.averageNPCDamage)
		averageDice(this);
}
async function doAbilityRoll(wrapped, rollType, ...args) {
	let [abilityId, options = { event: {}, parts: [], chatMessage: undefined, simulate: false, targetValue: undefined, isMagicalSave: false, isConcentrationCheck: false }] = args;
	let overtimeActorUuid;
	if (options.event) {
		const target = options.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
		if (target?.dataset?.midiOvertimeActorUuid) {
			overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
			options.rollMode = target.dataset.midiRollMode ?? options.rollMode;
		}
		if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
			//@ts-expect-error
			const actualActor = fromUuidSync(overtimeActorUuid);
			if (actualActor && rollType === "save")
				return actualActor.rollAbilitySave(...args);
			else
				return actualActor.rollAbilityTest(...args);
		}
	}
	try {
		const rollTarget = options.targetValue;
		if (rollTarget !== undefined && !checkRule("criticalSaves")) { // We have a target value, which means we are checking for success and not criticals
			options.critical = 21;
			options.fumble = 0;
		}
		let success = undefined;
		if (procAutoFail(this, rollType, abilityId)) {
			options.parts = ["-100"];
			success = false;
		}
		if (options.fromMars5eChatCard) { // It seems mtb ignores the advantage/disadvantage flags sent in the request
			options.advantage = options.event?.altKey;
			options.disadvantage = options.event?.ctrlKey;
			if (!autoFastForwardAbilityRolls)
				options.fastForward = options.event?.shiftKey;
		}
		options.advantage || (options.advantage = options.event?.advantage);
		options.disadvantage || (options.disadvantage = options.event?.disadvantage);
		if (options.fromMars5eChatCard)
			options.fastForward || (options.fastForward = autoFastForwardAbilityRolls);
		const chatMessage = options.chatMessage;
		const keyOptions = mapSpeedKeys(undefined, "ability");
		if (options.mapKeys !== false) {
			if (keyOptions?.advantage === true)
				options.advantage = true;
			if (keyOptions?.disadvantage === true)
				options.disadvantage = true;
			if (keyOptions?.fastForwardAbility === true)
				options.fastForward = true;
			if (keyOptions?.advantage || keyOptions?.disadvantage)
				options.fastForward = true;
		}
		options.event = {};
		let procOptions = await procAbilityAdvantage(this, rollType, abilityId, options);
		if (procOptions.advantage && procOptions.disadvantage) {
			procOptions.advantage = false;
			procOptions.disadvantage = false;
		}
		let result;
		if (!options.parts || procOptions.parts.length === 0)
			delete options.parts;
		procOptions.chatMessage = false;
		delete procOptions.event;
		let messageData;
		const type = rollType === "save" ? "preRollAbilitySave" : "preRollAbilityTest";
		Hooks.once(`${game.system.id}.${type}`, (actor, rollData, skillId) => {
			messageData = rollData.messageData;
			if (overtimeActorUuid)
				messageData["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;
		});
		result = await wrapped(abilityId, procOptions);
		if (success === false) {
			result = new Roll("-1[auto fail]");
			// V12 - since the roll is -1 evaluateSync will work
			const evaluateSync = result.evaluateSync;
			if (evaluateSync)
				result = evaluateSync.bind(result)();
			else
				result = await result.evaluate();
		}
		if (!result)
			return result;
		const flavor = result.options?.flavor;
		let maxFlags = foundry.utils.getProperty(this, "flags.midi-qol.max.ability") ?? {};
		let maxValue = (maxFlags[rollType] && (maxFlags[rollType].all || maxFlags[rollType][abilityId])) ?? false;
		if (options.isConcentrationCheck)
			maxValue = maxFlags.save?.concentration ?? maxValue;
		if (maxValue && Number.isNumeric(maxValue)) {
			result = setRollMaxDiceTerm(result, Number(maxValue));
		}
		const minFlags = foundry.utils.getProperty(this, "flags.midi-qol.min.ability") ?? {};
		let minValue = (minFlags[rollType] && (minFlags[rollType].all || minFlags[rollType][abilityId])) ?? false;
		if (options.isConcentrationCheck)
			minValue = minFlags.save?.concentration ?? minValue;
		if (minValue && Number.isNumeric(minValue)) {
			result = setRollMinDiceTerm(result, Number(minValue));
		}
		let rollMode = options.rollMode ?? result.options.rollMode ?? game.settings.get("core", "rollMode");
		let blindCheckRoll;
		let blindSaveRoll;
		const saveRollMode = game.settings.get("core", "rollMode");
		if (!game.user?.isGM && ["publicroll", "roll", "gmroll"].includes(rollMode)) {
			switch (rollType) {
				case "check":
					blindCheckRoll = configSettings.rollChecksBlind.includes("all") || configSettings.rollChecksBlind.includes(abilityId);
					if (blindCheckRoll) {
						rollMode = "blindroll";
						game.settings.set("core", "rollMode", "blindroll");
					}
					break;
				case "save":
					blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes(abilityId);
					if (blindSaveRoll) {
						rollMode = "blindroll";
						game.settings.set("core", "rollMode", "blindroll");
						break;
					}
			}
		}
		if (rollMode !== "blindroll")
			rollMode = result.options.rollMode;
		await displayDSNForRoll(result, rollType, rollMode);
		foundry.utils.mergeObject(messageData, { "flags": options.flags ?? {} });
		foundry.utils.setProperty(messageData, "flags.midi-qol.lmrtfy.requestId", options.flags?.lmrtfy?.data?.requestId);
		if (!options.simulate) {
			result = await bonusCheck(this, result, rollType, abilityId, messageData);
			DSNMarkDiceDisplayed(result);
		}
		if (rollTarget !== undefined && success === undefined) {
			success = result.total >= rollTarget;
			result.options.success = success;
		}
		if (chatMessage !== false && result) {
			messageData.template = "modules/midi-qol/templates/roll-base.html";
			if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true)
				await result.toMessage(messageData, { rollMode });
		}
		game.settings.set("core", "rollMode", saveRollMode);
		await expireRollEffect.bind(this)(rollType, abilityId, success);
		return result;
	}
	catch (err) {
		const message = `doAbilityRoll error ${this.name} ${abilityId} ${rollType} ${this.uuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
export async function rollAbilitySave(wrapped, ...args) {
	return doAbilityRoll.bind(this)(wrapped, "save", ...args);
}
async function rollAbilityTest(wrapped, ...args) {
	return doAbilityRoll.bind(this)(wrapped, "check", ...args);
}
async function rollDeathSave(wrapped, options) {
	mergeKeyboardOptions(options ?? {}, mapSpeedKeys(undefined, "ability"));
	const advFlags = foundry.utils.getProperty(this, "flags.midi-qol")?.advantage;
	const disFlags = foundry.utils.getProperty(this, "flags.midi-qol")?.disadvantage;
	options.fastForward = autoFastForwardAbilityRolls ? !options.event?.fastKey : options.event?.fastKey;
	if (advFlags?.all || advFlags?.deathSave || disFlags?.all || disFlags?.deathSave) {
		const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
		if (await evalAllConditionsAsync(this, "flags.midi-qol.advantage.all", conditionData) ||
			await evalAllConditionsAsync(this, "flags.midi-qol.advantage.deathSave", conditionData)) {
			options.advantage = true;
		}
		if (await evalAllConditionsAsync(this, "flags.midi-qol.disadvantage.all", conditionData) ||
			await evalAllConditionsAsync(this, "flags.midi-qol.disadvantage.deathSave", conditionData)) {
			options.disadvantage = true;
		}
	}
	if (options.advantage && options.disadvantage) {
		options.advantage = options.disadvantage = false;
	}
	const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
	if (blindSaveRoll)
		options.rollMode = "blindroll";
	return wrapped(options);
}
export function preRollDeathSaveHook(actor, rollData) {
	mergeKeyboardOptions(rollData ?? {}, mapSpeedKeys(undefined, "ability"));
	const advFlags = foundry.utils.getProperty(actor, "flags.midi-qol")?.advantage;
	const disFlags = foundry.utils.getProperty(actor, "flags.midi-qol")?.disadvantage;
	let withAdvantage = rollData.advantage ?? false;
	let withDisadvantage = rollData.disadvantage ?? false;
	rollData.fastForward = autoFastForwardAbilityRolls ? !rollData.event?.fastKey : rollData.event?.fastKey;
	if (advFlags?.all || advFlags?.deathSave || disFlags?.all || disFlags?.deathSave) {
		const conditionData = createConditionData({ workflow: undefined, target: undefined, actor });
		if (evalAllConditions(actor, "flags.midi-qol.advantage.all", conditionData) ||
			evalAllConditions(actor, "flags.midi-qol.advantage.deathSave", conditionData)) {
			rollData.advantage = true;
		}
		if (evalAllConditions(actor, "flags.midi-qol.disadvantage.all", conditionData) ||
			evalAllConditions(actor, "flags.midi-qol.disadvantage.deathSave", conditionData)) {
			rollData.disadvantage = true;
		}
	}
	if (rollData.advantage && rollData.disadvantage) {
		rollData.advantage = rollData.disadvantage = false;
	}
	const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
	if (blindSaveRoll)
		rollData.rollMode = "blindroll";
	return true;
}
export function deathSaveHook(actor, result, details) {
	if (configSettings.addDead !== "none" && details.chatString === "DND5E.DeathSaveFailure") {
		setDeadStatus(actor, { effect: getDeadStatus(), useDefeated: true, makeDead: true });
		setDeadStatus(actor, { effect: getUnconsciousStatus(), useDefeated: false, makeDead: false });
	}
}
export function procAutoFail(actor, rollType, abilityId) {
	const midiFlags = actor.flags["midi-qol"] ?? {};
	const fail = midiFlags.fail ?? {};
	if (fail.ability || fail.all) {
		const rollFlags = (fail.ability && fail.ability[rollType]) ?? {};
		const autoFail = fail.all || fail.ability.all || rollFlags.all || rollFlags[abilityId];
		return autoFail;
	}
	return false;
}
export function procAutoFailSkill(actor, skillId) {
	const midiFlags = actor.flags["midi-qol"] ?? {};
	const fail = midiFlags.fail ?? {};
	if (fail.skill || fail.all) {
		const rollFlags = (fail.skill && fail.skill[skillId]) || false;
		const autoFail = fail.all || fail.skill.all || rollFlags;
		return autoFail;
	}
	return false;
}
export async function procAbilityAdvantage(actor, rollType, abilityId, options) {
	const midiFlags = actor.flags["midi-qol"] ?? {};
	const advantage = midiFlags.advantage;
	const disadvantage = midiFlags.disadvantage;
	var withAdvantage = options.advantage;
	var withDisadvantage = options.disadvantage;
	//options.fastForward = options.fastForward || (autoFastForwardAbilityRolls ? !options.event?.fastKey : options.event?.fastKey);
	if (rollType === "save" && options.isMagicSave) {
		if ((actor?.system.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant").trim()))
			withAdvantage = true;
		;
		const conditionData = createConditionData({ workflow: options.workflow, target: tokenForActor(actor), actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
		const magicResistanceFlags = foundry.utils.getProperty(actor, "flags.midi-qol.magicResistance");
		if (await evalAllConditionsAsync(actor, "flags.midi-qol.magicResistance.all", conditionData, false) ||
			await evalAllConditionsAsync(actor, `flags.midi-qol.magicResistance.${abilityId}`, conditionData, false)) {
			withAdvantage = true;
		}
		if (await evalAllConditionsAsync(actor, "flags.midi-qol.magicVulnerability.all", conditionData, false) ||
			await evalAllConditionsAsync(actor, `flags.midi-qol.magicVulnerability.${abilityId}`, conditionData, false)) {
			withDisadvantage = true;
		}
	}
	options.fastForward = options.fastForward || options.event?.fastKey;
	if (advantage || disadvantage) {
		const conditionData = createConditionData({ workflow: options.workflow, target: tokenForActor(actor), actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
		if (advantage) {
			if (await evalAllConditionsAsync(actor, "flags.midi-qol.advantage.all", conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.all`, conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.${rollType}.all`, conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.${rollType}.${abilityId}`, conditionData)) {
				withAdvantage = true;
			}
		}
		if (disadvantage) {
			if (await evalAllConditionsAsync(actor, "flags.midi-qol.disadvantage.all", conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.all`, conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.${rollType}.all`, conditionData)
				|| await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.${rollType}.${abilityId}`, conditionData)) {
				withDisadvantage = true;
			}
		}
	}
	options.advantage = withAdvantage ?? false;
	options.disadvantage = withDisadvantage ?? false;
	options.event = {};
	return options;
}
export async function procAdvantageSkill(actor, skillId, options) {
	const midiFlags = actor.flags["midi-qol"];
	const advantage = midiFlags?.advantage;
	const disadvantage = midiFlags?.disadvantage;
	var withAdvantage = options.advantage;
	var withDisadvantage = options.disadvantage;
	if (advantage || disadvantage) {
		const conditionData = createConditionData({ workflow: undefined, target: undefined, actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
		if (await evalAllConditionsAsync(actor, "flags.midi-qol.advantage.all", conditionData)
			|| await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.skill.all`, conditionData)
			|| await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.skill.${skillId}`, conditionData)) {
			withAdvantage = true;
		}
		if (await evalAllConditionsAsync(actor, "flags.midi-qol.disadvantage.all", conditionData)
			|| await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.skill.all`, conditionData)
			|| await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.skill.${skillId}`, conditionData)) {
			withDisadvantage = true;
		}
	}
	options.advantage = withAdvantage;
	options.disadvantage = withDisadvantage;
	return options;
}
let debouncedATRefresh = foundry.utils.debounce(_midiATIRefresh, 30);
function _midiATIRefresh(template) {
	// We don't have an item to check auto targeting with, so just use the midi setting
	if (!canvas?.tokens)
		return;
	let autoTarget = getAutoTarget(template.item);
	if (autoTarget === "none")
		return;
	if (autoTarget === "dftemplates" && installedModules.get("df-templates"))
		return; // df-templates will handle template targeting.
	if (installedModules.get("levelsvolumetrictemplates") && !["walledtemplates"].includes(autoTarget)) {
		//@ts-expect-error CONFIG.Levels
		const levelsTemplateData = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false);
		if (!template.document.elevation !== levelsTemplateData.elevation) {
			foundry.utils.setProperty(template.document, "flags.levels.elevation", levelsTemplateData.elevation);
		}
		// Filter which tokens to pass - not too far wall blocking is left to levels.
		let distance = template.distance;
		const dimensions = canvas?.dimensions || { size: 1, distance: 1 };
		distance *= dimensions.size / dimensions.distance;
		const tokensToCheck = canvas?.tokens?.placeables?.filter(tk => {
			const r = new Ray({ x: template.x, y: template.y }, 
			//@ts-ignore .width .height TODO check this v10
			{ x: tk.x + tk.document.width * dimensions.size, y: tk.y + tk.document.height * dimensions.size });
			//@ts-ignore .width .height TODO check this v10
			const maxExtension = (1 + Math.max(tk.document.width, tk.document.height)) * dimensions.size;
			const centerDist = r.distance;
			if (centerDist > distance + maxExtension)
				return false;
			if (["alwaysIgnoreIncapcitated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget) && checkIncapacitated(tk, debugEnabled > 0))
				return false;
			if (["alwaysIgnoreDefeated", "wallsBlockIgnoreDefeated"].includes(autoTarget) && checkDefeated(tk))
				return false;
			return true;
		});
		if (tokensToCheck.length > 0) {
			//@ts-expect-error compute3Dtemplate(t, tokensToCheck = canvas.tokens.placeables)
			VolumetricTemplates.compute3Dtemplate(template, tokensToCheck);
		}
	}
	else {
		const distance = template.distance ?? 0;
		if (template.item) {
			templateTokens(template, getTokenForActor(template.item.parent), !foundry.utils.getProperty(template.item, "flags.midi-qol.AoETargetTypeIncludeSelf"), foundry.utils.getProperty(template, "item.flags.midi-qol.AoETargetType"), autoTarget);
			return true;
		}
		else
			templateTokens(template);
		return true;
	}
	return true;
}
function midiATRefresh(wrapped) {
	debouncedATRefresh(this);
	return wrapped();
}
export function _prepareDerivedData(wrapped, ...args) {
	wrapped(...args);
	try {
		if (!this.system.abilities?.dex)
			return;
		if (![false, undefined, "none"].includes(checkRule("challengeModeArmor"))) {
			const armorDetails = this.system.attributes.ac ?? {};
			const ac = armorDetails?.value ?? 10;
			const equippedArmor = armorDetails.equippedArmor;
			let armorAC = equippedArmor?.system.armor.value ?? 10;
			const equippedShield = armorDetails.equippedShield;
			const shieldAC = equippedShield?.system.armor.value ?? 0;
			if (checkRule("challengeModeArmor") !== "challenge") {
				switch (armorDetails.calc) {
					case 'flat':
						armorAC = (ac.flat ?? 10) - this.system.abilities.dex.mod;
						break;
					case 'draconic':
						armorAC = 13;
						break;
					case 'natural':
						armorAC = (armorDetails.value ?? 10) - this.system.abilities.dex.mod;
						break;
					case 'custom':
						armorAC = equippedArmor?.system.armor.value ?? 10;
						break;
					case 'mage':
						armorAC = 13;
						break; // perhaps this should be 10 if mage armor is magic bonus
					case 'unarmoredMonk':
						armorAC = 10;
						break;
					case 'unarmoredBarb':
						armorAC = 10;
						break;
					default:
					case 'default':
						armorAC = armorDetails.equippedArmor?.system.armor.value ?? 10;
						break;
				}
				;
				const armorReduction = armorAC - 10 + shieldAC;
				const ec = ac - armorReduction;
				this.system.attributes.ac.EC = ec;
				this.system.attributes.ac.AR = armorReduction;
				;
			}
			else {
				if (!this.system.abilities) {
					console.error("midi-qol | challenge mode armor failed to find abilities");
					console.error(this);
					return;
				}
				let dexMod = this.system.abilities.dex.mod;
				if (equippedArmor?.system.armor.type === "heavy")
					dexMod = 0;
				if (equippedArmor?.system.armor.type === "medium")
					dexMod = Math.min(dexMod, 2);
				this.system.attributes.ac.EC = 10 + dexMod + shieldAC;
				this.system.attributes.ac.AR = ac - 10 - dexMod;
			}
		}
	}
	catch (err) {
		const message = "midi-qol failed to prepare derived data";
		console.error(message, err);
		TroubleShooter.recordError(err, message);
	}
}
let currentDAcalculateDamage;
export function initPatching() {
	libWrapper = globalThis.libWrapper;
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
	// For new onuse macros stuff.
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
	libWrapper.register("midi-qol", "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.getRollData", actorGetRollData, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.getRollData", itemGetRollData, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "WRAPPER");
	currentDAcalculateDamage = window?.customElements?.get("damage-application")?.prototype.calculateDamage;
	if (window?.customElements?.get("damage-application")?.prototype?.calculateDamage) {
		//@ts-expect-error
		window.customElements.get("damage-application").prototype.calculateDamage = DAcalculateDamage;
	}
	if (true) {
		const actorClass = CONFIG.Actor.documentClass;
		const itemClass = CONFIG.Item.documentClass;
		const tokenClass = CONFIG.Token.documentClass;
		const templateClass = CONFIG.MeasuredTemplate.documentClass;
		const tileClass = CONFIG.Tile.documentClass;
		const lightClass = CONFIG.AmbientLight.documentClass;
		const soundClass = CONFIG.AmbientSound.documentClass;
		const wallClass = CONFIG.Wall.documentClass;
		const effectClass = CONFIG.ActiveEffect.documentClass;
		//@ts-expect-error .version
		if (game.system.id === "dnd5e" && foundry.utils.isNewerVersion(game.system.version, "3.0.99")) {
			const classStrings = [
				"CONFIG.Actor.documentClass",
				"CONFIG.Item.documentClass",
				"CONFIG.Token.documentClass",
				"CONFIG.MeasuredTemplate.documentClass",
				"CONFIG.Tile.documentClass",
				"CONFIG.AmbientLight.documentClass",
				"CONFIG.AmbientSound.documentClass",
				"CONFIG.Wall.documentClass"
			];
			const addDependent = effectClass.prototype.addDependent;
			const getDependents = effectClass.prototype.getDependents;
			for (let classString of classStrings) {
				const docClass = eval(classString);
				if (!docClass)
					continue;
				if (!docClass.prototype.addDependent)
					docClass.prototype.addDependent = addDependent;
				if (!docClass.prototype.getDependents)
					docClass.prototype.getDependents = getDependents;
				if (docClass.prototype.removeDependent)
					docClass.prototype.removeDependent = removeDependent;
				if (!docClass.prototype.clearDependents)
					docClass.prototype.clearDependents = clearDependents;
				libWrapper.register("midi-qol", `${classString}.prototype._onDelete`, _onDelete, "WRAPPER");
			}
			if (!effectClass.prototype.removeDependent)
				effectClass.prototype.removeDependent = removeDependent;
			if (!effectClass.prototype.clearDependents)
				effectClass.prototype.clearDependents = clearDependents;
		}
	}
}
function removeDependent(dependent) {
	const dependents = (this.getFlag("dnd5e", "dependents") || []).filter(dep => dep.uuid !== dependent.uuid);
	if (dependents.length === 0)
		return this.unsetFlag("dnd5e", "dependents");
	return this.setFlag("dndn5e", "dependents", dependents);
}
function clearDependents() {
	return this.unsetFlag("dnd5e", "dependents");
}
async function _onDelete(wrapped, options, userId) {
	wrapped(options, userId);
	//@ts-expect-error
	if (game.user === game.users?.activeGM)
		this.getDependents().forEach(d => d.delete());
}
export function DAcalculateDamage(actor, options) {
	const { total, active } = currentDAcalculateDamage.bind(this)(actor, options);
	active.absorption = new Set();
	active.saves = new Set();
	active.spell = new Set();
	active.magic = new Set();
	active.nonmagic = new Set();
	const damages = actor.calculateDamage(this.damages, options);
	for (const damage of damages) {
		if (damage.active.absorption)
			active.absorption.add(damage.type);
		if (damage.active.spell)
			active.spell.add(damage.type);
		if (damage.active.magic)
			active.magic.add(damage.type);
		if (damage.active.nonmagic)
			active.nonmagic.add(damage.type);
	}
	const union = t => {
		if (foundry.utils.getType(options.ignore?.[t]) === "Set")
			active[t] = active[t].union(options.ignore[t]);
	};
	union("absorption");
	union("spell");
	union("magic");
	union("nonmagic");
	return { total, active };
}
export function _onFocusIn(event) {
	const formElements = [
		HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOptionElement, /*HTMLButtonElement*/
	];
	if (event.target.isContentEditable || formElements.some(cls => event.target instanceof cls))
		this.releaseKeys();
}
export function actorPrepareData(wrapped) {
	try {
		foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", foundry.utils.getProperty(this._source, "flags.midi-qol.onUseMacroName"));
		if (debugEnabled > 0)
			for (let effect of this.appliedEffects) {
				for (let change of effect.changes) {
					if (change.key === "flags.midi-qol.onUseMacroName") {
						if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
							error("onUseMacro effect mode is not custom", `Actor ${this.name} Effect: ${effect.name} ${this.uuid}`);
							TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom"), `Actor ${this.name} Effect: ${effect.name} ${this.uuid} `);
							change.mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
						}
					}
				}
			}
		processTraits(this);
		wrapped();
		prepareOnUseMacroData(this);
		/*
		const deprecatedKeys = ["silver", "adamant", "spell", "nonmagic", "magic", "physical"];
		for (let traitKey of ["dr", "di", "dv", "sdr", "sdi", "sdv"]) {
		for (let deprecatedKey of deprecatedKeys) {
			if (this.system.traits[traitKey]?.value.has(deprecatedKey)) {
			const message = `MidiQOL ${traitKey} value ${deprecatedKey} is no longer supported in Actor ${this.name} ${this.uuid} .Set in custom traits instead`
			if (ui.notifications)
				ui.notifications?.error(message);
			else error(message);
			TroubleShooter.recordError(new Error("Trait key invalid"), message);
			}
		}
		}
		*/
	}
	catch (err) {
		const message = `actor prepare data ${this?.name}`;
		TroubleShooter.recordError(err, message);
	}
}
export function itemPrepareData(wrapped) {
	foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", foundry.utils.getProperty(this._source, "flags.midi-qol.onUseMacroName"));
	if (debugEnabled > 0)
		for (let effect of this.effects) {
			for (let change of effect.changes) {
				if (change.key === "flags.midi-qol.onUseMacroName") {
					if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
						error("onUseMacro effect mode is not custom", `Actor: ${this.parent.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
						TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom - mode treated as custom"), `Actor: ${this.parent.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
						change.mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
					}
				}
			}
		}
	wrapped();
	prepareOnUseMacroData(this);
}
export function prepareOnUseMacroData(actorOrItem) {
	try {
		const macros = foundry.utils.getProperty(actorOrItem, 'flags.midi-qol.onUseMacroName');
		foundry.utils.setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
	}
	catch (err) {
		const message = `midi-qol | failed to prepare onUse macro data ${actorOrItem?.name}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
	}
}
export function preUpdateItemActorOnUseMacro(itemOrActor, changes, options, user) {
	try {
		const macroChanges = foundry.utils.getProperty(changes, "flags.midi-qol.onUseMacroParts") ?? {};
		//@ts-ignore
		if (foundry.utils.isEmpty(macroChanges))
			return true;
		const macros = foundry.utils.getProperty(itemOrActor._source, "flags.midi-qol.onUseMacroName");
		const macroParts = new OnUseMacros(macros ?? null);
		if (!Array.isArray(macroChanges.items)) { // we have an update from editing the macro changes
			for (let keyString in macroChanges.items) {
				let key = Number(keyString);
				if (Number.isNaN(key))
					continue; // just in case
				if (!macroParts.items[key]) {
					macroParts.items.push(OnUseMacro.parsePart({
						macroName: macroChanges.items[key]?.macroName ?? "",
						option: macroChanges.items[key]?.option ?? ""
					}));
					key = macroParts.items.length - 1;
				}
				if (macroChanges.items[keyString].macroName)
					macroParts.items[key].macroName = macroChanges.items[keyString].macroName;
				if (macroChanges.items[keyString].option)
					macroParts.items[key].option = macroChanges.items[keyString].option;
			}
		}
		let macroString = OnUseMacros.parseParts(macroParts).items.map(oum => oum.toString()).join(",");
		changes.flags["midi-qol"].onUseMacroName = macroString;
		delete changes.flags["midi-qol"].onUseMacroParts;
		itemOrActor.updateSource({ "flags.midi-qol.-=onUseMacroParts": null });
	}
	catch (err) {
		delete changes.flags["midi-qol"].onUseMacroParts;
		itemOrActor.updateSource({ "flags.midi-qol.-=onUseMacroParts": null });
		const message = `midi-qol | failed in preUpdateItemActor onUse Macro for ${itemOrActor?.name} ${itemOrActor?.uuid}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
	}
	return true;
}
;
export async function rollInitiativeDialog(wrapped, rollOptions = { fastForward: autoFastForwardAbilityRolls }) {
	const pressedKeys = foundry.utils.duplicate(globalThis.MidiKeyManager.pressedKeys);
	const adv = pressedKeys.advantage;
	const disadv = pressedKeys.disadvantage;
	if (autoFastForwardAbilityRolls)
		rollOptions.fastForward = true;
	//@ts-expect-error .dice
	const dice = game.system.dice.D20Roll;
	rollOptions.advantageMode = dice.ADV_MODE.NORMAL;
	if (adv && !disadv) {
		rollOptions.advantageMode = dice.ADV_MODE.ADVANTAGE;
		rollOptions.fastForward = true;
	}
	if (!adv && disadv) {
		rollOptions.advantageMode = dice.ADV_MODE.DISADVANTAGE;
		rollOptions.fastForward = true;
	}
	if (!rollOptions.fastForward) {
		return wrapped(rollOptions);
	}
	const roll = this.getInitiativeRoll(rollOptions);
	this._cachedInitiativeRoll = roll;
	rollOptions.createCombatants = true;
	await this.rollInitiative({ createCombatants: true });
	delete this._cahcedInitiativeRoll;
}
export function getInitiativeRoll(wrapped, options = { advantageMode: 0, fastForward: autoFastForwardAbilityRolls }) {
	//@ts-expect-error
	const D20Roll = game.dnd5e.dice.D20Roll;
	let disadv = options.advantageMode === D20Roll.ADV_MODE.DISADVANTAGE;
	let adv = options.advantageMode === D20Roll.ADV_MODE.ADVANTAGE;
	const init = this.system.attributes.init.value ?? "dex";
	const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
	if (evalAllConditions(this, "flags.midi-qol.advantage.all", conditionData)
		|| evalAllConditions(this, "flags.midi-qol.advantage.ability.check.all", conditionData)
		|| evalAllConditions(this, `flags.midi-qol.advantage.ability.check.${init}`, conditionData)
		|| evalAllConditions(this, `flags.${game.system.id}.initiativeAdv`, conditionData)) {
		adv = true;
	}
	if (evalAllConditions(this, "flags.midi-qol.disadvantage.all", conditionData)
		|| evalAllConditions(this, "flags.midi-qol.disadvantage.ability.check.all", conditionData)
		|| evalAllConditions(this, `flags.midi-qol.disadvantage.ability.check.${init}`, conditionData)
		|| evalAllConditions(this, `flags.${game.system.id}.initiativeDisadv`, conditionData)) {
		disadv = true;
	}
	if (adv && disadv)
		options.advantageMode = 0;
	else if (adv)
		options.advantageMode = D20Roll.ADV_MODE.ADVANTAGE;
	else if (disadv)
		options.advantageMode = D20Roll.ADV_MODE.DISADVANTAGE;
	if (autoFastForwardAbilityRolls) {
		options.fastForward = true;
	}
	return wrapped(options);
}
export function getItemEffectsToDelete(args) {
	warn("getItemEffectsToDelete: started", globalThis.DAE?.actionQueue);
	let effectsToDelete;
	let { actor, origin, ignore, ignoreTransfer, options } = args;
	try {
		if (!actor) {
			return [];
		}
		//@ts-expect-error
		effectsToDelete = actor?.appliedEffects?.filter(ef => {
			if (installedModules.get("times-up")) {
				if (globalThis.TimesUp.isEffectExpired(ef, { combat: game.combat }))
					return false;
			}
			return ef.origin === origin
				&& !ignore.includes(ef.uuid)
				&& (!ignoreTransfer || ef.flags?.dae?.transfer !== true);
		}).map(ef => ef.id);
		warn("getItemEffectsToDelete: effectsToDelete ", actor.name, effectsToDelete, options);
		return effectsToDelete;
	}
	catch (err) {
		const message = `getItemEffectsToDelete item effects failed for ${actor.name} ${origin} ${effectsToDelete}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
		return [];
	}
}
export function canRemoveConcentration(concentrationData, deletedUuid) {
	if (concentrationData?.templates.filter(templateUuid => templateUuid !== deletedUuid).length > 0)
		return false;
	const remainingEffects = getConcentrationEffectsRemaining(concentrationData, deletedUuid);
	return remainingEffects.length <= 1;
}
export async function removeConcentrationEffects(actor, deletedEffectUuid, options) {
	let result;
	try {
		if (debugEnabled > 0)
			warn("removeConcentrationEffects | ", actor?.name, deletedEffectUuid, options);
		const concentrationData = foundry.utils.duplicate(actor.getFlag("midi-qol", "concentration-data") ?? {});
		//@ts-expect-error
		if (foundry.utils.isEmpty(concentrationData)) {
			await getConcentrationEffect(actor)?.delete();
		}
		else {
			// if (!concentrationData) return;
			const promises = [];
			await actor.unsetFlag("midi-qol", "concentration-data");
			if (concentrationData?.templates) {
				for (let templateUuid of concentrationData.templates) {
					if (templateUuid === deletedEffectUuid)
						continue;
					//@ts-expect-error fromUuidSync
					const template = fromUuidSync(templateUuid);
					if (debugEnabled > 0)
						warn("removeConcentration | removing template", actor?.name, templateUuid, options);
					if (template)
						promises.push(template.delete());
				}
			}
			if (concentrationData?.removeUuids?.length > 0) {
				for (let removeUuid of concentrationData.removeUuids) {
					//@ts-expect-error fromUuidSync
					const entity = fromUuidSync(removeUuid);
					if (debugEnabled > 0)
						warn("removeConcentration | removing entity", actor?.name, removeUuid, options);
					if (entity)
						promises.push(entity.delete());
				}
				;
			}
			if (concentrationData?.targets && !options.concentrationEffectsDeleted) {
				debug("About to remove concentration effects", actor?.name);
				options.noConcentrationCheck = true;
				const effectsToDelete = getConcentrationEffectsRemaining(concentrationData, deletedEffectUuid);
				if (effectsToDelete.length > 0) {
					const deleteOptions = foundry.utils.mergeObject(options, { "expiry-reason": "midi-qol:concentration" });
					promises.push(untimedExecuteAsGM("deleteEffectsByUuid", {
						effectsToDelete: effectsToDelete.map(ef => ef.uuid),
						options: foundry.utils.mergeObject(deleteOptions, { noConcentrationCheck: true })
					}));
				}
			}
			result = await Promise.allSettled(promises);
		}
		if (debugEnabled > 0)
			warn("removeConcentration | finished", actor?.name);
	}
	catch (err) {
		const message = `error when attempting to remove concentration for ${actor?.name}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
		return result;
		// return await concentrationEffect?.delete();
	}
}
export async function zeroHPExpiry(actor, update, options, user) {
	const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
	if (hpUpdate !== 0)
		return;
	const expiredEffects = [];
	for (let effect of actor.appliedEffects) {
		if (effect.flags?.dae?.specialDuration?.includes("zeroHP"))
			expiredEffects.push(effect);
	}
	if (expiredEffects.length > 0)
		await expireEffects(actor, expiredEffects, { "expiry-reason": "midi-qol:zeroHP" });
}
export async function checkWounded(actor, update, options, user) {
	const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
	const vitalityResource = checkRule("vitalityResource");
	//@ts-expect-error
	const dfreds = game.dfreds;
	let vitalityUpdate = vitalityResource && foundry.utils.getProperty(update, vitalityResource.trim());
	// return wrapped(update,options,user);
	if (hpUpdate === undefined && (!vitalityResource || vitalityUpdate === undefined))
		return;
	const attributes = actor.system.attributes;
	const needsBeaten = vitalityResource ? vitalityUpdate <= 0 : attributes.hp.value <= 0;
	if (configSettings.addWounded > 0 && configSettings.addWoundedStyle !== "none") {
		const needsWounded = attributes.hp.pct < configSettings.addWounded && !needsBeaten;
		const woundedStatus = getWoundedStatus();
		if (!woundedStatus) {
			const message = "wounded status condition not set - please update your midi-qol wounded condition on the mechanics tab";
			TroubleShooter.recordError(new Error(message), "In check wounded");
			ui.notifications?.warn(`midi-qol | ${message}`);
		}
		else if (installedModules.get("dfreds-convenient-effects") && woundedStatus.id.startsWith("Convenient Effect:")) {
			const wounded = await ConvenientEffectsHasEffect((woundedStatus.name), actor, false);
			if (wounded !== needsWounded) {
				if (needsWounded)
					await dfreds.effectInterface?.addEffectWith({ effectData: woundedStatus, uuid: actor.uuid, overlay: configSettings.addWoundedStyle === "overlay" });
				else
					await actor.effects.find(ef => ef.name === woundedStatus.name)?.delete();
			}
		}
		else {
			const token = tokenForActor(actor);
			if (woundedStatus && token) {
				if (!needsWounded) {
					//@ts-expect-error
					if (game.release.generation >= 12) {
						// Cater to the possibility that the setings changed while the effect was applied
						//@ts-expect-error
						await token.actor?.toggleStatusEffect(woundedStatus?.id, { overlay: true, active: false });
						//@ts-expect-error
						await token.actor?.toggleStatusEffect(woundedStatus?.id, { overlay: false, active: false });
					}
					else {
						await token.toggleEffect(woundedStatus, { overlay: true, active: false });
						await token.toggleEffect(woundedStatus, { overlay: false, active: false });
					}
				}
				else {
					//@ts-expect-error
					if (!token.document.hasStatusEffect(woundedStatus.id)) {
						//@ts-expect-error
						if (game.release.generation >= 12) {
							//@ts-expect-error
							await token.actor?.toggleStatusEffect(woundedStatus.id, { overlay: configSettings.addWoundedStyle === "overlay", active: true });
						}
						else {
							await token.toggleEffect(woundedStatus, { overlay: configSettings.addWoundedStyle === "overlay", active: true });
						}
					}
				}
			}
		}
	}
	if (configSettings.addDead !== "none") {
		let effect = getDeadStatus();
		let otherEffect = getUnconsciousStatus();
		let useDefeated = true;
		if ((actor.type === "character" || actor.hasPlayerOwner) && !vitalityResource) {
			effect = getUnconsciousStatus();
			otherEffect = getDeadStatus();
			useDefeated = false;
		}
		if (!needsBeaten) {
			await setDeadStatus(actor, { effect: getDeadStatus(), useDefeated, makeDead: false });
			await setDeadStatus(actor, { effect: getUnconsciousStatus(), useDefeated, makeDead: false });
		}
		else {
			await setDeadStatus(actor, { effect, useDefeated, makeDead: needsBeaten });
			if (effect !== otherEffect)
				await setDeadStatus(actor, { effect: otherEffect, useDefeated: false, makeDead: false });
		}
	}
}
async function setDeadStatus(actor, options) {
	//@ts-expect-error
	const dfreds = game.dfreds;
	let { effect, useDefeated, makeDead } = options;
	if (!effect)
		return;
	if (effect && installedModules.get("dfreds-convenient-effects") && effect.id.startsWith("Convenient Effect:")) {
		const isBeaten = actor.effects.find(ef => ef.name === effect?.name) !== undefined;
		if ((makeDead !== isBeaten)) {
			let combatant;
			if (actor.token)
				combatant = game.combat?.getCombatantByToken(actor.token.id);
			//@ts-ignore
			else
				combatant = game.combat?.getCombatantByActor(actor.id);
			if (combatant && useDefeated) {
				await combatant.update({ defeated: makeDead });
			}
			if (makeDead) {
				await dfreds.effectInterface?.addEffectWith({ effectData: effect, uuid: actor.uuid, overlay: configSettings.addDead === "overlay" });
			}
			else { // remove beaten condition
				await dfreds.effectInterface?.removeEffect({ effectName: effect?.name, uuid: actor.uuid });
			}
		}
	}
	else {
		//@ts-expect-error generation
		if (game.release.generation >= 12) {
			// V12 uses an actor
			const isBeaten = actor.effects.find(ef => ef.name === (i18n(effect?.name ?? effect?.label ?? ""))) !== undefined;
			if (isBeaten !== makeDead) {
				let combatant;
				if (actor.token)
					combatant = game.combat?.getCombatantByToken(actor.token.id);
				//@ts-expect-error
				else
					combatant = game.combat?.getCombatantByActor(actor.id);
				if (combatant && useDefeated)
					await combatant.update({ defeated: makeDead });
				if (effect)
					await actor.toggleStatusEffect(effect.id, { overlay: configSettings.addDead === "overlay", active: makeDead });
				const deadEffect = getDeadStatus();
				if (!makeDead && deadEffect)
					await actor.toggleStatusEffect(deadEffect.id, { overlay: configSettings.addDead === "overlay", active: false });
			}
		}
		else {
			let token = tokenForActor(actor); // V11 must use a token
			//TODO V12 support actor.toggleEffect - so get rid of token and replce with actor.toggleEffect
			if (token) {
				const isBeaten = actor.effects.find(ef => ef.name === (i18n(effect?.name ?? effect?.label ?? ""))) !== undefined;
				if (isBeaten !== makeDead) {
					let combatant;
					if (actor.token)
						combatant = game.combat?.getCombatantByToken(actor.token.id);
					//@ts-expect-error
					else
						combatant = game.combat?.getCombatantByActor(actor.id);
					if (combatant && useDefeated)
						await combatant.update({ defeated: makeDead });
					if (effect)
						await token.toggleEffect(effect, { overlay: configSettings.addDead === "overlay", active: makeDead });
					const deadEffect = getDeadStatus();
					if (!makeDead && deadEffect)
						await token.toggleEffect(deadEffect, { overlay: configSettings.addDead === "overlay", active: false });
				}
			}
		}
	}
}
async function _preUpdateActor(wrapped, update, options, user) {
	try {
		await checkWounded(this, update, options, user);
		await zeroHPExpiry(this, update, options, user);
	}
	catch (err) {
		const message = `midi-qol | _preUpdateActor failed `;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
		return wrapped(update, options, user);
	}
}
function itemSheetDefaultOptions(wrapped) {
	const options = wrapped();
	const modulesToCheck = ["magic-items-2", "magicitems", "items-with-spells-5e", "ready-set-roll-5e"];
	const installedModules = modulesToCheck.filter(mid => game.modules.get(mid)?.active).length + (configSettings.midiFieldsTab ? 1 : 0);
	const newWidth = 560 + Math.max(0, (installedModules - 2) * 100);
	if (options.width < newWidth) {
		log(`increasing item sheet width from ${options.width} to ${newWidth}`);
		options.width = newWidth;
	}
	return options;
}
export function readyPatching() {
	if (game.system.id === "dnd5e" || game.system.id === "n5e") {
		libWrapper.register("midi-qol", `game.${game.system.id}.canvas.AbilityTemplate.prototype.refresh`, midiATRefresh, "WRAPPER");
		libWrapper.register("midi-qol", "game.system.applications.actor.TraitSelector.prototype.getData", preDamageTraitSelectorGetData, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter'].cls.prototype._filterItems", _filterItems, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Actor.sheetClasses.npc['dnd5e.ActorSheet5eNPC'].cls.prototype._filterItems", _filterItems, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Item.sheetClasses.base['dnd5e.ItemSheet5e'].cls.defaultOptions", itemSheetDefaultOptions, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype._onUpdate", onUpdateActor, "MIXED");
	}
	else { // TODO find out what itemsheet5e is called in sw5e TODO work out how this is set for sw5e v10
		libWrapper.register("midi-qol", "game.sw5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER");
		libWrapper.register("midi-qol", "game.system.applications.actor.TraitSelector.prototype.getData", preDamageTraitSelectorGetData, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Actor.sheetClasses.character['sw5e.ActorSheet5eCharacter'].cls.prototype._filterItems", _filterItems, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Actor.sheetClasses.npc['sw5e.ActorSheet5eNPC'].cls.prototype._filterItems", _filterItems, "WRAPPER");
	}
	libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");
	libWrapper.register("midi-qol", "Notifications.prototype.notify", notificationNotify, "MIXED");
	//@ts-expect-error
	const gameVersion = game.system.version;
	if ((game.system.id === "dnd5e" && foundry.utils.isNewerVersion("2.1.0", gameVersion))) {
		if (ui.notifications)
			ui.notifications.error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 2.2.0 or later`);
		else
			error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 2.2.0 or later`);
	}
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.getInitiativeRoll", getInitiativeRoll, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollInitiativeDialog", rollInitiativeDialog, "MIXED");
}
export async function onUpdateActor(wrapped, data, options, userId) {
	if (!options.noConcentrationCheck)
		return wrapped(data, options, userId);
	Object.getPrototypeOf(CONFIG.Actor.documentClass).prototype._onUpdate.bind(this)(data, options, userId);
	if (userId === game.userId) {
		await this.updateEncumbrance(options);
		this._onUpdateExhaustion(data, options);
	}
	const hp = options.dnd5e?.hp;
	if (hp && !options.isRest && !options.isAdvancement) {
		const curr = this.system.attributes.hp;
		const changes = {
			hp: curr.value - hp.value,
			temp: curr.temp - hp.temp,
			total: 0
		};
		changes.total = changes.hp + changes.temp;
		// options.noConcentrationCheck true so don't display concentration effect chat card.
		/**
		* A hook event that fires when an actor is damaged or healed by any means. The actual name
		* of the hook will depend on the change in hit points.
		* @function dnd5e.damageActor
		* @memberof hookEvents
		* @param {Actor5e} actor                                       The actor that had their hit points reduced.
		* @param {{hp: number, temp: number, total: number}} changes   The changes to hit points.
		* @param {object} update                                       The original update delta.
		* @param {string} userId                                       Id of the user that performed the update.
		*/
		Hooks.callAll(`dnd5e.${changes.total > 0 ? "heal" : "damage"}Actor`, this, changes, data, userId);
	}
}
export let visionPatching = () => {
	//@ts-ignore game.version
	const patchVision = foundry.utils.isNewerVersion(game.version ?? game?.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens");
	if (patchVision) {
		ui.notifications?.warn("Player control vision is deprecated, use it at your own risk");
		console.warn("midi-qol | Player control vision is deprecated, use it at your own risk");
		log("Patching Token._isVisionSource");
		libWrapper.register("midi-qol", "Token.prototype._isVisionSource", _isVisionSource, "WRAPPER");
		log("Patching Token.isVisible");
		libWrapper.register("midi-qol", "Token.prototype.isVisible", isVisible, "WRAPPER");
	}
	log("Vision patching - ", patchVision ? "enabled" : "disabled");
};
export function configureDamageRollDialog() {
	try {
		libWrapper.unregister("midi-qol", "CONFIG.Dice.DamageRoll.configureDialog", false);
		if (configSettings.promptDamageRoll)
			libWrapper.register("midi-qol", "CONFIG.Dice.DamageRoll.configureDialog", CustomizeDamageFormula.configureDialog, "MIXED");
	}
	catch (err) {
		const message = `midi-qol | error when registering configureDamageRollDialog`;
		TroubleShooter.recordError(err, message);
		error(message, err);
	}
}
function _getUsageConfig(wrapped) {
	//Radius tempalte spells with self/spec/any will auto place the template so don't prompt for it in config.
	const config = wrapped();
	//  const autoCreatetemplate = this.hasAreaTarget && ["self"].includes(this.system.range?.units) && ["radius"].includes(this.system.target.type);
	const autoCreatetemplate = this.hasAreaTarget && hasAutoPlaceTemplate(this);
	if (autoCreatetemplate)
		config.createMeasuredTemplate = null;
	return config;
}
export let itemPatching = () => {
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollAttack", doAttackRoll, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollDamage", doDamageRoll, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.displayCard", wrappedDisplayCard, "MIXED");
	if (game.system.id === "dnd5e" || game.system.id === "n5e") {
		//@ts-expect-error .version
		if (foundry.utils.isNewerVersion(game.system.version, "2.3.99"))
			libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype._getUsageConfig", _getUsageConfig, "WRAPPER");
		libWrapper.register("midi-qol", "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
	}
	configureDamageRollDialog();
};
export async function checkDeleteTemplate(templateDocument, options, user) {
	if (user !== game.user?.id)
		return;
	if (options.undo)
		return;
	//@ts-expect-error
	let origin = fromUuidSync(templateDocument.getFlag("dnd5e", "origin"));
	if (origin instanceof Item && origin.parent instanceof Actor) {
		//@ts-expect-error
		origin = origin.parent.effects?.find(ef => ef.getFlag("dnd5e", "dependents")?.some(dep => dep.uuid === templateDocument.uuid));
	}
	if (origin instanceof ActiveEffect && !options.noConcentrationCheck && configSettings.removeConcentrationEffects !== "none" && !safeGetGameSetting("dnd5e", "disableConcentration")) {
		//@ts-expect-error
		if ((origin.getFlag("dnd5e", "dependents")) && origin.getDependents().length === 0) {
			await origin.delete();
		}
	}
	if (!configSettings.concentrationAutomation)
		return;
	try {
		const uuid = foundry.utils.getProperty(templateDocument, "flags.midi-qol.itemUuid");
		const actor = MQfromUuid(uuid)?.actor;
		if (!(actor instanceof CONFIG.Actor.documentClass))
			return;
		const concentrationData = foundry.utils.getProperty(actor, "flags.midi-qol.concentration-data");
		if (!concentrationData || concentrationData.templates.length === 0)
			return;
		if (canRemoveConcentration(concentrationData, templateDocument.uuid)) {
			await removeConcentrationEffects(actor, templateDocument.uuid, options);
		}
		else if (concentrationData.templates.length >= 1) {
			// update the concentration templates
			concentrationData.templates = concentrationData.templates.filter(uuid => uuid !== templateDocument.uuid);
			await actor.setFlag("midi-qol", "concentration-data", concentrationData);
		}
	}
	catch (err) {
		const message = `checkDeleteTemplate failed for ${templateDocument?.uuid}`;
		TroubleShooter.recordError(err, message);
	}
	finally {
		return true;
	}
}
;
export let actorAbilityRollPatching = () => {
	log("Patching roll abilities Save/Test/Skill/Tool");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilitySave", rollAbilitySave, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilityTest", rollAbilityTest, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollDeathSave", rollDeathSave, "WRAPPER");
	libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "MIXED");
	libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollToolCheck", rollToolCheck, "WRAPPER");
	// 10.0.19 rollDeath save now implemented via the preRollDeathSave Hook
	// v12 (and v11 for compat) deathSave is now a patch to allow for async evaluation of adv/dis flags
};
export async function rollToolCheck(wrapped, options = {}) {
	const chatMessage = options.chatMessage;
	options.chatMessage = false;
	let result = await wrapped(options);
	let rollMode = result.options.rollMode ?? game.settings.get("core", "rollMode");
	await displayDSNForRoll(result, "toolCheck", rollMode);
	result = await bonusCheck(this.actor, result, "check", this.system.ability ?? "");
	if (chatMessage !== false && result) {
		const title = `${this.name} - ${game.i18n.localize("DND5E.ToolCheck")}`;
		const args = { "speaker": getSpeaker(this.actor), title, flavor: title };
		foundry.utils.setProperty(args, `flags.${game.system.id}.roll`, { type: "tool", itemId: this.id, itemUuid: this.uuid });
		args.template = "modules/midi-qol/templates/roll.html";
		await result.toMessage(args, { rollMode });
	}
	return result;
}
export function patchLMRTFY() {
	if (installedModules.get("lmrtfy")) {
		log("Patching lmrtfy");
		libWrapper.register("midi-qol", "LMRTFYRoller.prototype._makeRoll", LMRTFYMakeRoll, "OVERRIDE");
		libWrapper.register("midi-qol", "LMRTFY.onMessage", LMRTFYOnMessage, "OVERRIDE");
	}
}
function LMRTFYOnMessage(data) {
	//console.log("LMRTF got message: ", data)
	if (data.user === "character" &&
		(!game.user?.character || !data.actors.includes(game.user.character.id))) {
		return;
	}
	else if (!["character", "tokens"].includes(data.user) && data.user !== game.user?.id) {
		return;
	}
	let actors = [];
	if (data.user === "character") {
		actors = [game?.user?.character];
	}
	else if (data.user === "tokens") {
		//@ts-expect-error
		actors = canvas?.tokens?.controlled.map(t => t.actor).filter(a => data.actors.includes(a?.id)) ?? [];
	}
	else {
		//@ts-expect-error
		actors = data.actors.map(aid => LMRTFY.fromUuid(aid));
	}
	actors = actors.filter(a => a);
	// remove player characters from GM's requests
	if (game.user?.isGM && data.user !== game.user.id) {
		actors = actors.filter(a => !a?.hasPlayerOwner);
	}
	if (actors.length === 0)
		return;
	//@ts-ignore
	new LMRTFYRoller(actors, data).render(true);
}
async function LMRTFYMakeRoll(event, rollMethod, failRoll, ...args) {
	let options = this._getRollOptions(event, failRoll);
	// save the current roll mode to reset it after this roll
	const rollMode = game.settings.get("core", "rollMode");
	game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);
	for (let actor of this.actors) {
		Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
		// system specific roll handling
		switch (game.system.id) {
			default: {
				foundry.utils.setProperty(options, "flags.lmrtfy", { "message": this.data.message, "data": this.data.attach });
				actor[rollMethod].call(actor, ...args, options);
			}
		}
	}
	game.settings.set("core", "rollMode", rollMode);
	this._disableButtons(event);
	this._checkClose();
}
// This is done as a wrapper so that there is no race condition when hp reaches 0 also trying to remove condition
// This version will always fire first, remove concentration if needed and complete before the hp update is processed.
async function _preCreateActiveEffect(wrapped, data, options, user) {
	try {
		if (!configSettings.concentrationIncapacitatedConditionCheck)
			return;
		const parent = this.parent;
		const checkConcentration = configSettings.concentrationAutomation;
		if (!checkConcentration || options.noConcentrationCheck)
			return;
		if (!(parent instanceof CONFIG.Actor.documentClass))
			return;
		if (globalThis.MidiQOL.incapacitatedConditions.some(condition => this.statuses.has(condition))) {
			if (debugEnabled > 0)
				warn(`on createActiveEffect ${this.name} ${this.id} removing concentration for ${parent.name}`);
			await removeConcentrationEffects(parent, undefined, { noConcentrationCheck: false });
		}
	}
	catch (err) {
		const message = "midi-qol | error in preCreateActiveEffect";
		console.error(message, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
		return wrapped(data, options, user);
	}
}
function filterChatMessageCreate(wrapped, data, context) {
	if (!(data instanceof Array))
		data = [data];
	for (let messageData of data) {
		if (messageData.flags?.lmrtfy?.data?.disableMessage)
			messageData.blind = true; // TODO check this v10
	}
	return wrapped(data, context);
}
export function _tagMessage(candidate, data, options) {
	let update = { flags: { lmrtfy: { "message": this.data.message, "data": this.data.attach } } }; // TODO check this
	candidate.updateSource(update);
}
export async function _makeRoll(event, rollMethod, failRoll, ...args) {
	let options;
	switch (this.advantage) {
		case -1:
			options = { disadvantage: true, fastForward: true };
			break;
		case 0:
			options = { fastForward: true };
			break;
		case 1:
			options = { advantage: true, fastForward: true };
			break;
		case 2:
			options = { event };
			break;
	}
	const rollMode = game.settings.get("core", "rollMode");
	game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);
	for (let actor of this.actors) {
		Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
		if (failRoll) {
			options["parts"] = [-100];
		}
		await actor[rollMethod].call(actor, ...args, options);
	}
	game.settings.set("core", "rollMode", rollMode);
	this._disableButtons(event);
	this._checkClose();
}
export async function createRollResultFromCustomRoll(customRoll) {
	const saveEntry = customRoll.entries?.find((e) => e.type === "multiroll");
	let saveTotal = saveEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
	let advantage = saveEntry ? saveEntry.rollState === "highest" : undefined;
	let disadvantage = saveEntry ? saveEntry.rollState === "lowest" : undefined;
	let diceRoll = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.roll.terms[0].total : -1;
	let isCritical = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.isCrit : false;
	//@ts-ignore
	const result = await new Roll(`${saveTotal}`).evaluate();
	foundry.utils.setProperty(result.terms[0].options, "advantage", advantage);
	foundry.utils.setProperty(result.terms[0].options, "disadvantage", disadvantage);
	return result;
}
export async function _preDeleteCombat(wrapped, ...args) {
	try {
		for (let combatant of this.combatants) {
			if (combatant.actor) {
				if (hasUsedReaction(combatant.actor))
					await removeReactionUsed(combatant.actor, true);
				if (hasUsedBonusAction(combatant.actor))
					await removeBonusActionUsed(combatant.actor, true);
				if (hasUsedAction(combatant.actor))
					await removeActionUsed(combatant.actor);
			}
		}
	}
	catch (err) {
		const message = `midi-qol | error in preDeleteCombat`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
		return wrapped(...args);
	}
}
class CustomizeDamageFormula {
	static async configureDialog(wrapped, ...args) {
		// If the option is not enabled, return the original function - as an alternative register\unregister would be possible
		const [rolls, { title, defaultRollMode, defaultCritical, template, allowCritical }, options] = args;
		// Render the Dialog inner HTML
		const allRolls = rolls.map((roll, index) => ({
			value: `${roll.formula}${index === 0 ? " + @bonus" : ""}`,
			type: GameSystemConfig.damageTypes[roll.options.type]?.label ?? null,
			active: true,
			label: "Formula",
			roll,
			id: randomID()
		}));
		const item = rolls[0]?.data.item;
		//@ts-expect-error
		const DamageRoll = CONFIG.Dice.DamageRoll;
		if (item) {
			if (item.damage.versatile) {
				let actorBonus;
				if (rolls[0].data?.bonuses) {
					const actorBonusData = foundry.utils.getProperty(rolls[0], `data.bonuses.${item.actionType}`) || {};
					if (actorBonusData.damage && (parseInt(actorBonusData.damage) !== 0)) {
						actorBonus = actorBonusData.damage;
					}
				}
				const versatileFormula = item.damage.versatile + (actorBonus ? ` + ${actorBonus}` : "");
				allRolls.push({
					value: versatileFormula,
					type: GameSystemConfig.damageTypes[rolls[0].options.type]?.label ?? null,
					active: false,
					label: "Versatile",
					roll: new DamageRoll(versatileFormula, rolls[0].data, rolls[0].options),
					id: randomID()
				});
			}
			if ((item.formula ?? "").length > 0) {
				allRolls.push({
					value: item.formula,
					type: GameSystemConfig.damageTypes[rolls[0].options.type]?.label ?? null,
					versatileDamage: item.damage.versatile,
					active: false,
					label: "Other",
					roll: new DamageRoll(item.formula, rolls[0].data, rolls[0].options),
					id: randomID()
				});
			}
		}
		const content = await renderTemplate(
		//@ts-ignore
		"modules/midi-qol/templates/damage-roll-dialog.hbs", {
			formulas: allRolls,
			defaultRollMode,
			rollModes: CONFIG.Dice.rollModes,
		});
		// Create the Dialog window and await submission of the form
		return new Promise((resolve) => {
			new Dialog({
				title,
				rolls: allRolls,
				content,
				buttons: {
					critical: {
						//@ts-ignore
						condition: allowCritical,
						label: game.i18n.localize("DND5E.CriticalHit"),
						//@ts-ignore
						callback: html => {
							let returnRolls = allRolls.filter(r => r.active).map(r => r.roll);
							returnRolls = returnRolls.map((r, i) => r._onDialogSubmit(html, true, i === 0));
							rolls.length = 0;
							rolls.push(...returnRolls);
							resolve(returnRolls);
						}
					},
					normal: {
						label: game.i18n.localize(allowCritical ? "DND5E.Normal" : "DND5E.Roll"),
						//@ts-ignore
						callback: html => {
							let returnRolls = allRolls.filter(r => r.active).map(r => r.roll);
							returnRolls = returnRolls.map((r, i) => r._onDialogSubmit(html, false, i === 0));
							rolls.length = 0;
							rolls.push(...returnRolls);
							resolve(returnRolls);
						},
					},
				},
				default: defaultCritical ? "critical" : "normal",
				// Inject the formula customizer - this is the only line that differs from the original
				render: (html) => {
					try {
						CustomizeDamageFormula.activateListeners(html, allRolls);
					}
					catch (err) {
						const message = `injectFormulaCustomizer`;
						error(message, err);
						TroubleShooter.recordError(err, message);
					}
				},
				close: () => resolve(null),
			}, options).render(true);
		});
	}
	static activateListeners(html, allRolls) {
		html.find('input[name="formula.active"]').on("click", (e) => {
			const id = e.currentTarget.dataset.id;
			const theRoll = allRolls.find(r => r.id === id);
			theRoll.active = e.currentTarget.checked;
		});
	}
}
export function processTraits(actor) {
	try {
		if (!actor.system.traits)
			return;
		for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
			let trait = actor.system.traits[traitId];
			if (!trait)
				continue;
			if (!trait.value)
				trait.value = new Set();
			for (let traitString of trait.value) {
				switch (traitString) {
					case "silver":
						trait.bypasses.add("sil");
						addPhysicalDamages(trait.value);
						break;
					case "adamant":
						trait.bypasses.add("ada");
						addPhysicalDamages(trait.value);
						break;
					case "physical":
						addPhysicalDamages(trait.value);
						break;
					case "nonmagic":
						addPhysicalDamages(trait.value);
						trait.bypasses.add("mgc");
						break;
					case "spell":
						// trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
						break;
					case "power":
						// trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
						break;
					case "magic":
						// trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
						break;
					case "healing":
						// trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.healing);
						break;
					case "temphp":
						// trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.temphp);
						break;
					default:
						trait.value.add(traitString);
				}
			}
		}
	}
	catch (err) {
		const message = `midi-qol | processTraits | error for ${actor?.name}`;
		console.warn(message, this, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
	}
}
export function migrateTraits(actor) {
	try {
		if (!actor.system.traits)
			return;
		const baseData = actor.toObject(true);
		for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
			let trait = actor.system.traits[traitId];
			let baseTrait = baseData.system.traits[traitId];
			if (!trait)
				continue;
			if (!trait.value)
				trait.value = new Set();
			if (trait.bypasses instanceof Set) {
				for (let traitString of baseTrait.value) {
					switch (traitString) {
						case "silver":
							trait.bypasses.add("sil");
							addPhysicalDamages(trait.value);
							trait.value.delete("silver");
							log(`${actor.name} mapping "Silver" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "adamant":
							trait.bypasses.add("ada");
							addPhysicalDamages(trait.value);
							trait.value.delete("adamant");
							log(`${actor.name} mapping "Adamantine" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "physical":
							addPhysicalDamages(trait.value);
							trait.value.delete("physical");
							log(`${actor.name} mapping "Physical" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "nonmagic":
							addPhysicalDamages(trait.value);
							trait.bypasses.add("mgc");
							trait.value.delete("nonmagic");
							log(`${actor.name} mapping "nongamic" to ${trait.custom}`);
							break;
						case "spell":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
							trait.value.delete("spell");
							log(`${actor.name} mapping "spell" to ${trait.custom}`);
							break;
						case "power":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
							trait.value.delete("power");
							log(`${actor.name} mapping "power" to ${trait.custom}`);
							break;
						case "magic":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
							trait.value.delete("magic");
							log(`${actor.name} mapping "magic" to ${trait.custom}`);
							break;
						case "healing":
							trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing);
							trait.value.delete("healing");
							log(`${actor.name} mapping "healing" to ${trait.custom}`);
							break;
						case "temphp":
							trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp);
							trait.value.delete("temphp");
							log(`${actor.name} mapping "temphp" to ${trait.custom}`);
							break;
						default:
							trait.value.add(traitString);
					}
				}
			}
			else {
				for (let traitString of baseTrait.value) {
					switch (traitString) {
						case "silver":
							if (!trait.bypasses.includes("sil"))
								trait.bypasses.push("sil");
							addPhysicalDamages(trait.value);
							trait.value = removeTraitValue(trait.value, "silver");
							log(`${actor.name} mapping "Silver" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "adamant":
							if (!trait.bypasses.includes("ada"))
								trait.bypasses.push("ada");
							addPhysicalDamages(trait.value);
							trait.value = removeTraitValue(trait.value, "adamant");
							log(`${actor.name} mapping "Adamantine" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "physical":
							addPhysicalDamages(trait.value);
							trait.value = removeTraitValue(trait.value, "physical");
							log(`${actor.name} mapping "Physical" to ${trait.value}, ${trait.bypasses}`);
							break;
						case "nonmagic":
							addPhysicalDamages(trait.value);
							if (!trait.bypasses.includes("mgc"))
								trait.bypasses.push("mgc");
							trait.value = removeTraitValue(trait.value, "nonmagic");
							log(`${actor.name} mapping "nongamic" to ${trait.custom}`);
							break;
						case "spell":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
							trait.value = removeTraitValue(trait.value, "spell");
							log(`${actor.name} mapping "spell" to ${trait.custom}`);
							break;
						case "power":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
							trait.value = removeTraitValue(trait.value, "power");
							log(`${actor.name} mapping "power" to ${trait.custom}`);
							break;
						case "magic":
							trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
							trait.value = removeTraitValue(trait.value, "magic");
							log(`${actor.name} mapping "magic" to ${trait.custom}`);
							break;
						case "healing":
							trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing);
							trait.value = removeTraitValue(trait.value, "healing");
							log(`${actor.name} mapping "healing" to ${trait.custom}`);
							break;
						case "temphp":
							trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp);
							trait.value = removeTraitValue(trait.value, "temphp");
							log(`${actor.name} mapping "temphp" to ${trait.custom}`);
							break;
						default:
							trait.value.push(traitString);
					}
				}
			}
		}
	}
	catch (err) {
		const message = `midi-qol | migrateTraits | error for ${actor?.name}`;
		console.warn(message, this, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
	}
}
function removeTraitValue(traitValue, toRemove) {
	if (traitValue instanceof Set)
		traitValue.delete(toRemove);
	else {
		const position = traitValue.indexOf(toRemove);
		if (position !== -1)
			return traitValue.splice(position, 1);
	}
	return traitValue;
}
function addPhysicalDamages(traitValue) {
	const phsyicalDamageTypes = Object.keys(GameSystemConfig.physicalDamageTypes);
	for (let dt of phsyicalDamageTypes) {
		if (traitValue instanceof Set)
			traitValue.add(dt);
		else if (!traitValue.includes(dt))
			traitValue.push(dt);
	}
}
function addCustomTrait(customTraits, customTrait) {
	if (customTraits.length === 0) {
		return customTrait;
	}
	const traitList = customTraits.split(";").map(s => s.trim());
	if (traitList.includes(customTrait))
		return customTraits;
	traitList.push(customTrait);
	return traitList.join("; ");
}
function preDamageTraitSelectorGetData(wrapped) {
	try {
		// migrate di/dr/dv and strip out active effect data.
		if (this.object instanceof Actor)
			processTraits(this.object);
	}
	catch (err) {
		const message = `preDamageTraitSelectorGetData | migrate traits error`;
		error(message, err);
		TroubleShooter.recordError(err, message);
	}
	finally {
		return wrapped();
	}
}
function actorGetRollData(wrapped, ...args) {
	const data = wrapped(...args);
	data.actorType = this.type;
	data.name = this.name;
	data.midiFlags = (this.flags && this.flags["midi-qol"]) ?? {};
	data.flags.midiqol = foundry.utils.getProperty(data, "flags.midi-qol");
	data.items = this.items;
	if (game.system.id === "dnd5e") {
		data.cfg = {};
		data.cfg.armorClasses = GameSystemConfig.armorClasses;
		data.cfg.actorSizes = GameSystemConfig.actorSizes;
		data.cfg.skills = GameSystemConfig.skills;
	}
	return data;
}
function itemGetRollData(wrapped, ...args) {
	const data = wrapped(...args);
	if (!data)
		return data;
	data.item.flags = this.flags;
	data.item.midiFlags = foundry.utils.getProperty(this, "flags.midi-qol");
	data.item.name = this.name;
	data.item.type = this.type;
	return data;
}
function _filterItems(wrapped, items, filters) {
	if (!filters.has("reaction"))
		return wrapped(items, filters);
	const revisedFilters = new Set(filters);
	revisedFilters.delete("reaction");
	let filteredItems = wrapped(items, revisedFilters);
	filteredItems = filteredItems.filter(item => {
		if (item.system.activation?.type?.includes("reaction"))
			return true;
		return false;
	});
	return filteredItems;
}
;
