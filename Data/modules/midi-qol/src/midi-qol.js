import { registerSettings, fetchParams, configSettings, checkRule, enableWorkflow, midiSoundSettings, fetchSoundSettings, midiSoundSettingsBackup, disableWorkflowAutomation, readySettingsSetup, collectSettingData, safeGetGameSetting } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, installedModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY, readyPatching, initPatching, addDiceTermModifiers } from './module/patching.js';
import { initHooks, overTimeJSONData, readyHooks, setupHooks } from './module/Hooks.js';
import { SaferSocket, initGMActionSetup, setupSocket, socketlibSocket, untimedExecuteAsGM } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow, DummyWorkflow, DDBGameLogWorkflow } from './module/workflow.js';
import { addConcentration, addConcentrationDependent, addRollTo, applyTokenDamage, canSee, canSense, canSenseModes, checkDistance, checkIncapacitated, checkNearby, checkRange, chooseEffect, completeItemRoll, completeItemUse, computeCoverBonus, contestedRoll, createConditionData, debouncedUpdate, displayDSNForRoll, doConcentrationCheck, doOverTimeEffect, evalAllConditions, evalCondition, findNearby, getCachedDocument, getChanges, getConcentrationEffect, getDistanceSimple, getDistanceSimpleOld, getTokenDocument, getTokenForActor, getTokenForActorAsSet, getTokenPlayerName, getTraitMult, hasCondition, hasUsedBonusAction, hasUsedReaction, isTargetable, midiRenderAttackRoll, midiRenderBonusDamageRoll, midiRenderDamageRoll, midiRenderOtherDamageRoll, midiRenderRoll, MQfromActorUuid, MQfromUuid, playerFor, playerForActor, raceOrType, reactionDialog, reportMidiCriticalFlags, setBonusActionUsed, setReactionUsed, tokenForActor, typeOrRace, validRollAbility } from './module/utils.js';
import { ConfigPanel } from './module/apps/ConfigPanel.js';
import { resolveTargetConfirmation, showItemInfo, templateTokens } from './module/itemhandling.js';
import { RollStats } from './module/RollStats.js';
import { OnUseMacroOptions } from './module/apps/Item.js';
import { MidiKeyManager } from './module/MidiKeyManager.js';
import { MidiSounds } from './module/midi-sounds.js';
import { addUndoChatMessage, getUndoQueue, removeMostRecentWorkflow, showUndoQueue, undoMostRecentWorkflow } from './module/undo.js';
import { showUndoWorkflowApp } from './module/apps/UndoWorkflow.js';
import { TroubleShooter } from './module/apps/TroubleShooter.js';
import { TargetConfirmationDialog } from './module/apps/TargetConfirmation.js';
export let debugEnabled = 0;
export let debugCallTiming = false;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1)
	console.log("DEBUG: midi-qol | ", ...args); };
export let log = (...args) => console.log("midi-qol | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0)
	console.warn("midi-qol | ", ...args); };
export let error = (...args) => console.error("midi-qol | ", ...args);
export let timelog = (...args) => warn("midi-qol | ", Date.now(), ...args);
export var levelsAPI;
export var allDamageTypes;
export function getCanvas() {
	if (!canvas || !canvas.scene) {
		error("Canvas/Scene not ready - roll automation will not function");
		return undefined;
	}
	return canvas;
}
export let i18n = key => {
	return game.i18n.localize(key);
};
export function i18nSystem(key) {
	const keyHeader = game.system.id.toUpperCase();
	return i18n(`${keyHeader}.${key}`);
}
export let i18nFormat = (key, data = {}) => {
	return game.i18n.format(key, data);
};
export function geti18nOptions(key) {
	const translations = game.i18n.translations["midi-qol"] ?? {};
	//@ts-ignore _fallback not accessible
	const fallback = game.i18n._fallback["midi-qol"] ?? {};
	return translations[key] ?? fallback[key] ?? {};
}
export function geti18nTranslations() {
	// @ts-expect-error _fallback
	return foundry.utils.mergeObject(game.i18n._fallback["midi-qol"] ?? {}, game.i18n.translations["midi-qol"] ?? {});
}
export let setDebugLevel = (debugText) => {
	debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
	// 0 = none, warnings = 1, debug = 2, all = 3
	if (debugEnabled >= 3)
		CONFIG.debug.hooks = true;
	debugCallTiming = game.settings.get("midi-qol", "debugCallTiming") ?? false;
};
export let noDamageSaves = [];
export let undoDamageText;
export let savingThrowText;
export let savingThrowTextAlt;
export let MQdefaultDamageType;
export let midiFlags = [];
export let allAttackTypes = [];
export let gameStats;
export let overTimeEffectsToDelete = {};
export let failedSaveOverTimeEffectsToDelete = {};
export let MQItemMacroLabel;
export let MQDeferMacroLabel;
export let MQOnUseOptions;
export let GameSystemConfig;
export let SystemString;
export let systemConcentrationId;
export const MESSAGETYPES = {
	HITS: 1,
	SAVES: 2,
	ATTACK: 3,
	DAMAGE: 4,
	ITEM: 0
};
export let cleanSpellName = (name) => {
	// const regex = /[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤]/g
	const regex = /[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９а-яА-Я々〆〤]/g;
	return name.toLowerCase().replace(regex, '').replace("'", '').replace(/ /g, '');
};
/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once("levelsReady", function () {
	//@ts-ignore
	levelsAPI = CONFIG.Levels.API;
});
export let systemString = "DND5E";
Hooks.once('init', async function () {
	log('Initializing midi-qol');
	//@ts-expect-error
	const systemVersion = game.system.version;
	//@ts-expect-error
	GameSystemConfig = game.system.config;
	if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
		GameSystemConfig.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: `systems/${game.system.id}/icons/svg/trait-damage-immunities.svg` };
		GameSystemConfig.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: `systems/${game.system.id}/icons/svg/trait-damage-immunities.svg` };
	}
	else {
		GameSystemConfig.damageTypes["none"] = i18n(`${SystemString}.None`);
		GameSystemConfig.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
	}
	SystemString = game.system.id.toUpperCase();
	allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
	if (game.system.id === "sw5e")
		allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];
	initHooks();
	//@ts-expect-error
	if (foundry.utils.isNewerVersion("3.1.0", game.system.version)) {
		//@ts-expect-error remove this when dnd5e 3.1 comes out
		CONFIG.specialStatusEffects.CONCENTRATING = "concentrating";
	}
	//@ts-expect-error
	systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;
	globalThis.MidiQOL = { checkIncapacitated };
	// Assign custom classes and constants here
	// Register custom module settings
	registerSettings();
	fetchParams();
	fetchSoundSettings();
	// This seems to cause problems for localisation for the items compendium (at least for french)
	// Try a delay before doing this - hopefully allowing localisation to complete
	// If babele is installed then wait for it to be ready
	if (game.modules.get("babele")?.active) {
		Hooks.once("babele.ready", MidiSounds.getWeaponBaseTypes);
	}
	else {
		setTimeout(MidiSounds.getWeaponBaseTypes, 6000);
	}
	// Preload Handlebars templates
	preloadTemplates();
	// Register custom sheets (if any)
	initPatching();
	addDiceTermModifiers();
	globalThis.MidiKeyManager = new MidiKeyManager();
	globalThis.MidiKeyManager.initKeyMappings();
	Hooks.on("error", (...args) => {
		let [message, err] = args;
		TroubleShooter.recordError(err, message);
	});
});
Hooks.on("dae.modifySpecials", (specKey, specials, _characterSpec) => {
	specials["flags.midi-qol.onUseMacroName"] = ["", CONST.ACTIVE_EFFECT_MODES.CUSTOM];
	specials["flags.midi-qol.optional.NAME.macroToCall"] = ["", CONST.ACTIVE_EFFECT_MODES.CUSTOM];
	if (configSettings.v3DamageApplication) {
		specials[`system.traits.dm.midi.all`] = ["", -1];
		specials[`system.traits.dm.midi.non-magical`] = ["", -1];
		specials[`system.traits.dm.midi.non-magical-physical`] = ["", -1];
		specials[`system.traits.dm.midi.non-silver-physical`] = ["", -1];
		specials[`system.traits.dm.midi.non-adamant-physical`] = ["", -1];
		specials[`system.traits.dm.midi.non-physical`] = ["", -1];
		specials[`system.traits.dm.midi.spell`] = ["", -1];
		specials[`system.traits.dm.midi.non-spell`] = ["", -1];
		specials[`system.traits.dm.midi.final`] = ["", -1];
		specials[`system.traits.idi.value`] = ["", -1];
		specials[`system.traits.idr.value`] = ["", -1];
		specials[`system.traits.idv.value`] = ["", -1];
		specials[`system.traits.ida.value`] = ["", -1];
		specials[`system.traits.idm.value`] = ["", -1];
	}
});
Hooks.on("dae.addFieldMappings", (fieldMappings) => {
	registerSettings();
	fetchParams();
	if (configSettings.v3DamageApplication) {
		//@ts-expect-error
		for (let key of Object.keys(game.system.config.damageTypes ?? {})) {
			fieldMappings[`flags.midi-qol.DR.${key}`] = `system.traits.dm.amount.${key}`;
			fieldMappings[`flags.midi-qol.absorption.${key}`] = `system.traits.da.value`;
		}
		//@ts-expect-error
		for (let key of Object.keys(game.system.config.healingTypes ?? {})) {
			fieldMappings[`flags.midi-qol.DR.${key}`] = `system.traits.dm.amount.${key}`;
			fieldMappings[`flags.midi-qol.absorption.${key}`] = `system.traits.da.value`;
		}
		fieldMappings["flags.midi-qol.DR.all"] = "system.traits.dm.midi.all";
		fieldMappings["flags.midi-qol.absorption.all"] = "system.traits.da.all";
		//@ts-expect-error
		Object.keys(game.system.config.itemActionTypes).forEach(aType => {
			fieldMappings[`flags.midi-qol.DR.${aType}`] = `system.traits.dm.midi.${aType}`;
		});
		fieldMappings[`flags.midi-qol.DR.all`] = `system.traits.dm.midi.all`;
		fieldMappings[`flags.midi-qol.DR.non-magical`] = `system.traits.dm.midi.non-magical`;
		fieldMappings[`flags.midi-qol.DR.non-magical-physical`] = `system.traits.dm.midi.non-magical-physical`;
		fieldMappings[`flags.midi-qol.DR.non-silver`] = `system.traits.dm.midi.non-silver-physical`;
		fieldMappings[`flags.midi-qol.DR.non-adamant`] = `system.traits.dm.midi.non-adamant-physical`;
		fieldMappings[`flags.midi-qol.DR.non-physical`] = `system.traits.dm.midi.non-physical`;
		fieldMappings[`flags.midi-qol.DR.non-spell`] = `system.traits.dm.midi.non-spell`;
		fieldMappings[`flags.midi-qol.DR.spell`] = `system.traits.dm.midi.spell`;
		fieldMappings[`flags.midi-qol.DR.final`] = `system.traits.dm.midi.final`;
		fieldMappings['flags.midi-qol.concentrationSaveBonus'] = "system.attributes.concentration.bonuses.save";
	}
});
/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
	// Do anything after initialization but before
	// ready
	setupSocket();
	fetchParams();
	fetchSoundSettings();
	itemPatching();
	visionPatching();
	setupModules();
	initGMActionSetup();
	patchLMRTFY();
	setupMidiFlags();
	setupHooks();
	undoDamageText = i18n("midi-qol.undoDamageFrom");
	savingThrowText = i18n("midi-qol.savingThrowText");
	savingThrowTextAlt = i18n("midi-qol.savingThrowTextAlt");
	MQdefaultDamageType = i18n("midi-qol.defaultDamageType");
	MQItemMacroLabel = i18n("midi-qol.ItemMacroText");
	if (MQItemMacroLabel === "midi-qol.ItemMacroText")
		MQItemMacroLabel = "ItemMacro";
	MQDeferMacroLabel = i18n("midi-qol.DeferText");
	if (MQDeferMacroLabel === "midi-qol.DeferText")
		MQDeferMacroLabel = "[Defer]";
	setupSheetQol();
	createMidiMacros();
	setupMidiQOLApi();
});
function addConfigOptions() {
	//@ts-expect-error
	let config = game.system.config;
	//@ts-expect-error
	const systemVersion = game.system.version;
	if (game.system.id === "dnd5e" || game.system.id === "n5e") {
		config.midiProperties = {};
		// Add additonal vision types? How to modify token properties doing this.
		config.midiProperties["confirmTargets"] = i18n("midi-qol.confirmTargetsProp");
		config.midiProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
		config.midiProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
		config.midiProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp");
		config.midiProperties["autoFailFriendly"] = i18n("midi-qol.FailFriendly");
		config.midiProperties["autoSaveFriendly"] = i18n("midi-qol.SaveFriendly");
		config.midiProperties["rollOther"] = i18n("midi-qol.rollOtherProp");
		config.midiProperties["critOther"] = i18n("midi-qol.otherCritProp");
		config.midiProperties["offHandWeapon"] = i18n("midi-qol.OffHandWeapon");
		config.midiProperties["magicdam"] = i18n("midi-qol.magicalDamageProp");
		config.midiProperties["magiceffect"] = i18n("midi-qol.magicalEffectProp");
		config.midiProperties["concentration"] = i18n("midi-qol.concentrationEffectProp");
		config.midiProperties["noConcentrationCheck"] = i18n("midi-qol.noConcentrationEffectProp");
		config.midiProperties["toggleEffect"] = i18n("midi-qol.toggleEffectProp");
		config.midiProperties["ignoreTotalCover"] = i18n("midi-qol.ignoreTotalCover");
		config.midiProperties["saveDamage"] = "Save Damage";
		config.midiProperties["bonusSaveDamage"] = "Bonus Damage Save";
		config.midiProperties["otherSaveDamage"] = "Other Damage Save";
		if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
			config.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg", toString: function () { return this.label; } };
			config.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg", toString: function () { return this.label; } };
		}
		else {
			config.damageTypes["none"] = i18n(`${SystemString}.None`);
			config.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
		}
		// sliver, adamant, spell, nonmagic, maic are all deprecated and should only appear as custom
		if (foundry.utils.isNewerVersion(systemVersion, "2.99") && configSettings.v3DamageApplication) {
			config.customDamageResistanceTypes = {
				"spell": i18n("midi-qol.spell-damage"),
				"nonmagic": i18n("midi-qol.NonMagical"),
				"magic": i18n("midi-qol.Magical")
			};
		}
		else {
			config.customDamageResistanceTypes = {
				"silver": i18n("midi-qol.NonSilverPhysical"),
				"adamant": i18n("midi-qol.NonAdamantinePhysical"),
				"spell": i18n("midi-qol.spell-damage"),
				"nonmagic": i18n("midi-qol.NonMagical"),
				"magic": i18n("midi-qol.Magical"),
				"physical": i18n("midi-qol.NonMagicalPhysical")
			};
		}
		if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
			config.damageResistanceTypes = {};
			if (!configSettings.v3DamageApplication) {
				config.damageResistanceTypes["silver"] = i18n("midi-qol.NonSilverPhysical");
				config.damageResistanceTypes["adamant"] = i18n("midi-qol.NonAdamantinePhysical");
				config.damageResistanceTypes["physical"] = i18n("midi-qol.NonMagicalPhysical");
			}
			config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
			config.damageResistanceTypes["nonmagic"] = i18n("midi-qol.NonMagical");
			config.damageResistanceTypes["magic"] = i18n("midi-qol.Magical");
			config.damageResistanceTypes["healing"] = config.healingTypes.healing;
			config.damageResistanceTypes["temphp"] = config.healingTypes.temphp;
		}
		else {
			config.damageResistanceTypes = {};
			config.damageResistanceTypes["silver"] = i18n("midi-qol.NonSilverPhysical");
			config.damageResistanceTypes["adamant"] = i18n("midi-qol.NonAdamantinePhysical");
			config.damageResistanceTypes["physical"] = i18n("midi-qol.NonMagicalPhysical");
			config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
			config.damageResistanceTypes["nonmagic"] = i18n("midi-qol.NonMagical");
			config.damageResistanceTypes["magic"] = i18n("midi-qol.Magical");
			config.damageResistanceTypes["healing"] = config.healingTypes.healing;
			config.damageResistanceTypes["temphp"] = config.healingTypes.temphp;
		}
		if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
			//@ts-expect-error
			game.system.config.traits.di.configKey = "damageTypes";
			//@ts-expect-error
			game.system.config.traits.dr.configKey = "damageTypes";
			//@ts-expect-error
			game.system.config.traits.dv.configKey = "damageTypes";
		}
		else if (foundry.utils.isNewerVersion(systemVersion, "2.0.3")) {
			//@ts-expect-error
			game.system.config.traits.di.configKey = "damageResistanceTypes";
			//@ts-expect-error
			game.system.config.traits.dr.configKey = "damageResistanceTypes";
			//@ts-expect-error
			game.system.config.traits.dv.configKey = "damageResistanceTypes";
		}
		const dnd5eReaction = `${SystemString}.Reaction`;
		config.abilityActivationTypes["reactionpreattack"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionPreAttack")}`;
		config.abilityActivationTypes["reactiondamage"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionDamaged")}`;
		config.abilityActivationTypes["reactionmanual"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionManual")}`;
	}
	else if (game.system.id === "sw5e") { // sw5e
		//@ts-expect-error
		config = CONFIG.SW5E;
		config.midiProperties = {};
		config.midiProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
		config.midiProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
		config.midiProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp");
		// config.midiProperties["rollOther"] = i18n("midi-qol.rollOtherProp");
		config.midiProperties["critOther"] = i18n("midi-qol.otherCritProp");
		config.midiProperties["concentration"] = i18n("midi-qol.concentrationActivationCondition");
		config.midiProperties["saveDamage"] = "Save Damage";
		config.midiProperties["bonusSaveDamage"] = "Bonus Damage Save";
		config.midiProperties["otherSaveDamage"] = "Other Damage Save";
		config.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
		config.abilityActivationTypes["reactiondamage"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionDamaged")}`;
		config.abilityActivationTypes["reactionmanual"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionManual")}`;
		config.customDamageResistanceTypes = {
			"spell": i18n("midi-qol.spell-damage"),
			"power": i18n("midi-qol.spell-damage"),
			"nonmagic": i18n("midi-qol.NonMagical"),
			"magic": i18n("midi-qol.Magical"),
			"physical": i18n("midi-qol.NonMagicalPhysical")
		};
	}
	if (configSettings.allowUseMacro) {
		config.characterFlags["DamageBonusMacro"] = {
			hint: i18n("midi-qol.DamageMacro.Hint"),
			name: i18n("midi-qol.DamageMacro.Name"),
			placeholder: "",
			section: i18n("midi-qol.DAEMidiQOL"),
			type: String
		};
	}
	;
}
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function () {
	//@ts-expect-error
	const config = game.system.config;
	addConfigOptions();
	allDamageTypes = {};
	allDamageTypes.none = foundry.utils.duplicate(config.damageTypes["midi-none"]);
	allDamageTypes.none.label = i18n(`${SystemString}.None`);
	allDamageTypes[""] = allDamageTypes.none;
	allDamageTypes = foundry.utils.mergeObject(allDamageTypes, foundry.utils.mergeObject(config.damageTypes, config.healingTypes, { inplace: false }));
	registerSettings();
	gameStats = new RollStats();
	actorAbilityRollPatching();
	//@ts-expect-error
	systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;
	if (!CONFIG.statusEffects.find(e => e.id === systemConcentrationId)) {
		//@ts-expect-error name
		CONFIG.statusEffects.push({ id: systemConcentrationId, name: i18n(`EFFECT.${SystemString}.StatusConcentrating`), icon: "systems/dnd5e/icons/svg/statuses/concentrating.svg", special: "CONCENTRATING" });
	}
	MQOnUseOptions = {
		"preTargeting": "Called before targeting is resolved (*)",
		"preItemRoll": "Called before the item is rolled (*)",
		"templatePlaced": "Only called once a template is placed",
		"preambleComplete": "After targeting complete",
		"preAttackRoll": "Before Attack Roll",
		"preCheckHits": "Before Check Hits",
		"postAttackRoll": "After Attack Roll",
		"preSave": "Before Save",
		"postSave": "After Save",
		"preDamageRoll": "Before Damage Roll",
		"postDamageRoll": "After Damage Roll",
		"damageBonus": "return a damage bonus",
		"preDamageApplication": "Before Damage Application",
		"preActiveEffects": "Before Active Effects",
		"postActiveEffects": "After Active Effects ",
		"isTargeted": "Target is targeted but before item is rolled",
		"isPreAttacked": "Target is about to be attacked, before reactions are checked",
		"isAttacked": "Target is attacked",
		"isHit": "Target is hit",
		"preTargetSave": "Target is about to roll a saving throw",
		"isSave": "Target rolled a save",
		"isSaveSuccess": "Target rolled a successful save",
		"isSaveFailure": "Target failed a saving throw",
		"preTargetDamageApplication": "Target is about to be damaged by an item",
		"postTargetEffectApplication": "Target has an effect applied by a rolled item",
		"isDamaged": "Target is damaged by an attack",
		"all": "All"
	};
	for (let key of Object.keys(Workflow.stateTable)) {
		const camelKey = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
		if (MQOnUseOptions[`pre${camelKey}`] === undefined) {
			MQOnUseOptions[`pre${camelKey}`] = `Before state ${camelKey}`;
		}
		else
			console.error(`midi-qol | pre${camelKey} already exists`);
		if (MQOnUseOptions[`post${camelKey}`] === undefined) {
			MQOnUseOptions[`post${camelKey}`] = `After state ${camelKey}`;
		}
		else
			console.error(`midi-qol | post${camelKey} already exists`);
	}
	OnUseMacroOptions.setOptions(MQOnUseOptions);
	globalThis.MidiQOL.MQOnUseOptions = MQOnUseOptions;
	MidiSounds.midiSoundsReadyHooks();
	if (game.system.id === "dnd5e") {
		//@ts-expect-error
		game.system.config.characterFlags["spellSniper"] = {
			name: "Spell Sniper",
			hint: "Spell Sniper",
			section: i18n("DND5E.Feats"),
			type: Boolean
		};
		//@ts-expect-error
		game.system.config.areaTargetTypes["squareRadius"] = { label: i18n("midi-qol.squareRadius"), template: "rect" };
		if (game.user?.isGM) {
			const instanceId = game.settings.get("midi-qol", "instanceId");
			//@ts-expect-error instanceId
			if ([undefined, ""].includes(instanceId)) {
				game.settings.set("midi-qol", "instanceId", foundry.utils.randomID());
			}
			const oldVersion = game.settings.get("midi-qol", "last-run-version");
			//@ts-expect-error version
			const newVersion = game.modules.get("midi-qol")?.version;
			//@ts-expect-error
			if (foundry.utils.isNewerVersion(newVersion, oldVersion)) {
				console.warn(`midi-qol | instance ${game.settings.get("midi-qol", "instanceId")} version change from ${oldVersion} to ${newVersion}`);
				game.settings.set("midi-qol", "last-run-version", newVersion);
				// look at sending a new version has been installed.
			}
			readySettingsSetup();
		}
	}
	if (game.user?.isGM) {
		if (installedModules.get("levelsautocover") && configSettings.optionalRules.coverCalculation === "levelsautocover" && !game.settings.get("levelsautocover", "apiMode")) {
			game.settings.set("levelsautocover", "apiMode", true);
			if (game.user?.isGM)
				ui.notifications?.warn("midi-qol | setting levels auto cover to api mode", { permanent: true });
		}
		else if (installedModules.get("levelsautocover") && configSettings.optionalRules.coverCalculation !== "levelsautocover" && game.settings.get("levelsautocover", "apiMode")) {
			ui.notifications?.warn("midi-qol | Levels Auto Cover is in API mode but midi is not using levels auto cover - you may wish to disable api mode", { permanent: true });
		}
	}
	//@ts-ignore game.version
	if (foundry.utils.isNewerVersion(game.version ? game.version : game.version, "0.8.9")) {
		const noDamageSavesText = i18n("midi-qol.noDamageonSaveSpellsv9");
		noDamageSaves = noDamageSavesText.split(",")?.map(s => s.trim()).map(s => cleanSpellName(s));
	}
	else {
		//@ts-ignore
		noDamageSaves = i18n("midi-qol.noDamageonSaveSpells")?.map(name => cleanSpellName(name));
	}
	checkModules();
	if (game.user?.isGM && configSettings.gmLateTargeting !== "none") {
		ui.notifications?.notify("Late Targeting has been replaced with Target Confirmation. Please update your settings", "info", { permanent: true });
		new TargetConfirmationConfig({}, {}).render(true);
		configSettings.gmLateTargeting = "none";
		game.settings.set("midi-qol", "ConfigSettings", configSettings);
	}
	if (!game.user?.isGM && game.settings.get("midi-qol", "LateTargeting") !== "none") {
		ui.notifications?.notify("Late Targeting has been replaced with Target Confirmation. Please update your settings", "info", { permanent: true });
		new TargetConfirmationConfig({}, {}).render(true);
		game.settings.set("midi-qol", "LateTargeting", "none");
	}
	readyHooks();
	readyPatching();
	if (midiSoundSettingsBackup)
		game.settings.set("midi-qol", "MidiSoundSettings-backup", midiSoundSettingsBackup);
	// Make midi-qol targets hoverable
	$(document).on("mouseover", ".midi-qol-target-name", (e) => {
		const tokenid = e.currentTarget.id;
		const tokenObj = canvas?.tokens?.get(tokenid);
		if (!tokenObj)
			return;
		//@ts-ignore
		tokenObj._hover = true;
	});
	if (installedModules.get("betterrolls5e")) {
		//@ts-ignore console:
		ui.notifications?.error("midi-qol automation disabled", { permanent: true, console: true });
		//@ts-ignore console:
		ui.notifications?.error("Please make sure betterrolls5e is disabled", { permanent: true, console: true });
		//@ts-ignore console:
		ui.notifications?.error("Until further notice better rolls is NOT compatible with midi-qol", { permanent: true, console: true });
		disableWorkflowAutomation();
		setTimeout(disableWorkflowAutomation, 2000);
	}
	Hooks.callAll("midi-qol.midiReady");
	if (installedModules.get("lmrtfy")
		//@ts-expect-error
		&& foundry.utils.isNewerVersion("3.1.8", game.modules.get("lmrtfy").version)
		//@ts-expect-error
		&& foundry.utils.isNewerVersion(game.system.version, "2.1.99")) {
		let abbr = {};
		for (let key in CONFIG[SystemString].abilities) {
			let abb = game.i18n.localize(CONFIG[SystemString].abilities[key].abbreviation);
			let upperFirstLetter = abb.charAt(0).toUpperCase() + abb.slice(1);
			abbr[`${abb}`] = `${SystemString}.Ability${upperFirstLetter}`;
		}
		//@ts-expect-error
		LMRTFY.saves = abbr;
		//@ts-expect-error
		LMRTFY.abilities = abbr;
		//@ts-expect-error
		LMRTFY.abilityModifiers = LMRTFY.parseAbilityModifiers();
	}
	if (game.user?.isGM) { // need to improve the test
		const problems = TroubleShooter.collectTroubleShooterData().problems;
		for (let problem of problems) {
			const message = `midi-qol ${problem.problemSummary} | Open TroubleShooter to fix`;
			if (problem.severity === "Error")
				ui.notifications?.error(message, { permanent: false });
			else
				console.warn(message);
		}
	}
});
import { setupMidiTests } from './module/tests/setupTest.js';
import { TargetConfirmationConfig } from './module/apps/TargetConfirmationConfig.js';
Hooks.once("midi-qol.midiReady", () => {
	setupMidiTests();
});
// Add any additional hooks if necessary
Hooks.on("monaco-editor.ready", (registerTypes) => {
	registerTypes("midi-qol/index.ts", `
const MidiQOL = {
	addRollTo: function addRollTo(roll: Roll, bonusRoll: Roll): Roll,
	addConcentration: async function addConcentration(actorRef: Actor | string, concentrationData: ConcentrationData): Promise<void>,
	addConcentrationDependent: async function addConcentrationDependent(actor: ActorRef, dependent, item?: Item),
	applyTokenDamage: async function applyTokenDamage(damageDetail, totalDamage, theTargets, item, saves, options: any = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }): Promise<any[]>,
	canSense: function canSense(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes: Array<string> = ["all"]): boolean,
	canSense: function canSee(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string): boolean,
	cansSenseModes: function canSenseModes(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes: Array<string> = ["all"]): Array<string>,
	checkDistance: function checkDistnce(tokenEntity1: Token | TokenDocument | string, tokenEntity2: Token | TokenDocument | string, distance: number, wallsBlock?: boolean): boolean,
	checkIncapacitated: function checkIncapacitated(actor: Actor, logResult?: true): boolean,
	checkNearby: function checkNearby(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, range: number): boolean,
	checkRange: function checkRange(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, range: number): boolean,
	checkRule: function checkRule(rule: string): boolean,
	completeItemUse: async function completeItemUse(item, config: any = {}, options: any = { checkGMstatus: false }),
	computeCoverBonus: function computeCoverBonus(attacker: Token | TokenDocument, target: Token | TokenDocument, item: any = undefined): number,
	computeDistance: function computeDistance(t1: Token, t2: Token, wallBlocking = false),
	configSettings: function configSettings(): any,
	contestedRoll: async function contestedRoll(data: {
	source: { rollType: string, ability: string, token: Token | TokenDocument | string, rollOptions: any },
	target: { rollType: string, ability: string, token: Token | TokenDocument | string, rollOptions: any },
	displayResults: boolean,
	itemCardId: string,
	flavor: string,
	rollOptions: any,
	success: (results) => {}, failure: (results) => {}, drawn: (results) => {}
	}): Promise<{ result: number | undefined, rolls: any[] }>,
	createConditionData: function createConditionData(data: { workflow?: Workflow | undefined, target?: Token | TokenDocument | undefined, actor?: Actor | undefined, item?: Item | string | undefined, extraData?: any }
	DamageOnlyWorkflow: class DamageOnlyWorkflow,
	debug: function debug(...args: any[]): void,
	displayDSNForRoll: async function displayDSNForRoll(roll: Roll | undefined, rollType: string | undefined, defaultRollMode: string | undefined = undefined),
	doMidiConcentrationCheck: async function doMidiConcentrationCheck(actor: Actor, saveDC),
	evalAllConditions: function evalAllConditions(actor: Actor | Token | TokenDocument | string, flagRef: string, conditionData: any, errorReturn: any = true): any,
	evalAllConditionsAsync: async unction evalAllConditions(actor: Actor | Token | TokenDocument | string, flagRef: string, conditionData: any, errorReturn: any = true): Promise<any>,
	evalCondition: function evalCondition(condition: string, conditionData: any, {errorReturn: any = true, async = false): any,
	findNearby(disposition: number | string | null | Array<string | number>, token: any /*Token | uuuidString */, distance: number, options: { maxSize: number | undefined, includeIncapacitated: boolean | undefined, canSee: boolean | undefined, isSeen: boolean | undefined, includeToken: boolean | undefined, relative: boolean | undefined } = { maxSize: undefined, includeIncapacitated: false, canSee: false, isSeen: false, includeToken: false, relative: true }): Token[];
	getCachedChatMessage()
	getChanges: function getChanges(actorOrItem: Actor | Item, key: string): any[],
	getConcentrationEffect: function getConcentrationEffect(actor: Actor): ActiveEffect | undefined,
	geti18nOptions: function geti18nOptions(key: string): any,
	geti18nTranslations: function geti18nTranslations(): any,
	getTokenForActor: function getTokenForActor(actor: Actor): Token | undefined,
	getTokenForActorAsSet: function getTokenForActorAsSet(actor: Actor): Set<Token>,
	getTokenPlayerName: function getTokenPlayerName(token: Token | TokenDocument | string): string,
	getTraitMult: function getTraitMult(actor: Actor, damageType: string, item: Item): number,
	hasCondition: function hasCondition(tokenRef: Token | TokenDocument | UUID, condition: string): boolean,
	hasUsedBonusAction: function hasUsedBonusAction(actor: Actor): boolean,
	hasUsedReaction: function hasUsedReaction(actor: Actor): boolean,
	incapacitatedConditions: string[],
	InvisibleDisadvantageVisionModes: string[],
	isTargetable: function isTargetable(token: Token | TokenDocument | UUID): boolean,
	TargetConfirmationDialog: class TargetConfirmationDialog,
	log: function log(...args: any[]): void,
	midiFlags: string[],
	midiRenderRoll: function midiRenderRoll(roll: Roll),
	midiRenderAttackRoll: function midiRenderAttackRoll(roll, options);
	midiRenderDamageRoll: function midiRenderDamageRoll(roll, options);
	midiRenderBonusDamageRoll: function midiRenderBonusDamageRoll(roll, options);
	midiRenderOtherDamageRoll: function midiRenderOtherDamageRoll(roll, options);
	midiSoundSettings: function(): any,
	MQfromActorUuid: function MQfromActorUuid(actorUuid: string): Actor | undefined,
	MQfromUuid: function MQfromUuid(uuid: string): Actor | Item | TokenDocument | undefined,
	MQOnUseOptions: any,
	overTimeJSONData: any,
	playerFor: function playerFor(target: TokenDocument | Token | undefined): User | undefined,
	playerForActor: function playerForActor(actor: Actor): User | undefined,
	raceOrType(entity: Token | Actor | TokenDocument | string): string,
	reactionDialog: class reactionDialog,
	typeOrRace(entity: Token | Actor | TokenDocument | string): string,
	reportMidiCriticalFlags: function reportMidiCriticalFlags(): void,
	resolveTargetConfirmation: async function resolveTargetConfirmation(targetConfirmation: any, item: Item, actor: Actor, token: Token, targets: any, options: any = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }): Promise<any[]>,
	safeGetGameSettings function safeGetGameSetting(module: string key: string): string | undefined,
	selectTargetsForTemplate: templateTokens,
	removeBonusActionUsed: function removeBonusActionUsed(actor: Actor): boolean,
	setBonusActionUsed: function setBonusActionUsed(actor: Actor): boolean,
	removeBonusActionUsed: function removeBonusActionUsed(actor: Actor): boolean,
	setReactionUsed: function setReactionUsed(actor: Actor): boolean,
	removeReactionUsed: function removeReactionUsed(actor: Actor): boolean,
	showItemInfo: async function showItemInfo(item: Item): void,
	showUndoQueue: function showUndoQueue(): void,
	showUndoWorkflowApp: function showUndoWorkflowApp(): void,
	socket: function socket(): SaferSocket,
	testfunc,
	tokenForActor: function tokenForActor(actor: Actor): Token | undefined,
	TrapWorkflow: class TrapWorkflow extends Workflow,
	TroubleShooter: class TroubleShooter,
	undoMostRecentWorkflow,
	validRollAbility: function validRollAbility(rollType: string, ability: string): string | undefined,
	WallsBlockConditions: string[],
	warn: function warn(...args: any[]): void,
	Workflow: class Workflow,
	moveToken: async function (tokenRef: Token | TokenDocument | UUID, newCenter: { x: number, y: number }, animate: boolean = true),
	moveTokenAwayFromPoint: async function (targetRef: Token | TokenDocument | UUID, distance: number, point: { x: number, y: number }, animate: boolean = true),
}
});

`);
}); // Backwards compatability
function setupMidiQOLApi() {
	//@ts-expect-error .detectionModes
	const detectionModes = CONFIG.Canvas.detectionModes;
	let InvisibleDisadvantageVisionModes = Object.keys(detectionModes)
		.filter(dm => !detectionModes[dm].imprecise);
	let WallsBlockConditions = [
		"burrow"
	];
	let humanoid = ["human", "humanoid", "elven", "elf", "half-elf", "drow", "dwarf", "dwarven", "halfling", "gnome", "tiefling", "orc", "dragonborn", "half-orc"];
	const Workflows = { "Workflow": Workflow, "DamageOnlyWorkflow": DamageOnlyWorkflow, "TrapWorkflow": TrapWorkflow, "DummyWorkflow": DummyWorkflow, "DDBGameLogWorkflow": DDBGameLogWorkflow };
	//@ts-ignore
	globalThis.MidiQOL = foundry.utils.mergeObject(globalThis.MidiQOL ?? {}, {
		addConcentration,
		addConcentrationDependent,
		addRollTo,
		addUndoChatMessage,
		applyTokenDamage,
		canSee,
		canSense,
		canSenseModes,
		checkIncapacitated,
		checkDistance,
		checkNearby,
		checkRange,
		checkRule,
		completeItemRoll,
		completeItemUse,
		computeCoverBonus,
		computeDistance: getDistanceSimple,
		ConfigPanel,
		configSettings: () => { return configSettings; },
		get currentConfigSettings() { return configSettings; },
		collectSettingData,
		contestedRoll,
		createConditionData,
		DamageOnlyWorkflow,
		debouncedUpdate,
		debug,
		displayDSNForRoll,
		doConcentrationCheck,
		doOverTimeEffect,
		evalAllConditions,
		evalCondition,
		DummyWorkflow,
		chooseEffect,
		enableWorkflow,
		findNearby,
		gameStats,
		getCachedChatMessage: getCachedDocument,
		getChanges,
		getConcentrationEffect,
		getDistance: getDistanceSimpleOld,
		geti18nOptions,
		geti18nTranslations,
		getTokenPlayerName,
		getTokenForActor,
		getTokenForActorAsSet,
		getTraitMult: getTraitMult,
		getUndoQueue,
		hasCondition,
		hasUsedBonusAction,
		hasUsedReaction,
		humanoid,
		incapacitatedConditions: ["incapacitated", "Convenient Effect: Incapacitated", "stunned", "Convenient Effect: Stunned", "paralyzed", "paralysis", "Convenient Effect: Paralyzed", "unconscious", "Convenient Effect: Unconscious", "dead", "Convenient Effect: Dead", "petrified", "Convenient Effect: Petrified"],
		InvisibleDisadvantageVisionModes,
		isTargetable,
		TargetConfirmationDialog,
		log,
		midiFlags,
		midiRenderRoll,
		midiRenderAttackRoll,
		midiRenderDamageRoll,
		midiRenderBonusDamageRoll,
		midiRenderOtherDamageRoll,
		midiSoundSettings: () => { return midiSoundSettings; },
		MQfromActorUuid,
		MQfromUuid,
		MQFromUuid: MQfromUuid,
		MQOnUseOptions,
		overTimeJSONData,
		playerFor,
		playerForActor,
		raceOrType,
		typeOrRace,
		reactionDialog,
		removeMostRecentWorkflow,
		reportMidiCriticalFlags,
		resolveTargetConfirmation,
		safeGetGameSetting,
		selectTargetsForTemplate: templateTokens,
		setBonusActionUsed,
		setReactionUsed,
		showItemInfo: (item) => { return showItemInfo.bind(item)(); },
		showUndoQueue,
		showUndoWorkflowApp,
		socket: () => { return new SaferSocket(socketlibSocket); },
		testfunc,
		tokenForActor,
		TrapWorkflow,
		TroubleShooter,
		undoMostRecentWorkflow,
		validRollAbility,
		WallsBlockConditions,
		warn,
		Workflow,
		Workflows,
		moveToken: async (tokenRef, newCenter, animate = true) => {
			const tokenUuid = getTokenDocument(tokenRef)?.uuid;
			if (tokenUuid)
				return untimedExecuteAsGM("moveToken", { tokenUuid, newCenter, animate });
		},
		moveTokenAwayFromPoint: async (targetRef, distance, point, animate = true) => {
			const targetUuid = getTokenDocument(targetRef)?.uuid;
			if (point && targetUuid && distance)
				return untimedExecuteAsGM("moveTokenAwayFromPoint", { targetUuid, distance, point, animate });
		}
	});
	globalThis.MidiQOL.actionQueue = new foundry.utils.Semaphore();
}
export function testfunc(scope) {
	console.warn("MidiQOL testfunc called ", scope);
}
// Minor-qol compatibility patching
function doRoll(event = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, type: "none" }, itemName, options = { type: "", versatile: false }) {
	error("doRoll is deprecated. Please use item.use() instead");
}
function setupMidiFlags() {
	//@ts-expect-error
	let config = game.system.config;
	//@ts-expect-error
	const systemVersion = game.system.version;
	midiFlags.push("flags.midi-qol.advantage.all");
	midiFlags.push("flags.midi-qol.disadvantage.all");
	midiFlags.push("flags.midi-qol.advantage.attack.all");
	midiFlags.push("flags.midi-qol.disadvantage.attack.all");
	midiFlags.push("flags.midi-qol.critical.all");
	midiFlags.push(`flags.midi-qol.max.damage.all`);
	midiFlags.push(`flags.midi-qol.min.damage.all`);
	midiFlags.push(`flags.midi-qol.grants.max.damage.all`);
	midiFlags.push(`flags.midi-qol.grants.min.damage.all`);
	midiFlags.push("flags.midi-qol.noCritical.all");
	midiFlags.push("flags.midi-qol.fail.all");
	midiFlags.push("flags.midi-qol.fail.attack.all");
	midiFlags.push("flags.midi-qol.success.attack.all");
	midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
	midiFlags.push("flags.midi-qol.grants.advantage.save.all");
	midiFlags.push("flags.midi-qol.grants.advantage.check.all");
	midiFlags.push("flags.midi-qol.grants.advantage.skill.all");
	midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
	midiFlags.push("flags.midi-qol.grants.disadvantage.save.all");
	midiFlags.push("flags.midi-qol.grants.disadvantage.check.all");
	midiFlags.push("flags.midi-qol.grants.disadvantage.skill.all");
	midiFlags.push(`flags.midi-qol.grants.fail.advantage.attack.all`);
	midiFlags.push(`flags.midi-qol.grants.fail.disadvantage.attack.all`);
	midiFlags.push(`flags.midi-qol.neverTarget`);
	// TODO work out how to do grants damage.max
	midiFlags.push(`flags.midi-qol.grants.attack.success.all`);
	midiFlags.push(`flags.midi-qol.grants.attack.fail.all`);
	midiFlags.push(`flags.midi-qol.grants.attack.bonus.all`);
	midiFlags.push(`flags.midi-qol.grants.critical.all`);
	midiFlags.push(`flags.midi-qol.grants.critical.range`);
	midiFlags.push('flags.midi-qol.grants.criticalThreshold');
	midiFlags.push(`flags.midi-qol.fail.critical.all`);
	midiFlags.push(`flags.midi-qol.advantage.concentration`);
	midiFlags.push(`flags.midi-qol.disadvantage.concentration`);
	midiFlags.push("flags.midi-qol.ignoreNearbyFoes");
	midiFlags.push("flags.midi-qol.");
	midiFlags.push(`flags.midi-qol.concentrationSaveBonus`);
	midiFlags.push(`flags.midi-qol.potentCantrip`);
	midiFlags.push(`flags.midi-qol.sculptSpells`);
	midiFlags.push(`flags.midi-qol.carefulSpells`);
	midiFlags.push("flags.midi-qol.magicResistance.all");
	midiFlags.push("flags.midi-qol.magicResistance.save.all");
	midiFlags.push("flags.midi-qol.magicResistance.check.all");
	midiFlags.push("flags.midi-qol.magicResistance.skill.all");
	midiFlags.push("flags.midi-qol.magicVulnerability.all");
	midiFlags.push("flags.midi-qol.rangeOverride.attack.all");
	midiFlags.push("flags.midi-qol.range.all");
	midiFlags.push("flags.midi-qol.long.all");
	let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"]);
	evalCondition;
	attackTypes.forEach(at => {
		midiFlags.push(`flags.midi-qol.range.${at}`);
		midiFlags.push(`flags.midi-qol.long.${at}`);
		midiFlags.push(`flags.midi-qol.advantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.disadvantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.fail.attack.${at}`);
		midiFlags.push(`flags.midi-qol.success.attack.${at}`);
		midiFlags.push(`flags.midi-qol.critical.${at}`);
		midiFlags.push(`flags.midi-qol.noCritical.${at}`);
		midiFlags.push(`flags.midi-qol.grants.advantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.grants.fail.advantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.grants.fail.disadvantage.attack.${at}`);
		midiFlags.push(`flags.midi-qol.grants.critical.${at}`);
		midiFlags.push(`flags.midi-qol.fail.critical.${at}`);
		midiFlags.push(`flags.midi-qol.grants.attack.bonus.${at}`);
		midiFlags.push(`flags.midi-qol.grants.attack.success.${at}`);
		if (at !== "heal")
			midiFlags.push(`flags.midi-qol.DR.${at}`);
		midiFlags.push(`flags.midi-qol.max.damage.${at}`);
		midiFlags.push(`flags.midi-qol.min.damage.${at}`);
		midiFlags.push(`flags.midi-qol.grants.max.damage.${at}`);
		midiFlags.push(`flags.midi-qol.grants.min.damage.${at}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.attack.${at}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.attack.fail.${at}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.damage.${at}`);
		midiFlags.push(`flags.midi-qol.rangeOverride.attack.${at}`);
	});
	midiFlags.push("flags.midi-qol.advantage.ability.all");
	midiFlags.push("flags.midi-qol.advantage.ability.check.all");
	midiFlags.push("flags.midi-qol.advantage.ability.save.all");
	midiFlags.push("flags.midi-qol.disadvantage.ability.all");
	midiFlags.push("flags.midi-qol.disadvantage.ability.check.all");
	midiFlags.push("flags.midi-qol.disadvantage.ability.save.all");
	midiFlags.push("flags.midi-qol.fail.ability.all");
	midiFlags.push("flags.midi-qol.fail.ability.check.all");
	midiFlags.push("flags.midi-qol.fail.ability.save.all");
	midiFlags.push("flags.midi-qol.superSaver.all");
	midiFlags.push("flags.midi-qol.semiSuperSaver.all");
	midiFlags.push("flags.midi-qol.max.ability.save.all");
	midiFlags.push("flags.midi-qol.max.ability.check.all");
	midiFlags.push("flags.midi-qol.max.ability.save.concentration");
	midiFlags.push("flags.midi-qol.min.ability.save.all");
	midiFlags.push("flags.midi-qol.min.ability.check.all");
	midiFlags.push("flags.midi-qol.min.ability.save.concentration");
	midiFlags.push("flags.midi-qol.sharpShooter");
	Object.keys(config.abilities).forEach(abl => {
		midiFlags.push(`flags.midi-qol.advantage.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol.disadvantage.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol.advantage.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol.disadvantage.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol.advantage.attack.${abl}`);
		midiFlags.push(`flags.midi-qol.disadvantage.attack.${abl}`);
		midiFlags.push(`flags.midi-qol.fail.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol.fail.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol.superSaver.${abl}`);
		midiFlags.push(`flags.midi-qol.semiSuperSaver.${abl}`);
		midiFlags.push(`flags.midi-qol.max.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol.min.ability.save.${abl}`);
		midiFlags.push(`flags.midi-qol.max.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol.min.ability.check.${abl}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.save.${abl}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.save.fail.${abl}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.check.${abl}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.check.fail.${abl}`);
		midiFlags.push(`flags.midi-qol.magicResistance.${abl}`);
		midiFlags.push(`flags.midi-qol.magicVulnerability.all.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.advantage.save.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.advantage.check.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.advantage.skill.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.disadvantage.save.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.disadvantage.check.${abl}`);
		midiFlags.push(`flags.midi-qol.grants.disadvantage.skill.${abl}`);
	});
	midiFlags.push(`flags.midi-qol.advantage.skill.all`);
	midiFlags.push(`flags.midi-qol.disadvantage.skill.all`);
	midiFlags.push(`flags.midi-qol.fail.skill.all`);
	midiFlags.push("flags.midi-qol.max.skill.all");
	midiFlags.push("flags.midi-qol.min.skill.all");
	Object.keys(config.skills).forEach(skill => {
		midiFlags.push(`flags.midi-qol.advantage.skill.${skill}`);
		midiFlags.push(`flags.midi-qol.disadvantage.skill.${skill}`);
		midiFlags.push(`flags.midi-qol.fail.skill.${skill}`);
		midiFlags.push(`flags.midi-qol.max.skill.${skill}`);
		midiFlags.push(`flags.midi-qol.min.skill.${skill}`);
		midiFlags.push(`flags.midi-qol.optional.NAME.skill.${skill}`);
	});
	midiFlags.push(`flags.midi-qol.advantage.deathSave`);
	midiFlags.push(`flags.midi-qol.disadvantage.deathSave`);
	if (game.system.id === "dnd5e") {
		// fix for translations
		["vocal", "somatic", "material"].forEach(comp => {
			midiFlags.push(`flags.midi-qol.fail.spell.${comp.toLowerCase()}`);
		});
		midiFlags.push(`flags.midi-qol.DR.all`);
		midiFlags.push(`flags.midi-qol.DR.non-magical`);
		midiFlags.push(`flags.midi-qol.DR.non-magical-physical`);
		midiFlags.push(`flags.midi-qol.DR.non-silver`);
		midiFlags.push(`flags.midi-qol.DR.non-adamant`);
		midiFlags.push(`flags.midi-qol.DR.non-physical`);
		midiFlags.push(`flags.midi-qol.DR.final`);
		midiFlags.push(`flags.midi-qol.damage.reroll-kh`);
		midiFlags.push(`flags.midi-qol.damage.reroll-kl`);
		if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
			Object.keys(config.damageTypes).forEach(key => {
				midiFlags.push(`flags.midi-qol.DR.${key}`);
				// TODO dbd3 - see how to present label but check key  midiFlags.push(`flags.midi-qol.DR.${config.damageTypes[key].label}`);
			});
		}
		else {
			Object.keys(config.damageTypes).forEach(dt => {
				midiFlags.push(`flags.midi-qol.DR.${dt}`);
			});
		}
		midiFlags.push(`flags.midi-qol.DR.healing`);
		midiFlags.push(`flags.midi-qol.DR.temphp`);
	}
	else if (game.system.id === "sw5e") {
		midiFlags.push(`flags.midi-qol.DR.all`);
		midiFlags.push(`flags.midi-qol.DR.final`);
		Object.keys(config.damageResistanceTypes).forEach(dt => {
			midiFlags.push(`flags.midi-qol.DR.${dt}`);
		});
		midiFlags.push(`flags.midi-qol.DR.healing`);
		midiFlags.push(`flags.midi-qol.DR.temphp`);
	}
	midiFlags.push(`flags.midi-qol.optional.NAME.attack.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.attack.fail.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.damage.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.check.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.save.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.check.fail.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.save.fail.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.label`);
	midiFlags.push(`flags.midi-qol.optional.NAME.skill.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.skill.fail.all`);
	midiFlags.push(`flags.midi-qol.optional.NAME.count`);
	midiFlags.push(`flags.midi-qol.optional.NAME.countAlt`);
	midiFlags.push(`flags.midi-qol.optional.NAME.ac`);
	midiFlags.push(`flags.midi-qol.optional.NAME.criticalDamage`);
	midiFlags.push(`flags.midi-qol.uncanny-dodge`);
	midiFlags.push(`flags.midi-qol.OverTime`);
	midiFlags.push("flags.midi-qol.inMotion");
	//@ts-ignore
	const damageTypes = Object.keys(config.damageTypes);
	for (let key of damageTypes) {
		midiFlags.push(`flags.midi-qol.absorption.${key}`);
	}
	midiFlags.push("flags.midi-qol.fail.disadvantage.heavy");
	/*
	midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
	midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
	midiFlags.push(``);

	midiFlags.push(``);
	midiFlags.push(``);
	*/
	if (installedModules.get("dae")) {
		const initDAE = async () => {
			for (let i = 0; i < 100; i++) {
				if (globalThis.DAE) {
					globalThis.DAE.addAutoFields(midiFlags);
					return true;
				}
				else {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}
			return false;
		};
		initDAE().then(value => { if (!value)
			console.error(`midi-qol | initDae settings failed`); });
	}
}
// Revisit to find out how to set execute as GM
const MQMacros = [
	{
		name: "MidiQOL.showTroubleShooter",
		checkVersion: true,
		version: "11.0.9",
		permission: { default: 1 },
		commandText: `
	new MidiQOL.TroubleShooter().render(true)`
	},
	{
		name: "MidiQOL.exportTroubleShooterData",
		checkVersion: true,
		version: "11.0.9.1",
		permission: { default: 1 },
		commandText: `MidiQOL.TroubleShooter.exportTroubleShooterData()`
	},
	{
		name: "MidiQOL.GMShowPlayerDamageCards",
		checkVersion: true,
		version: "11.4.10",
		commandText: `
	const matches = document.querySelectorAll(".midi-qol-player-damage-card");
	matches.forEach(element => {
	let target = element.parentElement.parentElement.parentElement;
	target.style.display = "inherit";
	})`
	}
];
export async function createMidiMacros() {
	const midiVersion = "11.0.9";
	if (game?.user?.isGM) {
		for (let macroSpec of MQMacros) {
			try {
				let existingMacros = game.macros?.filter(m => m.name === macroSpec.name) ?? [];
				if (existingMacros.length > 0) {
					for (let macro of existingMacros) {
						if (macroSpec.checkVersion
							//@ts-expect-error .flags
							&& !foundry.utils.isNewerVersion(macroSpec.version, (macro.flags["midi-version"] ?? "0.0.0")))
							continue; // already up to date
						await macro.update({
							command: macroSpec.commandText,
							"flags.midi-version": macroSpec.version
						});
					}
				}
				else {
					const macroData = {
						_id: null,
						name: macroSpec.name,
						type: "script",
						author: game.user.id,
						img: 'icons/svg/dice-target.svg',
						scope: 'global',
						command: macroSpec.commandText,
						folder: null,
						sort: 0,
						permission: {
							default: 1,
						},
						flags: { "midi-version": macroSpec.version ?? "midiVersion" }
					};
					//@ts-expect-error
					await Macro.createDocuments([macroData]);
					log(`Macro ${macroData.name} created`);
				}
			}
			catch (err) {
				const message = `createMidiMacros | falied to create macro ${macroSpec.name}`;
				TroubleShooter.recordError(err, message);
				error(err, message);
			}
		}
	}
}
const midiOldErrorHandler = globalThis.onerror;
function midiOnerror(event, source, lineno, colno, error) {
	console.warn("midi-qol detected error", event, source, lineno, colno, error);
	TroubleShooter.recordError(error, "uncaught global error");
	if (midiOldErrorHandler)
		return midiOldErrorHandler(event, source, lineno, colno, error);
	return false;
}
// globalThis.onerror = midiOnerror;
