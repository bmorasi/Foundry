import { warn, error, debug, i18n, debugEnabled, overTimeEffectsToDelete, allAttackTypes, failedSaveOverTimeEffectsToDelete, geti18nOptions, log, GameSystemConfig, SystemString } from "../midi-qol.js";
import { colorChatMessageHandler, nsaMessageHandler, hideStuffHandler, processItemCardCreation, hideRollUpdate, hideRollRender, onChatCardAction, processCreateDDBGLMessages, ddbglPendingHook, checkOverTimeSaves } from "./chatMessageHandling.js";
import { processUndoDamageCard } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, MQfromUuid, getConcentrationEffect, removeReactionUsed, removeBonusActionUsed, checkflanking, expireRollEffect, doConcentrationCheck, removeActionUsed, getReactionEffect, getBonusActionEffect, expirePerTurnBonusActions, itemIsVersatile, getCachedDocument, getUpdatesCache, clearUpdatesCache, expireEffects, createConditionData, processConcentrationSave, evalAllConditions, doSyncRoll } from "./utils.js";
import { activateMacroListeners } from "./apps/Item.js";
import { checkMechanic, checkRule, configSettings, dragDropTargeting, safeGetGameSetting } from "./settings.js";
import { checkWounded, checkDeleteTemplate, preUpdateItemActorOnUseMacro, removeConcentrationEffects, zeroHPExpiry, canRemoveConcentration, deathSaveHook } from "./patching.js";
import { preItemUsageConsumptionHook, preRollDamageHook, showItemInfo } from "./itemhandling.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { Workflow } from "./workflow.js";
import { ActorOnUseMacrosConfig } from "./apps/ActorOnUseMacroConfig.js";
import { installedModules } from "./setupModules.js";
export const concentrationCheckItemName = "Concentration Check - Midi QOL";
export var concentrationCheckItemDisplayName = "Concentration Check";
export var midiFlagTypes = {};
export let readyHooks = async () => {
	// need to record the damage done since it is not available in the update actor hook
	Hooks.on("preUpdateActor", (actor, update, options, user) => {
		const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
		const temphpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.temp");
		let concHPDiff = 0;
		if (!options.noConcentrationCheck && configSettings.concentrationAutomation) {
			if (hpUpdate !== undefined) {
				let hpChange = actor.system.attributes.hp.value - hpUpdate;
				// if (hpUpdate >= (actor.system.attributes.hp.tempmax ?? 0) + actor.system.attributes.hp.max) hpChange = 0;
				if (hpChange > 0)
					concHPDiff += hpChange;
			}
			if (configSettings.tempHPDamageConcentrationCheck && temphpUpdate !== undefined) {
				let temphpDiff = actor.system.attributes.hp.temp - temphpUpdate;
				if (temphpDiff > 0)
					concHPDiff += temphpDiff;
			}
			foundry.utils.setProperty(update, "flags.midi-qol.concentration-damage", concHPDiff);
		}
		return true;
	});
	// Handle removing effects when the token is moved.
	Hooks.on("updateToken", (tokenDocument, update, diff, userId) => {
		if (game.user?.id !== userId)
			return;
		if ((update.x || update.y) === undefined)
			return;
		const actor = tokenDocument.actor;
		const expiredEffects = actor?.effects.filter(ef => {
			const specialDuration = foundry.utils.getProperty(ef, "flags.dae.specialDuration");
			return specialDuration?.includes("isMoved");
		}) ?? [];
		if (expiredEffects.length > 0)
			expireEffects(actor, expiredEffects, { "expiry-reason": "midi-qol:isMoved" });
	});
	/*
	Hooks.on("template3dUpdatePreview", (at, t) => {
	//@ts-expect-error Volumetrictemplates
	VolumetricTemplates.compute3Dtemplate(t);
	});
	*/
	Hooks.on("targetToken", foundry.utils.debounce(checkflanking, 150));
	Hooks.on("ddb-game-log.pendingRoll", (data) => {
		ddbglPendingHook(data);
	});
	Hooks.on("preUpdateChatMessage", (message, update, options, user) => {
		try {
			if (!getCachedDocument(message.uuid))
				return true;
			const cachedUpdates = getUpdatesCache(message.uuid);
			clearUpdatesCache(message.uuid);
			// hideStuffHandler(message, $(message.content), user);
			//@ts-expect-error
			if (!foundry.utils.isEmpty(cachedUpdates)) {
				if (debugEnabled > 0)
					warn("preUpdateChatMessage inserting updates", message.uuid, update, cachedUpdates);
				Object.keys(cachedUpdates).forEach(key => {
					if (!foundry.utils.getProperty(update, key))
						foundry.utils.setProperty(update, key, cachedUpdates[key]);
				});
			}
			return true;
		}
		finally {
			return true;
		}
	});
	Hooks.on("deleteMeasuredTemplate", checkDeleteTemplate);
	// Handle updates to the characters HP
	// Handle concentration checks
	Hooks.on("updateActor", async (actor, update, options, user) => {
		if (user !== game.user?.id)
			return;
		const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
		const temphpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.temp");
		const vitalityResource = checkRule("vitalityResource");
		const vitalityUpdate = typeof vitalityResource === "string" ? foundry.utils.getProperty(update, vitalityResource) : undefined;
		if (hpUpdate !== undefined || temphpUpdate !== undefined || vitalityUpdate !== undefined) {
			let hpDiff = foundry.utils.getProperty(actor, "flags.midi-qol.concentration-damage") ?? 0;
			const hpUpdateFunc = async () => {
				await checkWounded(actor, update, options, user);
				await zeroHPExpiry(actor, update, options, user);
			};
			// if (globalThis.DAE?.actionQueue && !globalThis.DAE.actionQueue.remaining) await globalThis.DAE.actionQueue.add(hpUpdateFunc);
			// else await hpUpdateFunc();
			await hpUpdateFunc();
			if (!safeGetGameSetting("dnd5e", "disableConcentration") && !options.noConcentrationCheck && hpDiff > 0) {
				if (actor.system.attributes.hp.value <= 0 && configSettings.removeConcentration) {
					await actor.endConcentration();
				}
			}
			else if (configSettings.concentrationAutomation && hpDiff > 0 && !options.noConcentrationCheck) {
				const concentrationEffect = getConcentrationEffect(actor);
				if (concentrationEffect) {
					if (actor.system.attributes.hp.value <= 0 && configSettings.removeConcentration) {
						if (globalThis.DAE?.actionQueue)
							globalThis.DAE.actionQueue.add(concentrationEffect.delete.bind(concentrationEffect));
						else
							await concentrationEffect.delete();
					}
					else if (configSettings.doConcentrationCheck) {
						const saveDC = Math.max(10, Math.floor(hpDiff / 2));
						if (globalThis.DAE?.actionQueue)
							globalThis.DAE.actionQueue.add(doConcentrationCheck, actor, saveDC);
						else
							await doConcentrationCheck(actor, saveDC);
					}
				}
			}
		}
		return true;
	});
	Hooks.on("renderActorArmorConfig", (app, html, data) => {
		if (!["none", undefined, false].includes(checkRule("challengeModeArmor"))) {
			const ac = data.ac;
			const element = html.find(".stacked"); // TODO do this better
			let ARHtml = $(`<div>EC: ${ac.EC}</div><div>AR: ${ac.AR}</div>`);
			element.append(ARHtml);
		}
	});
	// Handle removal of concentration
	Hooks.on("deleteActiveEffect", (...args) => {
		let [deletedEffect, options, user] = args;
		if (options.undo)
			return; // TODO check that this is right
		const checkConcentration = configSettings.concentrationAutomation;
		//@ts-expect-error activeGM
		if (!game.users?.activeGM?.isSelf)
			return;
		if (!(deletedEffect.parent instanceof CONFIG.Actor.documentClass))
			return;
		if (debugEnabled > 0)
			warn("deleteActiveEffectHook", deletedEffect, deletedEffect.parent.name, options);
		const isConcentration = foundry.utils.getProperty(deletedEffect, "flags.midi-qol.isConcentration") ?? false;
		async function changefunc() {
			try {
				//@ts-expect-error
				let origin = fromUuidSync(deletedEffect.origin);
				if (origin instanceof ActiveEffect && !options.noConcentrationCheck && configSettings.removeConcentrationEffects !== "none" && !safeGetGameSetting("dnd5e", "disableConcentration")) {
					//@ts-expect-error
					if ((origin.getFlag("dnd5e", "dependents")) && origin.getDependents().length === 0) {
						origin = await fromUuid(deletedEffect.origin);
						if (!installedModules.get("times-up") || origin.duration.remaining > 0) {
							if (debugEnabled > 0)
								warn(`Removing origin ${origin.name} (${origin.duration.remaining}) for deleted effect ${deletedEffect.name}`);
							await origin.delete();
						}
					}
				}
				else if (isConcentration && checkConcentration) {
					if (!options.noConcentrationCheck)
						removeConcentrationEffects(deletedEffect.parent, deletedEffect.uuid, foundry.utils.mergeObject(options, { noConcentrationCheck: true }));
				}
				else {
					if (origin instanceof ActiveEffect) { // created by dnd5e
						origin = origin.parent;
					}
					if (checkConcentration && !options.noConcentrationCheck && origin instanceof CONFIG.Item.documentClass && origin.parent instanceof CONFIG.Actor.documentClass) {
						const concentrationData = foundry.utils.getProperty(origin, "parent.flags.midi-qol.concentration-data");
						if (concentrationData && deletedEffect.origin === concentrationData.uuid && canRemoveConcentration(concentrationData, deletedEffect.uuid)) {
							removeConcentrationEffects(origin.parent, deletedEffect.uuid, foundry.utils.mergeObject(options, { noConcentrationCheck: true }));
						}
					}
				}
				if (getReactionEffect() && deletedEffect.name === getReactionEffect()?.name && deletedEffect.parent instanceof CONFIG.Actor.documentClass) {
					// TODO see if this can massaged into a single transaction
					await deletedEffect.parent?.unsetFlag("midi-qol", "actions.reactionCombatRound");
					await deletedEffect.parent?.setFlag("midi-qol", "actions.reaction", false);
				}
				if (getBonusActionEffect() && deletedEffect.name === getBonusActionEffect()?.name && deletedEffect.parent instanceof CONFIG.Actor.documentClass) {
					// TODO see if this can massaged into a single transaction
					await deletedEffect.parent.setFlag("midi-qol", "actions.bonus", false);
					await deletedEffect.parent.unsetFlag("midi-qol", "actions.bonusActionCombatRound");
				}
				return true;
			}
			catch (err) {
				console.warn("Error in deleteActiveEffect", err, deletedEffect, options);
				return true;
			}
		}
		// if (globalThis.DAE?.actionQueue) globalThis.DAE.actionQueue.add(changefunc);
		return changefunc();
	});
	// Hooks.on("restCompleted", restManager); I think this means 1.6 is required.
	Hooks.on("dnd5e.restCompleted", restManager);
	Hooks.on("dnd5e.preItemUsageConsumption", preItemUsageConsumptionHook);
	Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
		if (rollConfig.fastForward && rollConfig.dialogOptions.babonus?.optionals?.length)
			rollConfig.fastForward = false;
	});
	Hooks.on("dnd5e.preRollDamage", (item, rollConfig) => {
		if (rollConfig.fastForward && rollConfig.dialogOptions.babonus?.optionals?.length)
			rollConfig.fastForward = false;
		if ((item.parent instanceof Actor && item.type === "spell")) {
			const actor = item.parent;
			const actorSpellBonus = foundry.utils.getProperty(actor, "system.bonuses.spell.all.damage");
			if (actorSpellBonus)
				rollConfig.rollConfigs[0].parts.push(actorSpellBonus);
		}
		return preRollDamageHook(item, rollConfig);
	});
	// Hooks.on("dnd5e.rollDamage", rollDamageMacro);
	Hooks.on("updateCombat", (combat, update, options, userId) => {
		if (userId !== game.user?.id)
			return;
		if (!update.hasOwnProperty("round"))
			return;
		if (!checkMechanic("autoRerollInitiative"))
			return;
		let combatantIds = combat.combatants.map(c => c.id);
		if (combat.combatants?.size > 0) {
			combat.rollInitiative(combatantIds, { updateTurn: true }).then(() => combat.update({ turn: 0 }));
		}
	});
	// Hooks.on("dnd5e.preRollDeathSave", preRollDeathSaveHook);
	Hooks.on("dnd5e.rollDeathSave", deathSaveHook);
	// Concentration Check is rolled as an item roll so we need an item.
	itemJSONData.name = concentrationCheckItemName;
};
export function restManager(actor, result) {
	if (!actor || !result)
		return;
	removeReactionUsed(actor); // remove reaction used for a rest
	removeBonusActionUsed(actor);
	removeActionUsed(actor);
	const myExpiredEffects = actor.effects.filter(ef => {
		const specialDuration = foundry.utils.getProperty(ef, "flags.dae.specialDuration");
		return specialDuration && ((result.longRest && specialDuration.includes(`longRest`))
			|| (result.newDay && specialDuration.includes(`newDay`))
			|| specialDuration.includes(`shortRest`));
	});
	if (myExpiredEffects?.length > 0)
		expireEffects(actor, myExpiredEffects, { "expiry-reason": "midi-qol:rest" });
}
export function initHooks() {
	if (debugEnabled > 0)
		warn("Init Hooks processing");
	Hooks.on("preCreateChatMessage", (message, data, options, user) => {
		if (debugEnabled > 1)
			debug("preCreateChatMessage entering", message, data, options, user);
		nsaMessageHandler(message, data, options, user);
		checkOverTimeSaves(message, data, options, user);
		return true;
	});
	Hooks.on("createChatMessage", (message, options, user) => {
		if (debugEnabled > 1)
			debug("Create Chat Message ", message.id, message, options, user);
		processItemCardCreation(message, user);
		processCreateDDBGLMessages(message, options, user);
		return true;
	});
	Hooks.on("updateChatMessage", (message, update, options, user) => {
		hideRollUpdate(message, update, options, user);
		//@ts-ignore scrollBottom
		ui.chat?.scrollBottom();
	});
	Hooks.on("updateCombat", (combat, data, options, user) => {
		if (data.round === undefined && data.turn === undefined)
			return;
		untargetAllTokens(combat, data.options, user);
		untargetDeadTokens();
		// updateReactionRounds(combat, data, options, user); This is handled in processOverTime
	});
	Hooks.on("renderChatMessage", (message, html, data) => {
		if (debugEnabled > 1)
			debug("render message hook ", message.id, message, html, data);
		// chatDamageButtons(message, html, data); This no longer works since the html is rewritten
		processUndoDamageCard(message, html, data);
		colorChatMessageHandler(message, html, data);
		hideRollRender(message, html, data);
		hideStuffHandler(message, html, data);
		processConcentrationSave(message, html, data);
	});
	Hooks.on("deleteChatMessage", (message, options, user) => {
		if (message.user.id !== game.user?.id)
			return;
		const workflowId = foundry.utils.getProperty(message, "flags.midi-qol.workflowId");
		if (workflowId && Workflow.getWorkflow(workflowId))
			Workflow.removeWorkflow(workflowId);
	});
	Hooks.on("midi-qol.RollComplete", async (workflow) => {
		const wfuuid = workflow.uuid;
		if (failedSaveOverTimeEffectsToDelete[wfuuid]) {
			if (workflow.saves.size === 1 || !workflow.hasSave) {
				//@ts-expect-error
				let effect = fromUuidSync(failedSaveOverTimeEffectsToDelete[wfuuid].uuid);
				expireEffects(effect.parent, [effect], { "expiry-reason": "midi-qol:overTime" });
			}
			delete failedSaveOverTimeEffectsToDelete[wfuuid];
		}
		if (overTimeEffectsToDelete[wfuuid]) {
			//@ts-expect-error
			let effect = fromUuidSync(overTimeEffectsToDelete[wfuuid].uuid);
			expireEffects(effect.parent, [effect], { "expiry-reason": "midi-qol:overTime" });
			delete overTimeEffectsToDelete[wfuuid];
		}
		if (debugEnabled > 1)
			debug("Finished the roll", wfuuid);
	});
	setupMidiFlagTypes();
	Hooks.on("applyActiveEffect", midiCustomEffect);
	// Hooks.on("preCreateActiveEffect", checkImmunity); Disabled in lieu of having effect marked suppressed
	Hooks.on("preUpdateItem", preUpdateItemActorOnUseMacro);
	Hooks.on("preUpdateActor", preUpdateItemActorOnUseMacro);
	Hooks.on("combatRound", expirePerTurnBonusActions);
	Hooks.on("combatTurn", expirePerTurnBonusActions);
	Hooks.on("updateCombatant", (combatant, updates, options, user) => {
		if (game?.user?.id !== user)
			return true;
		if (combatant.actor && updates.initiative)
			expireRollEffect.bind(combatant.actor)("Initiative", "none");
		return true;
	});
	function getItemSheetData(data, item) {
		const config = GameSystemConfig;
		const midiProps = config.midiProperties;
		if (!item) {
			const message = "item not defined in getItemSheetData";
			console.error(message, data);
			TroubleShooter.recordError(new Error(message));
			return;
		}
		let autoTargetOptions = foundry.utils.mergeObject({ "default": i18n("midi-qol.MidiSettings") }, geti18nOptions("autoTargetOptions"));
		let RemoveAttackDamageButtonsOptions = foundry.utils.mergeObject({ "default": i18n("midi-qol.MidiSettings") }, geti18nOptions("removeButtonsOptions"));
		//@ts-expect-error
		const ceForItem = game.dfreds?.effects?.all.find(e => e.name === item.name);
		data = foundry.utils.mergeObject(data, {
			allowUseMacro: configSettings.allowUseMacro,
			MacroPassOptions: Workflow.allMacroPasses,
			showCEOff: false,
			showCEOn: false,
			hasOtherDamage: ![undefined, ""].includes(item.system.formula) || (item.system.damage?.versatile && !item.system.properties?.has("ver")),
			showHeader: !configSettings.midiFieldsTab,
			midiPropertyLabels: midiProps,
			SaveDamageOptions: geti18nOptions("SaveDamageOptions"),
			ConfirmTargetOptions: geti18nOptions("ConfirmTargetOptions"),
			AoETargetTypeOptions: geti18nOptions("AoETargetTypeOptions"),
			AutoTargetOptions: autoTargetOptions,
			RemoveAttackDamageButtonsOptions,
			hasReaction: item.system.activation?.type?.includes("reaction")
		});
		if (!foundry.utils.getProperty(item, "flags.midi-qol.autoTarget")) {
			foundry.utils.setProperty(data, "flags.midi-qol.autoTarget", "default");
		}
		if (!foundry.utils.getProperty(item, "flags.midi-qol.removeAttackDamageButtons")) {
			foundry.utils.setProperty(data, "flags.midi-qol.removeAttackDamageButtons", "default");
		}
		if (ceForItem) {
			data.showCEOff = ["both", "cepri", "itempri"].includes(configSettings.autoCEEffects);
			data.showCEOn = ["none", "itempri"].includes(configSettings.autoCEEffects);
		}
		if (item.hasAreaTarget) {
			if (!foundry.utils.getProperty(item, "flags.midi-qol.AoETargetType")) {
				foundry.utils.setProperty(data, "flags.midi-qol.AoETargetType", "any");
				foundry.utils.setProperty(item, "flags.midi-qol.AoETargetType", "any");
			}
			if (foundry.utils.getProperty(item, "flags.midi-qol.AoETargetTypeIncludeSelf") === undefined) {
				foundry.utils.setProperty(data, "flags.midi-qol.AoETargetTypeIncludeSelf", true);
				foundry.utils.setProperty(item, "flags.midi-qol.AoETargetTypeIncludeSelf", true);
			}
		}
		foundry.utils.setProperty(data, "flags.midiProperties", item.flags?.midiProperties ?? {});
		if (["spell", "feat", "weapon", "consumable", "equipment", "power", "maneuver"].includes(item?.type)) {
			for (let prop of Object.keys(midiProps)) {
				if (item.system.properties?.has(prop)
					&& foundry.utils.getProperty(item, `flags.midiProperties.${prop}`) === undefined) {
					foundry.utils.setProperty(item, `flags.midiProperties.${prop}`, true);
				}
				else if (foundry.utils.getProperty(item, `flags.midiProperties.${prop}`) === undefined) {
					if (["saveDamage", "confirmTargets", "otherSaveDamage", "bonusSaveDamage"].includes(prop)) {
						foundry.utils.setProperty(data, `flags.midiProperties.${prop}`, "default");
					}
					else
						foundry.utils.setProperty(data, `flags.midiProperties.${prop}`, false);
				}
			}
			if (!foundry.utils.getProperty(data, "flags.midi-qol.rollAttackPerTarget"))
				foundry.utils.setProperty(data, "flags.midi-qol.rollAttackPerTarget", "default");
			if (item.system.formula !== "" || (item.system.damage?.versatile && !item.system.properties?.has("ver"))) {
				if (data.flags.midiProperties?.fulldam !== undefined && !data.flags.midiProperties["otherSaveDamage"]) {
					if (data.flags.midiProperties?.fulldam)
						data.flags.midiProperties["otherSaveDamage"] = "fulldam";
				}
				if (data.flags.midiProperties?.halfdam !== undefined && !data.flags.midiProperties["otherSaveDamage"]) {
					if (data.flags.midiProperties?.halfdam)
						data.flags.midiProperties["otherSaveDamage"] = "halfdam";
				}
				if (data.flags.midiProperties?.nodam !== undefined && !data.flags.midiProperties["otherSaveDamage"]) {
					if (data.flags.midiProperties?.nodam)
						data.flags.midiProperties["otherSaveDamage"] = "nodam";
				}
			}
			else {
				// Migrate existing saving throw damage multipliers to the new saveDamage
				if (data.flags.midiProperties?.fulldam !== undefined && !data.flags.midiProperties["saveDamage"]) {
					if (data.flags.midiProperties?.fulldam)
						data.flags.midiProperties["saveDamage"] = "fulldam";
				}
				if (data.flags.midiProperties?.halfdam !== undefined && !data.flags.midiProperties["saveDamage"]) {
					if (data.flags.midiProperties?.halfdam)
						data.flags.midiProperties["saveDamage"] = "halfdam";
				}
				if (data.flags.midiProperties?.nodam !== undefined && !data.flags.midiProperties["saveDamage"]) {
					if (data.flags.midiProperties?.nodam)
						data.flags.midiProperties["saveDamage"] = "nodam";
				}
			}
			if (data.flags.midiProperties["saveDamage"] === undefined)
				data.flags.midiProperties["saveDamage"] = "default";
			if (data.flags.midiProperties["confirmTargets"] === true)
				data.flags.midiProperties["confirmTargets"] = "always";
			else if (data.flags.midiProperties["confirmTargets"] === false)
				data.flags.midiProperties["confirmTargets"] = "never";
			else if (data.flags.midiProperties["confirmTargets"] === undefined)
				data.flags.midiProperties["confirmTargets"] = "default";
			delete data.flags.midiProperties.rollOther;
			delete data.flags.midiProperties.fulldam;
			delete data.flags.midiProperties.halfdam;
			delete data.flags.midiProperties.nodam;
			return data;
		}
	}
	Hooks.once('tidy5e-sheet.ready', (api) => {
		if ((game.user?.role ?? CONST.USER_ROLES.PLAYER) < (configSettings.midiPropertiesTabRole ?? CONST.USER_ROLES.PLAYER))
			return;
		const myTab = new api.models.HandlebarsTab({
			title: 'Midi Qol',
			tabId: "midi-qol-properties-tab",
			path: '/modules/midi-qol/templates/midiPropertiesForm.hbs',
			enabled: (data) => { return ["spell", "feat", "weapon", "consumable", "equipment", "power", "maneuver", "tool"].includes(data.item.type); },
			getData: (data) => {
				data = getItemSheetData(data, data.item);
				data.showHeader = false;
				return data;
			},
			onRender: (params) => {
				activateMacroListeners(params.app, params.tabContentsElement);
			}
		});
		api.registerItemTab(myTab);
		api.config.itemSummary.registerCommands([
			{
				label: i18n("midi-qol.buttons.roll"),
				enabled: (params) => ["weapon", "spell", "power", "feat", "tool", "consumable"].includes(params.item.type),
				iconClass: 'fas fa-dice-d20',
				execute: (params) => {
					if (debugEnabled > 1)
						log('roll', params.item);
					Workflow.removeWorkflow(params.item.uuid);
					params.item.use({}, { event: params.event, configureDialog: true, systemCard: true });
				},
			},
			{
				label: i18n("midi-qol.buttons.attack"),
				enabled: (params) => params.item.hasAttack,
				execute: (params) => {
					if (debugEnabled > 1)
						log('attack', params);
					params.item.rollAttack({ event: params.event, versatile: false, resetAdvantage: true, systemCard: true });
				},
			},
			{
				label: i18n("midi-qol.buttons.damage"),
				enabled: (params) => params.item.hasDamage,
				execute: (params) => {
					if (debugEnabled > 1)
						log('Clicked damage', params);
					params.item.rollDamage({ event: params.event, versatile: false, systemCard: true });
				},
			},
			{
				label: i18n("midi-qol.buttons.versatileDamage"),
				enabled: (params) => itemIsVersatile(params.item),
				execute: (params) => {
					if (debugEnabled > 1)
						log('Clicked versatile', params);
					params.item.rollDamage({ event: params.event, versatile: true, systemCard: true });
				}
			},
			{
				label: i18n("midi-qol.buttons.itemUse"),
				enabled: (params) => params.item.type === "consumable",
				execute: (params) => {
					if (debugEnabled > 1)
						log('Clicked consume', params);
					params.item.use({ event: params.event, systemCard: true }, {});
				},
			},
			{
				label: i18n("midi-qol.buttons.itemUse"),
				enabled: (params) => params.item.type === "tool",
				execute: (params) => {
					if (debugEnabled > 1)
						log('Clicked tool check', params);
					params.item.rollToolCheck({ event: params.event, systemCard: true });
				},
			},
			{
				label: i18n("midi-qol.buttons.info"),
				enabled: (params) => true,
				execute: (params) => {
					if (debugEnabled > 1)
						log('Clicked info', params);
					showItemInfo.bind(params.item)();
				},
			},
		]);
		api.registerItemContent(new api.models.HtmlContent({
			html: (data) => {
				const tooltip = `${SystemString}.TargetUnits`;
				return `
		<select name="system.target.units" data-tooltip="${i18n(tooltip)}">
		<option value="" ${data.item.system.target.units === '' ? "selected" : ''}></option>
		<option value="ft" ${data.item.system.target.units === 'ft' ? "selected" : ''}>Feet</option>
		<option value="mi " ${data.item.system.target.units === 'mi' ? "selected" : ''}>Miles</option>
		<option value="m" ${data.item.system.target.units === 'm' ? "selected" : ''}>Meters</option>
		<option value="km" ${data.item.system.target.units === 'km' ? "selected" : ''}>Kilometers</option>
		</select>
		`;
			},
			injectParams: {
				selector: `[data-tidy-field="system.target.type"]`,
				position: "beforebegin",
			},
			enabled: (data) => ["creature", "ally", "enemy"].includes(data.item.system.target?.type) &&
				!data.item.hasAreaTarget,
		}));
		api.config.actorTraits.registerActorTrait({
			title: i18n("midi-qol.ActorOnUseMacros"),
			iconClass: "fas fa-cog",
			enabled: () => configSettings.allowActorUseMacro,
			openConfiguration: (params) => {
				new ActorOnUseMacrosConfig(params.app.object, {}).render(true);
			},
			openConfigurationTooltip: i18n("midi-qol.ActorOnUseMacros"),
		});
	});
	Hooks.on("renderItemSheet", (app, html, data) => {
		const item = app.object;
		if (!item)
			return;
		if ((configSettings.midiPropertiesTabRole ?? CONST.USER_ROLES.PLAYER) > (game.user?.role ?? CONST.USER_ROLES.NONE))
			return;
		if (app.constructor.name !== "Tidy5eKgarItemSheet") {
			if (!item || !["spell", "feat", "weapon", "consumable", "equipment", "power", "maneuver", "tool"].includes(data.item.type))
				return;
			if (configSettings.midiFieldsTab) {
				let tabs = html.find(`nav.sheet-navigation.tabs`);
				if (tabs.find("a[data-tab=midiqol]").length > 0) {
					const message = "render item sheet: Midi Tab already present";
					TroubleShooter.recordError(new Error(message), message);
					error(message);
					return;
				}
				tabs.append($('<a class="item" data-tab="midiqol">Midi-qol</a>'));
				data = foundry.utils.mergeObject(data, getItemSheetData(data, item), { recursive: false });
				renderTemplate("modules/midi-qol/templates/midiPropertiesForm.hbs", data).then(templateHtml => {
					// tabs = html.find(`form nav.sheet-navigation.tabs`);
					$(html.find(`.sheet-body`)).append($(`<div class="tab midi-qol" data-group="primary" data-tab="midiqol">${templateHtml}</div>`));
					if (app.isEditable) {
						$(html.find(".midi-qol-tab")).find(":input").change(evt => {
							app.selectMidiTab = true;
						});
						$(html.find(".midi-qol-tab")).find("textarea").change(evt => {
							app.selectMidiTab = true;
						});
						activateMacroListeners(app, html);
					}
					else {
						$(html.find(".midi-qol-tab")).find(":input").prop("disabled", true);
						$(html.find(".midi-qol-tab")).find("textarea").prop("readonly", true);
					}
					if (app.selectMidiTab) {
						app._tabs[0].activate("midiqol");
						app.selectMidiTab = false;
					}
				});
			}
			else {
				data = foundry.utils.mergeObject(data, getItemSheetData(data, item));
				renderTemplate("modules/midi-qol/templates/midiPropertiesForm.hbs", data).then(templateHtml => {
					const element = html.find('input[name="system.chatFlavor"]').parent().parent();
					element.append(templateHtml);
					if (app.isEditable)
						activateMacroListeners(app, html);
					else {
						element.find(".midi-qol-tab").find(":input").prop("disabled", true);
						element.find(".midi-qol-tab").find("textarea").prop("readonly", true);
					}
				});
			}
			//@ts-expect-error
			if (foundry.utils.isNewerVersion(game.system.version, "2.2") && game.system.id === "dnd5e") {
				if (["creature", "ally", "enemy"].includes(item.system.target?.type) && !item.hasAreaTarget) { // stop gap for dnd5e2.2 hiding this field sometimes
					const targetElement = html.find('select[name="system.target.type"]');
					const targetUnitHTML = `
			<select name="system.target.units" data-tooltip="${i18n(GameSystemConfig.TargetUnits)}">
			<option value="" ${item.system.target.units === '' ? "selected" : ''}></option>
			<option value="ft" ${item.system.target.units === 'ft' ? "selected" : ''}>Feet</option>
			<option value="mi " ${item.system.target.units === 'mi' ? "selected" : ''}>Miles</option>
			<option value="m" ${item.system.target.units === 'm' ? "selected" : ''}>Meters</option>
			<option value="km" ${item.system.target.units === 'km' ? "selected" : ''}>Kilometers</option>
			</select>
			`;
					targetElement.before(targetUnitHTML);
				}
			}
		}
		// activateMacroListeners(app, html);
	});
	Hooks.on("preUpdateItem", (candidate, updates, options, user) => {
		if (updates.system?.target) {
			const targetType = updates.system.target?.type ?? candidate.system.target?.type;
			const noUnits = !["creature", "ally", "enemy"].includes(targetType) && !(targetType in GameSystemConfig.areaTargetTypes);
			if (noUnits) {
				foundry.utils.setProperty(updates, "system.target.units", null);
			}
			// One of the midi specials must specify a count before you can set units
			if (["creature", "ally", "enemy"].includes(targetType) && (updates.system?.target?.value === null || !candidate.system.target.value)) {
				foundry.utils.setProperty(updates, "system.target.units", null);
			}
		}
		return true;
	});
	function _chatListeners(html) {
		html.on("click", '.card-buttons button', onChatCardAction.bind(this));
	}
	Hooks.on("renderChatLog", (app, html, data) => _chatListeners(html));
	Hooks.on('dropCanvasData', function (canvas, dropData) {
		if (!dragDropTargeting)
			return true;
		if (dropData.type !== "Item")
			return true;
		if (!canvas?.grid?.grid)
			return;
		//@ts-ignore .grid v10
		let grid_size = canvas.scene?.grid.size;
		// This will work for all grids except gridless
		let coords = canvas.grid.grid.getPixelsFromGridPosition(...canvas.grid.grid.getGridPositionFromPixels(dropData.x, dropData.y));
		// Assume a square grid for gridless
		//@ts-expect-error .grid v10
		if (canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
			// targetObjects expects the cords to be top left corner of the token, so we need to adjust for that
			coords = [dropData.x - grid_size / 2, dropData.y - grid_size / 2];
		}
		const targetCount = canvas.tokens?.targetObjects({
			x: coords[0],
			y: coords[1],
			height: grid_size,
			width: grid_size
		}, { releaseOthers: true });
		if (targetCount === 0) {
			ui.notifications?.warn("No target selected");
			return true;
		}
		const item = MQfromUuid(dropData.uuid);
		if (!item) {
			const message = `actor / item broke for ${dropData?.uuid}`;
			error(message);
			TroubleShooter.recordError(new Error(message), message);
		}
		item?.use();
		return true;
	});
}
function setupMidiFlagTypes() {
	//@ts-expect-error
	const systemVersion = game.system.version;
	let config = GameSystemConfig;
	let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"]);
	attackTypes.forEach(at => {
		midiFlagTypes[`flags.midi-qol.DR.${at}`] = "number";
		//  midiFlagTypes[`flags.midi-qol.optional.NAME.attack.${at}`] = "string"
		//  midiFlagTypes[`flags.midi-qol.optional.NAME.damage.${at}`] = "string"
	});
	midiFlagTypes["flags.midi-qol.onUseMacroName"] = "string";
	Object.keys(config.abilities).forEach(abl => {
		// midiFlagTypes[`flags.midi-qol.optional.NAME.save.${abl}`] = "string";
		// midiFlagTypes[`flags.midi-qol.optional.NAME.check.${abl}`] = "string";
	});
	Object.keys(config.skills).forEach(skill => {
		// midiFlagTypes[`flags.midi-qol.optional.NAME.skill.${skill}`] = "string";
	});
	if (game.system.id === "dnd5e") {
		midiFlagTypes[`flags.midi-qol.DR.all`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-magical`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-silver`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-adamant`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-physical`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.final`] = "number";
		if (foundry.utils.isNewerVersion(systemVersion, "2.99")) {
			Object.keys(config.damageTypes).forEach(dt => {
				midiFlagTypes[`flags.midi-qol.DR.${dt}`] = "string";
			});
		}
		else {
			Object.keys(config.damageResistanceTypes).forEach(dt => {
				midiFlagTypes[`flags.midi-qol.DR.${dt}`] = "string";
			});
		}
	}
	// midiFlagTypes[`flags.midi-qol.optional.NAME.attack.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.damage.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.check.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.save.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.label`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.skill.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.count`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.ac`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.criticalDamage`] = "string";
	// midiFlagTypes[`flags.midi-qol.OverTime`] = "string";
}
export function setupHooks() {
}
export const overTimeJSONData = {
	"name": "OverTime Item",
	"type": "weapon",
	"img": "icons/svg/aura.svg",
	"system": {
		"description": {
			"value": "",
			"chat": "",
			"unidentified": ""
		},
		"source": "",
		"quantity": 1,
		"weight": 0,
		"price": 0,
		"attuned": false,
		"attunement": 0,
		"equipped": false,
		"rarity": "",
		"identified": true,
		"activation": {
			"type": "special",
			"cost": 0,
			"condition": ""
		},
		"duration": {
			"value": null,
			"units": ""
		},
		"target": {
			"value": null,
			"width": null,
			"units": "",
			"type": "creature"
		},
		"range": {
			"value": null,
			"long": null,
			"units": ""
		},
		"uses": {
			"value": 0,
			"max": "0",
			"per": ""
		},
		"consume": {
			"type": "",
			"target": "",
			"amount": null
		},
		"preparation": { "mode": "atwill" },
		"ability": "",
		"actionType": "save",
		"attackBonus": 0,
		"chatFlavor": "",
		"critical": null,
		"damage": {
			"parts": [],
			"versatile": ""
		},
		"formula": "",
		"save": {
			"ability": "con",
			"dc": 10,
			"scaling": "flat"
		},
		"armor": {
			"value": 0
		},
		"hp": {
			"value": 0,
			"max": 0,
			"dt": null,
			"conditions": ""
		},
		"weaponType": "simpleM",
		"proficient": false,
		"attributes": {
			"spelldc": 10
		}
	},
	"effects": [],
	"sort": 0,
	"flags": {
		"midi-qol": {
			"noCE": true
		}
	}
};
export const itemJSONData = {
	"name": "Concentration Check - Midi QOL",
	"type": "weapon",
	"img": "./modules/midi-qol/icons/concentrate.png",
	"system": {
		"description": {
			"value": "",
			"chat": "",
			"unidentified": ""
		},
		"activation": {
			"type": "special",
			"cost": 0,
			"condition": ""
		},
		"target": {
			"type": ""
		},
		"ability": "",
		"actionType": "save",
		"attackBonus": 0,
		"chatFlavor": "",
		"weaponType": "simpleM",
		"proficient": false,
		"attributes": {
			"spelldc": 10
		}
	},
	"effects": [],
	"sort": 0,
	"flags": {
		"midi-qol": {
			"onUseMacroName": "ItemMacro",
			"isConcentrationCheck": true
		},
		"itemacro": {
			"macro": {
				"_id": null,
				"name": "Concentration Check - Midi QOL",
				"type": "script",
				"author": "devnIbfBHb74U9Zv",
				"img": "icons/svg/dice-target.svg",
				"scope": "global",
				"command": `
			if (MidiQOL.configSettings().autoCheckSaves === 'none') return;
			for (let targetUuid of args[0].targetUuids) {
				let target = await fromUuid(targetUuid);
				if (MidiQOL.configSettings().removeConcentration 
				&& (target.actor.system.attributes.hp.value === 0 || args[0].failedSaveUuids.find(uuid => uuid === targetUuid))) {
				const concentrationEffect = MidiQOL.getConcentrationEffect(target.actor);
				if (concentrationEffect) await concentrationEffect.delete();
				}
			}`,
				"folder": null,
				"sort": 0,
				"permission": {
					"default": 0
				},
				"flags": {}
			}
		},
	}
};
Hooks.on("dnd5e.preCalculateDamage", (actor, damages, options) => {
	if (!configSettings.v3DamageApplication)
		return true;
	const ignore = (category, type, skipDowngrade) => {
		return options.ignore === true
			|| options.ignore?.[category] === true
			|| options.ignore?.[category]?.has?.(type);
	};
	const mo = options.midi;
	if (mo?.noCalc)
		return true;
	if (mo) {
		if (configSettings.saveDROrder === "DRSavedr" && mo.saveMultiplier && !options?.ignore?.saved) {
			options.multiplier = (options.multiplier ?? 1) * mo.saveMultiplier;
			damages.forEach(damage => {
				if (options?.ignore?.saved)
					return;
				foundry.utils.setProperty(damage, "active.saved", true);
			});
		}
		else if (configSettings.saveDROrder === "SaveDRdr" && mo.saveMultiplier !== undefined) {
			for (let damage of damages) {
				if (ignore("saved", damage.type, false))
					return;
				damage.value = damage.value * mo.saveMultiplier;
				// no point doing this yet since dnd5e damage application overwrites it.
				foundry.utils.setProperty(damage, "active.multiplier", (damage.active?.multiplier ?? 1) * mo.saveMultiplier);
				foundry.utils.setProperty(damage, "active.saved", true);
			}
		}
		const categories = { "idi": "immunity", "idr": "resistance", "idv": "vulnerability", "ida": "absorption" };
		if (mo?.sourceActor) {
			for (let key of ["idi", "idr", "idv", "ida"]) {
				if (foundry.utils.getProperty(mo.sourceActor, `system.traits.${key}`) && mo.sourceActor.system.traits[key].value.size > 0) {
					const trait = foundry.utils.getProperty(mo.sourceActor, `system.traits.${key}`);
					if (!options.ignore?.[categories[key]])
						foundry.utils.setProperty(options, `ignore.${categories[key]}`, new Set());
					for (let dt of Object.keys(GameSystemConfig.damageTypes)) {
						if (trait.value.has(dt) || trait.all)
							options.ignore[categories[key]].add(dt);
					}
				}
			}
		}
		// For damage absorption ignore other immunity/resistance/vulnerability
		if (actor.system.traits.da) {
			for (let damage of damages) {
				if (ignore("absorption", damage.type, false))
					continue;
				if (actor.system.traits.da?.value?.has(damage.type) || actor.system.traits.da?.all) {
					if (!options?.ignore?.immunity)
						foundry.utils.setProperty(options, "ignore.immunity", new Set());
					if (!options?.ignore?.resistance)
						foundry.utils.setProperty(options, "ignore.resistance", new Set());
					if (!options?.ignore?.vulnerability)
						foundry.utils.setProperty(options, "ignore.vulnerability", new Set());
					if (actor.system.traits.di.value.has(damage.type))
						options.ignore.immunity.add(damage.type);
					if (actor.system.traits.dr.value.has(damage.type))
						options.ignore.resistance.add(damage.type);
					if (actor.system.traits.dv.value.has(damage.type))
						options.ignore.vulnerability.add(damage.type);
				}
			}
		}
		for (let damage of damages) {
			if (mo.saved) {
				foundry.utils.setProperty(damage, "active.saved", true);
			}
			if (mo.superSaver) {
				foundry.utils.setProperty(damage, "active.superSaver", true);
			}
			if (mo.semiSuperSaver) {
				foundry.utils.setProperty(damage, "active.semiSuperSaver", true);
			}
		}
	}
	const totalDamage = damages.reduce((a, b) => {
		if (options.invertHealing !== false && b.type === "temphp") {
			b.multiplier = (b.multiplier ?? 1) * -1;
			b.value = b.value * -1;
		}
		if (b.type === "midi-none")
			b.value = 0;
		return a + (["temphp", "midi-none"].includes(b.type) ? 0 : b.value);
	}, 0);
	foundry.utils.setProperty(options, "midi.totalDamage", totalDamage);
	return true;
});
Hooks.on("dnd5e.calculateDamage", (actor, damages, options) => {
	if (!configSettings.v3DamageApplication)
		return true;
	const mo = options.midi;
	if (mo?.noCalc)
		return true;
	for (let damage of damages) {
		// not sure how to do this. if (damage.active.immunity) damage.multiplier = configSettings.damageImmunityMultiplier;
		if (damage.active.resistance) {
			damage.value = damage.value * 2 * configSettings.damageResistanceMultiplier;
			damage.active.multiplier = damage.active.multiplier * 2 * configSettings.damageResistanceMultiplier;
		}
		if (damage.active.vulnerability) {
			damage.active.multiplier = damage.active.multiplier / 2 * configSettings.damageVulnerabilityMultiplier;
			damage.value = damage.value / 2 * configSettings.damageVulnerabilityMultiplier;
		}
	}
	const downgrade = type => options.downgrade === true || options.downgrade?.has?.(type);
	const ignore = (category, type, skipDowngrade) => {
		return options.ignore === true
			|| options.ignore?.[category] === true
			|| options.ignore?.[category]?.has?.(type)
			|| ((category === "immunity") && downgrade(type) && !skipDowngrade)
			|| ((category === "resistance") && downgrade(type));
	};
	let customs = [];
	const categories = { "di": "immunity", "dr": "resistance", "dv": "vulnerability", "da": "absorption" };
	const traitMultipliers = { "dr": configSettings.damageResistanceMultiplier, "di": configSettings.damageImmunityMultiplier, "da": -1, "dv": configSettings.damageVulnerabilityMultiplier };
	// Handle custom immunities
	for (let trait of ["da", "dv", "di", "dr"]) {
		if ((actor.system.traits[trait]?.custom?.length ?? 0) > 0) {
			customs = actor.system.traits[trait].custom.split(";").map(s => s.trim());
			for (let custom of customs) {
				switch (custom) {
					case "spell":
						for (let damage of damages) {
							if (GameSystemConfig.healingTypes[damage.type])
								continue;
							if (ignore("spell", damage.type, false) || damage.active["spell"])
								continue;
							if (damage.properties.has("spell")) {
								damage.active["spell"] = true;
								damage.active.multiplier = (damage.active.multiplier ?? 1) * traitMultipliers[trait];
								damage.value = damage.value * traitMultipliers[trait];
							}
						}
					case "nonmagic":
						for (let damage of damages) {
							if (GameSystemConfig.healingTypes[damage.type])
								continue;
							if (ignore("nonmagic", damage.type, false) || damage.active["nonmagic"])
								continue;
							if (!damage.properties.has("magic") && !damage.properties.has("spell")) {
								damage.active["nonmagic"] = true;
								damage.active.multiplier = (damage.active.multiplier ?? 1) * traitMultipliers[trait];
								damage.value = damage.value * traitMultipliers[trait];
							}
						}
					case "magic":
						for (let damage of damages) {
							if (GameSystemConfig.healingTypes[damage.type])
								continue;
							if (ignore("magic", damage.type, false) || damage.active["magic"])
								continue;
							if (damage.properties.has("mgc") || damage.properties.has("spell")) {
								damage.active["magic"] = true;
								damage.active.multiplier = (damage.active.multiplier ?? 1) * traitMultipliers[trait];
								damage.value = damage.value * traitMultipliers[trait];
							}
						}
				}
			}
		}
	}
	if (actor.system.traits.da) {
		for (let damage of damages) {
			if (ignore("absorption", damage.type, false))
				continue;
			if (GameSystemConfig.healingTypes[damage.type])
				continue;
			if (actor.system.traits.da?.value?.has(damage.type) || actor.system.traits.da?.all) {
				foundry.utils.setProperty(damage, "active.absorption", true);
				if (damage.value > 0) {
					foundry.utils.setProperty(damage, "multiplier", -1);
					damage.value = damage.value * -1;
				}
			}
		}
	}
	// Insert DR.ALL as a -ve damage value maxed at the total damage.
	let drAll = 0;
	if (options.ignore !== true && !options.ignore?.modification?.has("none") && !options.ignore?.modification?.has("all")) {
		if (foundry.utils.getProperty(actor, "system.traits.dm.midi.all")) {
			let drRoll = new Roll(`${actor.system.traits.dm.midi.all}`, actor.getRollData());
			let dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.all`)?.total ?? 0;
			if (Math.sign(options.midi.totalDamage + dr) !== Math.sign(options.midi.totalDamage)) {
				dr = -options.midi.totalDamage;
			}
			if (options.midi.totalDamage < 0 && dr < 0)
				dr = 0;
			if (checkRule("maxDRValue") && (dr < drAll))
				drAll = dr;
			else if (!checkRule("maxDRValue"))
				drAll += dr;
		}
		for (let actType of Object.keys(GameSystemConfig.itemActionTypes)) {
			if (!options.ignore?.modification?.has(actType)) {
				if (foundry.utils.getProperty(actor, `system.traits.dm.midi.${actType}`) && damages && damages[0]?.properties?.has(actType)) {
					const rollExpr = foundry.utils.getProperty(actor, `system.traits.dm.midi.${actType}`);
					let drRoll = new Roll(`${rollExpr}`, actor.getRollData());
					let dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.${actType}`)?.total ?? 0;
					if (Math.sign(options.midi.totalDamage + dr) !== Math.sign(options.midi.totalDamage)) {
						dr = -options.midi.totalDamage;
					}
					if (options.midi.totalDamage < 0 && dr < 0)
						dr = 0;
					if (checkRule("maxDRValue") && (dr < drAll))
						drAll = dr;
					else if (!checkRule("maxDRValue"))
						drAll += dr;
				}
			}
		}
		const physicalDamage = damages.reduce((total, damage) => {
			//@ts-expect-error
			const isPhysical = game.system.config.damageTypes[damage.type]?.isPhysical;
			total += isPhysical ? damage.value : 0;
			return total;
		}, 0);
		for (let special of Object.keys(actor.system.traits.dm?.midi ?? {})) {
			let dr;
			let drRoll;
			let selectedDamage;
			switch (special) {
				case "non-magical":
					drRoll = new Roll(`${actor.system.traits.dm.midi["non-magical"]}`, actor.getRollData());
					dr = doSyncRoll(drRoll, "traits.dm.midi.non-magical")?.total ?? 0;
					;
					selectedDamage = damages.reduce((total, damage) => {
						const isNonMagical = !GameSystemConfig.healingTypes[damage.type] && !damage.properties.has("mgc");
						total += isNonMagical ? damage.value : 0;
						return total;
					}, 0);
					break;
				case "non-magical-physical":
					drRoll = new Roll(`${actor.system.traits.dm.midi["non-magical-physical"]}`, actor.getRollData());
					dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.non-magicial-physical`)?.total ?? 0;
					selectedDamage = damages.reduce((total, damage) => {
						//@ts-expect-error
						const isNonMagical = game.system.config.damageTypes[damage.type]?.isPhysical && !damage.properties.has("mgc");
						total += !GameSystemConfig.healingTypes[damage.type] && isNonMagical ? damage.value : 0;
						return total;
					}, 0);
					break;
				case "non-silver-physical":
					drRoll = new Roll(`${actor.system.traits.dm.midi["non-silver-physical"]}`, actor.getRollData());
					dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi-non-silver-physical`)?.total ?? 0;
					selectedDamage = damages.reduce((total, damage) => {
						//@ts-expect-error
						const isNonSilver = !GameSystemConfig.healingTypes[damage.type] && game.system.config.damageTypes[damage.type]?.isPhysical && !damage.properties.has("sil");
						total += isNonSilver ? damage.value : 0;
						return total;
					}, 0);
					break;
				case "non-adamant-physical":
					drRoll = new Roll(`${actor.system.traits.dm.midi["non-adamant-physical"]}`, actor.getRollData());
					dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.non-adamant-physical`)?.total ?? 0;
					selectedDamage = damages.reduce((total, damage) => {
						//@ts-expect-error
						const isNonSilver = !GameSystemConfig.healingTypes[damage.type] && game.system.config.damageTypes[damage.type]?.isPhysical && !damage.properties.has("adm");
						total += isNonSilver ? damage.value : 0;
						return total;
					}, 0);
					break;
				case "non-physical":
					drRoll = new Roll(`${actor.system.traits.dm.midi["non-physical"]}`, actor.getRollData());
					dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.non-physical`)?.total ?? 0;
					selectedDamage = damages.reduce((total, damage) => {
						//@ts-expect-error
						const isNonPhysical = !GameSystemConfig.healingTypes[damage.type] && !game.system.config.damageTypes[damage.type]?.isPhysical;
						total += isNonPhysical ? damage.value : 0;
						return total;
					}, 0);
					break;
				case "spell":
					if (actor.system.traits.dm.midi["spell"]) {
						drRoll = new Roll(`${actor.system.traits.dm.midi["spell"]}`, actor.getRollData());
						dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.spell`)?.total ?? 0;
						selectedDamage = damages.reduce((total, damage) => {
							const isSpell = !GameSystemConfig.healingTypes[damage.type] && damage.properties.has("spell");
							total += isSpell ? damage.value : 0;
							return total;
						}, 0);
					}
					break;
				case "non-spell":
					if (actor.system.traits.dm.midi["non-spell"]) {
						drRoll = new Roll(`${actor.system.traits.dm.midi["spell"]}`, actor.getRollData());
						dr = doSyncRoll(drRoll, `${actor.name} system.traits.dm.midi.non-spell`)?.total ?? 0;
						selectedDamage = damages.reduce((total, damage) => {
							const isSpell = !GameSystemConfig.healingTypes[damage.type] && damage.properties.has("spell");
							total += isSpell ? 0 : damage.value;
							return total;
						}, 0);
					}
					break;
			}
			if (dr) {
				if (Math.sign(selectedDamage + dr) !== Math.sign(selectedDamage)) {
					dr = -selectedDamage;
				}
				if (checkRule("maxDRValue") && dr < drAll)
					drAll = dr;
				else if (!checkRule("maxDRValue"))
					drAll += dr;
			}
		}
		const totalDamage = damages.reduce((a, b) => a + b.value, 0);
		if (Math.sign(totalDamage) !== Math.sign(drAll + totalDamage)) {
			drAll = -totalDamage;
		}
		if (drAll)
			damages.push({ type: "none", value: drAll, active: { modification: true, multiplier: 1 }, properties: new Set() });
	}
	return true;
});
Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
	if (!configSettings.v3DamageApplication)
		return true;
	const vitalityResource = checkRule("vitalityResource");
	if (foundry.utils.getProperty(updates, "system.attributes.hp.value") === 0 && typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource) !== undefined) {
		// actor is reduced to zero so update vitaility resource
		const hp = actor.system.attributes.hp;
		const vitalityDamage = amount - (hp.temp + hp.value);
		updates[vitalityResource] = Math.max(0, foundry.utils.getProperty(actor, vitalityResource) - vitalityDamage);
	}
	if (options.midi) {
		foundry.utils.setProperty(options, "midi.amount", amount);
		foundry.utils.setProperty(options, "midi.updates", updates);
	}
	return true;
});
Hooks.on("dnd5e.preRollConcentration", (actor, options) => {
	// insert advantage and disadvantage
	// insert midi bonuses.
	const concAdvFlag = foundry.utils.getProperty(actor, "flags.midi-qol.advantage.concentration");
	const concDisadvFlag = foundry.utils.getProperty(actor, "flags.midi-qol.disadvantage.concentration");
	let concAdv = options.advantage;
	let concDisadv = options.disadvantage;
	if (concAdvFlag || concDisadvFlag) {
		const conditionData = createConditionData({ workflow: undefined, target: undefined, actor });
		if (evalAllConditions(actor, "flags.midi-qol.advantage.concentration", conditionData)) {
			concAdv = true;
		}
		if (concDisadvFlag && evalAllConditions(actor, "flags.midi-qol.disadvantage.concentration", conditionData)) {
			concDisadv = true;
		}
	}
	if (concAdv && !concDisadv) {
		options.advantage = true;
	}
	else if (!concAdv && concDisadv) {
		options.disadvantage = true;
	}
	if (options.chatMessage !== false) {
		Hooks.once("dnd5e.preRollAbilitySave", (actor, rollData, abilityId) => {
			foundry.utils.setProperty(actor, "flags.midi-qol.concentrationRollData", rollData);
		});
		options.chatMessage = false;
	}
	return true;
});
Hooks.on("dnd5e.rollConcentration", (actor, roll) => {
	//@ts-expect-error
	const simplifyBonus = game.system.utils.simplifyBonus;
	if (foundry.utils.getProperty(actor, "flags.midi-qol.min.ability.save.concentration") && simplifyBonus) {
		const minRoll = simplifyBonus(foundry.utils.getProperty(actor, "flags.midi-qol.min.ability.save.concentration"), actor.getRollData());
		const diceTerm = roll.terms[0];
		if (diceTerm.total < minRoll) {
			diceTerm.results.forEach(r => { if (r.result < minRoll)
				r.result = minRoll; });
			roll._total = roll._evaluateTotal();
		}
	}
	if (foundry.utils.getProperty(actor, "flags.midi-qol.max.ability.save.concentration") && simplifyBonus) {
		const maxRoll = simplifyBonus(foundry.utils.getProperty(actor, "flags.midi-qol.max.ability.save.concentration"), actor.getRollData());
		const diceTerm = roll.terms[0];
		if (diceTerm.total > maxRoll) {
			diceTerm.results.forEach(r => { if (r.result > maxRoll)
				r.result = maxRoll; });
			roll._total = roll._evaluateTotal();
		}
	}
	if (!Number.isNaN(roll.options.targetValue)) {
		roll.options.success = roll.total >= Number(roll.options.targetValue);
	}
	if (checkRule("criticalSaves") && roll.isCritical)
		roll.options.success = true;
	// triggerTargetMacros(triggerList: string[], targets: Set<any> = this.targets, options: any = {}) {
	const rollData = foundry.utils.getProperty(actor, "flags.midi-qol.concentrationRollData");
	foundry.utils.setProperty(actor, "flags.midi-qol.concentrationRollData", undefined);
	if (rollData)
		roll.toMessage(rollData.messageData);
	if (configSettings.removeConcentration && roll.options.success === false)
		actor.endConcentration();
});
