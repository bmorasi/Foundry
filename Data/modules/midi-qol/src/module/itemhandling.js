import { warn, debug, error, i18n, MESSAGETYPES, i18nFormat, gameStats, debugEnabled, log, debugCallTiming, allAttackTypes, GameSystemConfig, SystemString, MQdefaultDamageType } from "../midi-qol.js";
import { DummyWorkflow, TrapWorkflow, Workflow } from "./workflow.js";
import { configSettings, enableWorkflow, checkMechanic, targetConfirmation, safeGetGameSetting } from "./settings.js";
import { checkRange, computeTemplateShapeDistance, getAutoRollAttack, getAutoRollDamage, getConcentrationEffect, getRemoveDamageButtons, getTokenForActorAsSet, getSpeaker, getUnitDist, isAutoConsumeResource, itemHasDamage, itemIsVersatile, processAttackRollBonusFlags, processDamageRollBonusFlags, validTargetTokens, isInCombat, setReactionUsed, hasUsedReaction, checkIncapacitated, needsReactionCheck, needsBonusActionCheck, setBonusActionUsed, hasUsedBonusAction, asyncHooksCall, addAdvAttribution, evalActivationCondition, createDamageDetail, getDamageType, completeItemUse, hasDAE, tokenForActor, getRemoveAttackButtons, doReactions, displayDSNForRoll, isTargetable, hasWallBlockingCondition, getToken, itemRequiresConcentration, checkDefeated, computeCoverBonus, getStatusName, getAutoTarget, hasAutoPlaceTemplate, sumRolls, getCachedDocument } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
import { TargetConfirmationDialog } from "./apps/TargetConfirmation.js";
import { defaultRollOptions, removeConcentrationEffects } from "./patching.js";
import { saveUndoData } from "./undo.js";
import { untimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { busyWait } from "./tests/setupTest.js";
import { ChatMessageMidi } from "./ChatMessageMidi.js";
function itemRequiresPostTemplateConfiramtion(item) {
	const isRangeTargeting = ["ft", "m"].includes(item.system.target?.units) && ["creature", "ally", "enemy"].includes(item.system.target?.type);
	if (item.hasAreaTarget) {
		return true;
	}
	else if (isRangeTargeting) {
		return true;
	}
	return false;
}
export function requiresTargetConfirmation(item, options) {
	// check lateTargeting as well - legacy.
	if (options.workflowOptions?.targetConfirmation === "none")
		return false;
	// For old version of dnd5e-scriptlets
	if (options.workflowdialogOptions?.lateTargeting === "none")
		return false;
	if (item.system.target?.type === "self")
		return false;
	if (options.workflowOptions?.attackPerTarget === true)
		return false;
	if (item?.flags?.midiProperties?.confirmTargets === "always")
		return true;
	if (item?.flags?.midiProperties?.confirmTargets === "never")
		return false;
	let numTargets = game.user?.targets?.size ?? 0;
	if (numTargets === 0 && configSettings.enforceSingleWeaponTarget && item.type === "weapon")
		numTargets = 1;
	const token = tokenForActor(item.actor);
	if (targetConfirmation.enabled) {
		if (options.workflowOptions?.targetConfirmation && options.workflowOptions?.targetConfirmation !== "none") {
			if (debugEnabled > 0)
				warn("target confirmation triggered by has workflow options");
			return true;
		}
		if (targetConfirmation.all &&
			((item.system.target?.type ?? "") !== "" || item.system.range?.value || item.hasAttack) && numTargets > 0) {
			if (debugEnabled > 0)
				warn("target confirmation triggered from targetConfirmation.all");
			return true;
		}
		if (item.hasAttack && targetConfirmation.hasAttack) {
			if (debugEnabled > 0)
				warn("target confirmation triggered by targetCofirnmation.hasAttack");
			return true;
		}
		if (item.system.target?.type === "creature" && targetConfirmation.hasCreatureTarget) {
			if (debugEnabled > 0)
				warn("target confirmation triggered from targetConfirmation.hasCreatureTarget");
			return true;
		}
		if (targetConfirmation.noneTargeted && ((item.system.target?.type ?? "") !== "" || item.hasAttack) && numTargets === 0) {
			if (debugEnabled > 0)
				warn("target confirmation triggered from targetConfirmation.noneTargeted");
			return true;
		}
		if (targetConfirmation.allies && token && numTargets > 0 && item.system.target?.type !== "self") {
			//@ts-expect-error find disposition
			if (game.user?.targets.some(t => t.document.disposition == token.document.disposition)) {
				if (debugEnabled > 0)
					warn("target confirmation triggered from targetConfirmation.allies");
				return true;
			}
		}
		if (targetConfirmation.targetSelf && item.system.target?.type !== "self") {
			let tokenToUse = token;
			/*
			if (tokenToUse && game.user?.targets) {
			const { result, attackingToken } = checkRange(item, tokenToUse, new Set(game.user.targets))
			if (speaker.token && result === "fail")
				tokenToUse = undefined;
			else tokenToUse = attackingToken;
			}
			*/
			if (tokenToUse && game.user?.targets?.has(tokenToUse)) {
				if (debugEnabled > 0)
					warn("target confirmation triggered by has targetConfirmation.targetSelf");
				return true;
			}
		}
		if (targetConfirmation.mixedDispositiion && numTargets > 0 && game.user?.targets) {
			const dispositions = new Set();
			for (let target of game.user?.targets) {
				//@ts-expect-error
				if (target)
					dispositions.add(target.document.disposition);
			}
			if (dispositions.size > 1) {
				if (debugEnabled > 0)
					warn("target confirmation triggered from targetConfirmation.mixedDisposition");
				return true;
			}
		}
		if (targetConfirmation.longRange && game?.user?.targets && numTargets > 0 &&
			(["ft", "m"].includes(item.system.range?.units) || item.system.range.type === "touch")) {
			if (token) {
				for (let target of game.user.targets) {
					const { result, attackingToken } = checkRange(item, token, new Set([target]));
					if (result !== "normal") {
						if (debugEnabled > 0)
							warn("target confirmation triggered from targetConfirmation.longRange");
						return true;
					}
				}
			}
		}
		if (targetConfirmation.inCover && numTargets > 0 && token && game.user?.targets) {
			const isRangeTargeting = ["ft", "m"].includes(item.system.target?.units) && ["creature", "ally", "enemy"].includes(item.system.target?.type);
			if (!item.hasAreaTarget && !isRangeTargeting) {
				for (let target of game.user?.targets) {
					if (computeCoverBonus(token, target, item) > 0) {
						if (debugEnabled > 0)
							warn("target confirmation triggered from targetConfirmation.inCover");
						return true;
					}
				}
			}
		}
		const isRangeTargeting = ["ft", "m"].includes(item.system.target?.units) && ["creature", "ally", "enemy"].includes(item.system.target?.type);
		if (item.hasAreaTarget && (targetConfirmation.hasAoE)) {
			if (debugEnabled > 0)
				warn("target confirmation triggered by targetConfirmation.hasAoE");
			return true;
		}
		else if (isRangeTargeting && (targetConfirmation.hasRangedAoE)) {
			if (debugEnabled > 0)
				warn("target confirmation triggered by has targetConfirmation.hasRangedAoE");
			return true;
		}
	}
	return false;
}
export async function preTemplateTargets(item, options, pressedKeys) {
	if (itemRequiresPostTemplateConfiramtion(item))
		return true;
	if (requiresTargetConfirmation(item, options))
		return await resolveTargetConfirmation(item, options, pressedKeys) === true;
	return true;
}
export async function postTemplateConfirmTargets(item, options, pressedKeys, workflow) {
	if (!itemRequiresPostTemplateConfiramtion(item))
		return true;
	if (requiresTargetConfirmation(item, options)) {
		let result = true;
		result = await resolveTargetConfirmation(item, options, pressedKeys);
		if (result && game.user?.targets)
			workflow.targets = new Set(game.user.targets);
		return result === true;
	}
	return true;
}
export async function doItemUse(wrapped, config = {}, options = {}) {
	if (debugEnabled > 0) {
		warn("doItemUse called with", this.name, config, options, game.user?.targets);
	}
	try {
		// if confirming can't reroll till the first workflow is completed.
		let previousWorkflow = Workflow.getWorkflow(this.uuid);
		if (previousWorkflow) {
			const validStates = [previousWorkflow.WorkflowState_Completed, previousWorkflow.WorkflowState_Start, previousWorkflow.WorkflowState_RollFinished];
			if (!(validStates.includes(previousWorkflow.currentAction))) { // && configSettings.confirmAttackDamage !== "none") {
				if (configSettings.autoCompleteWorkflow) {
					previousWorkflow.aborted = true;
					await previousWorkflow.performState(previousWorkflow.WorkflowState_Cleanup);
					await Workflow.removeWorkflow(this.uuid);
				}
				else if (previousWorkflow.currentAction === previousWorkflow.WorkflowState_WaitForDamageRoll && previousWorkflow.hitTargets.size === 0) {
					previousWorkflow.aborted = true;
					await previousWorkflow.performState(previousWorkflow.WorkflowState_Cleanup);
				}
				else {
					//@ts-expect-error
					switch (await Dialog.wait({
						title: game.i18n.format("midi-qol.WaitingForPreviousWorkflow", { name: this.name }),
						default: "cancel",
						content: "Choose what to do with the previous roll",
						buttons: {
							complete: { icon: `<i class="fas fa-check"></i>`, label: "Complete previous", callback: () => { return "complete"; } },
							discard: { icon: `<i class="fas fa-trash"></i>`, label: "Discard previous", callback: () => { return "discard"; } },
							undo: { icon: `<i class="fas fa-undo"></i>`, label: "Undo until previous", callback: () => { return "undo"; } },
							cancel: { icon: `<i class="fas fa-times"></i>`, label: "Cancel New", callback: () => { return "cancel"; } },
						}
					}, { width: 700 })) {
						case "complete":
							await previousWorkflow.performState(previousWorkflow.WorkflowState_Cleanup);
							await Workflow.removeWorkflow(this.uuid);
							break;
						case "discard":
							await previousWorkflow.performState(previousWorkflow.WorkflowState_Abort);
							break;
						case "undo":
							await previousWorkflow.performState(previousWorkflow.WorkflowState_Cancel);
							break;
						case "cancel":
						default:
							return undefined;
					}
				}
			}
		}
		const pressedKeys = foundry.utils.duplicate(globalThis.MidiKeyManager.pressedKeys);
		let tokenToUse;
		let targetConfirmationHasRun = false;
		let selfTarget = this.system.target?.type === "self";
		let targetsToUse = validTargetTokens(game.user?.targets);
		// remove selection of untargetable targets
		if (canvas?.scene) {
			const tokensIdsToUse = Array.from(targetsToUse).map(t => t.id);
			game.user?.updateTokenTargets(tokensIdsToUse);
		}
		if (selfTarget) {
			foundry.utils.setProperty(options, "workflowOptions.targetConfirmation", "none");
			targetsToUse = new Set();
		}
		let attackPerTarget = foundry.utils.getProperty(this, "flags?.midi-qol.rollAttackPerTarget") !== "never" && options.workflowOptions?.attackPerTarget !== false && (foundry.utils.getProperty(this, "flags.midi-qol.rollAttackPerTarget") === "always" || configSettings.attackPerTarget === true || options.workflowOptions?.attackPerTarget === true);
		// Special check for scriptlets ammoSelector - if scriptlets is going to fail and rerun the item use don't start attacks per target
		const ammoSelectorEnabled = safeGetGameSetting("dnd5e-scriplets", "ammoSelector") !== "none" && safeGetGameSetting("dnd5e-scriptlets", "ammoSelector") !== undefined;
		const ammoSelectorFirstPass = ammoSelectorEnabled
			&& !options.ammoSelector?.hasRun
			&& this.system.properties?.has("amm") === true
			&& this.type == "weapon";
		if (selfTarget)
			attackPerTarget = false;
		attackPerTarget && (attackPerTarget = this.hasAttack);
		attackPerTarget && (attackPerTarget = options.createMessage !== false);
		if (attackPerTarget && (!ammoSelectorEnabled || ammoSelectorFirstPass)) {
			if ((this.system.target?.type ?? "") !== "") {
				if (!(await preTemplateTargets(this, options, pressedKeys)))
					return null;
			}
			targetConfirmationHasRun = true;
		}
		attackPerTarget && (attackPerTarget = !ammoSelectorFirstPass);
		attackPerTarget && (attackPerTarget = (game.user?.targets.size ?? 0) > 0);
		if (attackPerTarget) {
			let targets = new Set(game.user?.targets);
			const optionsToUse = foundry.utils.duplicate(options);
			const configToUse = foundry.utils.duplicate(config);
			let ammoUpdateHookId;
			try {
				let allowAmmoUpdates = true;
				ammoUpdateHookId = Hooks.on("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
					// need to disable ammo updates for subsequent rolls since rollAttack does not respect the consumeResource setting
					if (item.uuid !== this.uuid)
						return;
					if (!allowAmmoUpdates)
						ammoUpdate.length = 0;
				});
				let count = 0;
				for (let target of targets) {
					count += 1;
					const nameToUse = `${this.name} attack ${count} - target (${target.name})`;
					const newOptions = foundry.utils.mergeObject(optionsToUse, {
						targetUuids: [target.document.uuid],
						ammoSelector: { hasRun: true },
						workflowOptions: { targetConfirmation: "none", attackPerTarget: false, workflowName: nameToUse }
					}, { inplace: false, overwrite: true });
					if (debugEnabled > 0)
						warn(`doItemUse | ${nameToUse} ${target.name} config`, config, "options", newOptions);
					const result = await completeItemUse(this, config, newOptions);
					if (!result || result.aborted)
						break;
					allowAmmoUpdates = false;
					if (debugEnabled > 0)
						warn(`doItemUse | for ${nameToUse} result is`, result);
					// After the first do not consume resources
					config = foundry.utils.mergeObject(configToUse, { consumeResource: false, consumeUsage: false, consumeSpellSlot: false });
				}
			}
			finally {
				Hooks.off("dnd5e.rollAttack", ammoUpdateHookId);
			}
			// The workflow only refers to the last target.
			// If there was more than one should remove the workflow.
			// if (targets.size > 1) await Workflow.removeWorkflow(this.uuid);
			return null;
		}
		else if (options.workflowOptions?.targetConfirmation === "none" && options.workflowOptions?.attackPerTarget === false) {
			// TODO why is this heere
			game.user?.targets?.clear();
			const targetids = (options.targetUuids ?? []).map(uuid => {
				//@ts-expect-error fromUuidSync
				const targetDocument = fromUuidSync(uuid);
				//@ts-expect-error .object
				return targetDocument instanceof TokenDocument ? targetDocument.object.id : "";
			});
			game.user?.updateTokenTargets(targetids);
		}
		options = foundry.utils.mergeObject({
			systemCard: false,
			createWorkflow: true,
			versatile: false,
			configureDialog: true,
			createMessage: true,
			workflowOptions: { targetConfirmation: undefined, notReaction: false }
		}, options, { insertKeys: true, insertValues: true, overWrite: true });
		const itemRollStart = Date.now();
		let systemCard = options?.systemCard ?? false;
		let createWorkflow = options?.createWorkflow ?? true;
		let versatile = options?.versatile ?? false;
		if (!enableWorkflow || createWorkflow === false) {
			return await wrapped(config, options);
		}
		if (!options.workflowOptions?.allowIncapacitated && checkMechanic("incapacitated")) {
			const condition = checkIncapacitated(this.actor, true);
			if (condition) {
				ui.notifications?.warn(`${this.actor.name} is ${getStatusName(condition)} and is incapacitated`);
				return null;
			}
		}
		let isRangeTargeting = ["ft", "m"].includes(this.system.target?.units) && ["creature", "ally", "enemy"].includes(this.system.target?.type);
		let isAoETargeting = this.hasAreaTarget;
		const inCombat = isInCombat(this.actor);
		let requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" && (game.combat ?? null) !== null);
		let speaker = getSpeaker(this.actor);
		// Call preTargeting hook/onUse macro. Create a dummy workflow if one does not already exist for the item
		let tempWorkflow = new DummyWorkflow(this.parent, this, speaker, game?.user?.targets ?? new Set(), {});
		tempWorkflow.options = options;
		let cancelWorkflow = (await asyncHooksCall("midi-qol.preTargeting", tempWorkflow) === false || await asyncHooksCall(`midi-qol.preTargeting.${this.uuid}`, { item: this })) === false;
		if (configSettings.allowUseMacro) {
			const results = await tempWorkflow.callMacros(this, tempWorkflow.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting");
			cancelWorkflow || (cancelWorkflow = results.some(i => i === false));
		}
		selfTarget = this.system.target?.type === "self";
		isRangeTargeting = ["ft", "m"].includes(this.system.target?.units) && ["creature", "ally", "enemy"].includes(this.system.target?.type);
		options = tempWorkflow.options;
		foundry.utils.mergeObject(options.workflowOptions, tempWorkflow.workflowOptions, { inplace: true, insertKeys: true, insertValues: true, overwrite: true });
		const existingWorkflow = Workflow.getWorkflow(this.uuid);
		if (existingWorkflow)
			await Workflow.removeWorkflow(this.uuid);
		if (cancelWorkflow)
			return null;
		if ((!targetConfirmationHasRun && ((this.system.target?.type ?? "") !== "") || configSettings.enforceSingleWeaponTarget)) {
			if (!(await preTemplateTargets(this, options, pressedKeys)))
				return null;
			//@ts-expect-error
			if (game.user?.targets)
				targetsToUse = game.user?.targets;
		}
		let shouldAllowRoll = !requiresTargets // we don't care about targets
			|| (targetsToUse.size > 0) // there are some target selected
			|| (this.system.target?.type ?? "") === "" // no target required
			|| selfTarget
			|| isAoETargeting // area effect spell and we will auto target
			|| isRangeTargeting // range target and will autotarget
			|| (!this.hasAttack && !itemHasDamage(this) && !this.hasSave); // does not do anything - need to chck dynamic effects
		// only allow attacks against at most the specified number of targets
		let allowedTargets = (this.system.target?.type === "creature" ? this.system.target?.value : 9999) ?? 9999;
		if (requiresTargets && configSettings.enforceSingleWeaponTarget && allAttackTypes.includes(this.system.actionType)) {
			allowedTargets = 1;
			if (requiresTargets && targetsToUse.size !== 1) {
				ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
				if (debugEnabled > 0)
					warn(`${game.user?.name} ${i18nFormat("midi-qol.midi-qol.wrongNumberTargets", { allowedTargets })}`);
				return null;
			}
		}
		if (requiresTargets && !isRangeTargeting && !isAoETargeting && this.system.target?.type === "creature" && targetsToUse.size === 0) {
			ui.notifications?.warn(i18n("midi-qol.noTargets"));
			if (debugEnabled > 0)
				warn(`${game.user?.name} attempted to roll with no targets selected`);
			return false;
		}
		let AoO = false;
		let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id);
		const isTurn = activeCombatants?.includes(speaker.token);
		const checkReactionAOO = configSettings.recordAOO === "all" || (configSettings.recordAOO === this.actor.type);
		let itemUsesReaction = false;
		const hasReaction = hasUsedReaction(this.actor);
		if (!options.workflowOptions?.notReaction && ["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.system.activation?.type) && this.system.activation?.cost > 0) {
			itemUsesReaction = true;
		}
		if (!options.workflowOptions?.notReaction && checkReactionAOO && !itemUsesReaction && this.hasAttack) {
			let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id);
			const isTurn = activeCombatants?.includes(speaker.token);
			if (!isTurn && inCombat) {
				itemUsesReaction = true;
				AoO = true;
			}
		}
		// do pre roll checks
		if ((game.system.id === "dnd5e" || game.system.id === "n5e") && requiresTargets && targetsToUse.size > allowedTargets) {
			ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
			if (debugEnabled > 0)
				warn(`${game.user?.name} ${i18nFormat("midi-qol.midi-qol.wrongNumberTargets", { allowedTargets })}`);
			return null;
		}
		if (speaker.token)
			tokenToUse = canvas?.tokens?.get(speaker.token);
		const rangeDetails = checkRange(this, tokenToUse, targetsToUse, checkMechanic("checkRange") !== "none");
		if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isRangeTargeting && !AoO && speaker.token) {
			if (tokenToUse && targetsToUse.size > 0) {
				if (rangeDetails.result === "fail")
					return null;
				else
					tokenToUse = rangeDetails.attackingToken;
			}
		}
		if (this.type === "spell" && shouldAllowRoll) {
			const midiFlags = this.actor.flags["midi-qol"];
			const needsVerbal = this.system.properties.has("vocal");
			const needsSomatic = this.system.properties.has("somatic");
			const needsMaterial = this.system.properties.has("material");
			//TODO Consider how to disable this check for DamageOnly workflows and trap workflows
			if (midiFlags?.fail?.spell?.all) {
				ui.notifications?.warn("You are unable to cast the spell");
				return null;
			}
			if ((midiFlags?.fail?.spell?.verbal || midiFlags?.fail?.spell?.vocal) && needsVerbal) {
				ui.notifications?.warn("You make no sound and the spell fails");
				return null;
			}
			if (midiFlags?.fail?.spell?.somatic && needsSomatic) {
				ui.notifications?.warn("You can't make the gestures and the spell fails");
				return null;
			}
			if (midiFlags?.fail?.spell?.material && needsMaterial) {
				ui.notifications?.warn("You can't use the material component and the spell fails");
				return null;
			}
		}
		const needsConcentration = itemRequiresConcentration(this);
		let checkConcentration = configSettings.concentrationAutomation;
		if (needsConcentration && checkConcentration) {
			const concentrationEffect = getConcentrationEffect(this.actor);
			if (concentrationEffect) {
				//@ts-ignore
				const concentrationEffectName = (concentrationEffect._sourceName && concentrationEffect._sourceName !== "None") ? concentrationEffect._sourceName : "";
				shouldAllowRoll = false;
				let d = await Dialog.confirm({
					title: i18n("midi-qol.ActiveConcentrationSpell.Title"),
					content: i18n(concentrationEffectName ? "midi-qol.ActiveConcentrationSpell.ContentNamed" : "midi-qol.ActiveConcentrationSpell.ContentGeneric").replace("@NAME@", concentrationEffectName),
					yes: () => { shouldAllowRoll = true; },
				});
				if (!shouldAllowRoll)
					return null; // user aborted spell
			}
		}
		if (!shouldAllowRoll) {
			return null;
		}
		let workflow;
		workflow = new Workflow(this.actor, this, speaker, targetsToUse, { event: config.event || options.event || event, pressedKeys, workflowOptions: options.workflowOptions });
		workflow.inCombat = inCombat ?? false;
		workflow.isTurn = isTurn ?? false;
		workflow.AoO = AoO;
		workflow.config = config;
		workflow.options = options;
		workflow.attackingToken = tokenToUse;
		workflow.rangeDetails = rangeDetails;
		workflow.castData = {
			baseLevel: this.system.level,
			castLevel: workflow.itemLevel,
			itemUuid: workflow.itemUuid
		};
		if (configSettings.undoWorkflow)
			await saveUndoData(workflow);
		workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile || workflow.isVersatile;
		// if showing a full card we don't want to auto roll attacks or damage.
		workflow.noAutoDamage = systemCard;
		workflow.noAutoAttack = systemCard;
		const consume = this.system.consume;
		if (consume?.type === "ammo") {
			workflow.ammo = this.actor.items.get(consume.target);
		}
		workflow.reactionQueried = false;
		const blockReaction = itemUsesReaction && hasReaction && workflow.inCombat && needsReactionCheck(this.actor) && !options?.ammoSelector?.hasRun;
		if (blockReaction) {
			let shouldRoll = false;
			let d = await Dialog.confirm({
				title: i18n("midi-qol.EnforceReactions.Title"),
				content: i18n("midi-qol.EnforceReactions.Content"),
				yes: () => { shouldRoll = true; },
			});
			if (!shouldRoll) {
				await workflow.performState(workflow.WorkflowState_Abort);
				return null; // user aborted roll TODO should the workflow be deleted?
			}
		}
		const hasBonusAction = hasUsedBonusAction(this.actor);
		const itemUsesBonusAction = ["bonus"].includes(this.system.activation?.type);
		const blockBonus = workflow.inCombat && itemUsesBonusAction && hasBonusAction && needsBonusActionCheck(this.actor) && !options?.ammoSelector?.hasRun;
		if (blockBonus) {
			let shouldRoll = false;
			let d = await Dialog.confirm({
				title: i18n("midi-qol.EnforceBonusActions.Title"),
				content: i18n("midi-qol.EnforceBonusActions.Content"),
				yes: () => { shouldRoll = true; },
			});
			if (!shouldRoll)
				return workflow.performState(workflow.WorkflowState_Abort); // user aborted roll TODO should the workflow be deleted?
		}
		const hookAbort = await asyncHooksCall("midi-qol.preItemRoll", workflow) === false || await asyncHooksCall(`midi-qol.preItemRoll.${this.uuid}`, workflow) === false;
		if (hookAbort || workflow.aborted) {
			console.warn("midi-qol | attack roll blocked by preItemRoll hook");
			workflow.aborted = true;
			return workflow.performState(workflow.WorkflowState_Abort);
			// Workflow.removeWorkflow(workflow.id);
			// return;
		}
		if (configSettings.allowUseMacro) {
			const results = await workflow.callMacros(this, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll");
			if (workflow.aborted || results.some(i => i === false)) {
				console.warn("midi-qol | item roll blocked by preItemRoll macro");
				workflow.aborted = true;
				return workflow.performState(workflow.WorkflowState_Abort);
			}
			const ammoResults = await workflow.callMacros(workflow.ammo, workflow.ammoOnUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll");
			if (workflow.aborted || ammoResults.some(i => i === false)) {
				console.warn(`midi-qol | item ${workflow.ammo.name ?? ""} roll blocked by preItemRoll macro`);
				workflow.aborted = true;
				return workflow.performState(workflow.WorkflowState_Abort);
			}
		}
		if (options.configureDialog) {
			if (this.type === "spell") {
				if (["both", "spell"].includes(isAutoConsumeResource(workflow))) { // && !workflow.rollOptions.fastForward) {
					options.configureDialog = false;
					// Check that there is a spell slot of the right level
					const spells = this.actor.system.spells;
					if (spells[`spell${this.system.level}`]?.value === 0 &&
						(spells.pact.value === 0 || spells.pact.level < this.system.level)) {
						options.configureDialog = true;
					}
					if (!options.configureDialog && this.hasAreaTarget && this.actor?.sheet) {
						setTimeout(() => {
							this.actor?.sheet.minimize();
						}, 100);
					}
				}
			}
			else
				options.configureDialog = !(["both", "item"].includes(isAutoConsumeResource(workflow)));
		}
		workflow.processAttackEventOptions();
		await workflow.checkAttackAdvantage();
		workflow.showCard = true;
		const wrappedRollStart = Date.now();
		const token = getToken(workflow.tokenUuid);
		const autoCreatetemplate = token && hasAutoPlaceTemplate(this);
		let result = await wrapped(workflow.config, foundry.utils.mergeObject(options, { workflowId: workflow.id }, { inplace: false }));
		if (!result) {
			await workflow.performState(workflow.WorkflowState_Abort);
			return null;
		}
		if (autoCreatetemplate) {
			const gs = canvas?.dimensions?.distance ?? 5;
			const templateOptions = {};
			// square templates don't respect the options distance field
			let item = this;
			let target = item.system.target ?? { value: 0 };
			const useSquare = target.type === "squareRadius";
			if (useSquare) {
				item = this.clone({ "system.target.value": target.value * 2, "system.target.type": "square" });
				target = item.system.target ?? { value: 0 };
			}
			const fudge = 0.1;
			//@ts-expect-error width/height
			const { width, height } = token.document;
			if (useSquare) {
				templateOptions.distance = target.value + fudge + Math.max(width, height, 0) * gs;
				item = item.clone({ "system.target.value": templateOptions.distance, "system.target.type": "square" });
			}
			else
				templateOptions.distance = Math.ceil(target.value + Math.max(width / 2, height / 2, 0) * (canvas?.dimensions?.distance ?? 0));
			if (useSquare) {
				const adjust = (templateOptions.distance ?? target.value) / 2;
				templateOptions.x = Math.floor((token.center?.x ?? 0) - adjust / gs * (canvas?.dimensions?.size ?? 0));
				templateOptions.y = token.center?.y ?? 0;
				if (game.settings.get("dnd5e", "gridAlignedSquareTemplates")) {
					templateOptions.y = Math.floor((token.center?.y ?? 0) - adjust / gs * (canvas?.dimensions?.size ?? 0));
				}
			}
			else {
				templateOptions.x = token.center?.x ?? 0;
				templateOptions.y = token.center?.y ?? 0;
			}
			if (workflow?.actor)
				foundry.utils.setProperty(templateOptions, "flags.midi-qol.actorUuid", workflow.actor.uuid);
			if (workflow?.tokenId)
				foundry.utils.setProperty(templateOptions, "flags.midi-qol.tokenId", workflow.tokenId);
			if (workflow)
				foundry.utils.setProperty(templateOptions, "flags.midi-qol.workflowId", workflow.id);
			foundry.utils.setProperty(templateOptions, "flags.midi-qol.itemUuid", this.uuid);
			//@ts-expect-error .canvas
			let template = game.system.canvas.AbilityTemplate.fromItem(item, templateOptions);
			const templateData = template.document.toObject();
			if (this.item)
				foundry.utils.setProperty(templateData, "flags.midi-qol.itemUuid", this.item.uuid);
			if (this.actor)
				foundry.utils.setProperty(templateData, "flags.midi-qol.actorUuid", this.actor.uuid);
			if (!foundry.utils.getProperty(templateData, "flags.dnd5e.origin"))
				foundry.utils.setProperty(templateData, "flags.dnd5e.origin", this.item?.uuid);
			//@ts-expect-error
			const templateDocuments = await canvas?.scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
			if (templateDocuments && templateDocuments.length > 0) {
				let td = templateDocuments[0];
				await td.object?.refresh();
				await busyWait(0.01);
				workflow.templateUuid = td.uuid;
				workflow.templateId = td?.object?.id;
				if (token && installedModules.get("walledtemplates") && this.flags?.walledtemplates?.attachToken === "caster") {
					//@ts-expect-error .object
					await token.attachTemplate(td.object, { "flags.dae.stackable": "noneName" }, true);
					if (workflow && !foundry.utils.getProperty(workflow, "item.flags.walledtemplates.noAutotarget"))
						selectTargets.bind(workflow)(td);
				}
				else if (getAutoTarget(workflow?.item) !== "none")
					selectTargets.bind(workflow)(td);
			}
		}
		if (needsConcentration && checkConcentration) {
			const concentrationEffect = getConcentrationEffect(this.actor);
			if (concentrationEffect) {
				await removeConcentrationEffects(this.actor, undefined, { noConcentrationCheck: false });
			}
		}
		if (itemUsesBonusAction && !hasBonusAction && configSettings.enforceBonusActions !== "none" && workflow.inCombat)
			await setBonusActionUsed(this.actor);
		if (itemUsesReaction && !hasReaction && configSettings.enforceReactions !== "none" && workflow.inCombat)
			await setReactionUsed(this.actor);
		if (debugCallTiming)
			log(`wrapped item.roll() elapsed ${Date.now() - wrappedRollStart}ms`);
		if (debugCallTiming)
			log(`item.roll() elapsed ${Date.now() - itemRollStart}ms`);
		// Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
		workflow.preItemUseComplete = true;
		// workflow is suspended pending completion of the itemUse actions?
		const shouldUnsuspend = ([workflow.WorkflowState_AwaitItemCard, workflow.WorkflowState_AwaitTemplate, workflow.WorkflowState_NoAction].includes(workflow.currentAction) && workflow.suspended && !workflow.needTemplate && !workflow.needItemCard);
		if (debugEnabled > 0)
			warn(`Item use complete: unsuspending ${workflow.workflowName} ${workflow.nameForState(workflow.currentAction)} unsuspending: ${shouldUnsuspend}, workflow suspended: ${workflow.suspended} needs template: ${workflow.needTemplate}, needs Item card ${workflow.needItemCard}`);
		if (shouldUnsuspend) {
			workflow.unSuspend.bind(workflow)({ itemUseComplete: true });
		}
		return result;
	}
	catch (err) {
		const message = `doItemUse error for ${this.actor?.name} ${this.name} ${this.uuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
// export async function doAttackRoll(wrapped, options = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, versatile: false, resetAdvantage: false, chatMessage: undefined, createWorkflow: true, fastForward: false, advantage: false, disadvantage: false, dialogOptions: {}, isDummy: false }) {
// workflow.advantage/disadvantage/fastforwrd set by settings and conditions
// workflow.rollOptions advantage/disadvantage/fastforward set by keyboard moeration
// workflow.workflowOptions set by options passed to do item.use/item.attackRoll
export async function doAttackRoll(wrapped, options = { versatile: false, resetAdvantage: false, chatMessage: undefined, createWorkflow: true, fastForward: false, advantage: false, disadvantage: false, dialogOptions: {}, isDummy: false }) {
	try {
		let workflow = options.isDummy ? undefined : Workflow.getWorkflow(this.uuid);
		// if rerolling the attack re-record the rollToggle key.
		if (workflow?.attackRoll) {
			workflow.advantage = false;
			workflow.disadvantage = false;
			workflow.rollOptions.rollToggle = globalThis.MidiKeyManager.pressedKeys.rollToggle;
			if (workflow.currentAction !== workflow.WorkflowState_Completed && configSettings.undoWorkflow) {
				untimedExecuteAsGM("undoTillWorkflow", workflow.id, false, false);
			}
		}
		if (workflow && !workflow.reactionQueried) {
			workflow.rollOptions = foundry.utils.mergeObject(workflow.rollOptions, mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow.rollOptions?.rollToggle), { overwrite: true, insertValues: true, insertKeys: true });
		}
		//@ts-ignore
		if (CONFIG.debug.keybindings && workflow) {
			log("itemhandling doAttackRoll: workflow.rolloptions", workflow.rollOption);
			log("item handling newOptions", mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow.rollOptions?.rollToggle));
		}
		const attackRollStart = Date.now();
		if (debugEnabled > 1)
			debug("Entering item attack roll ", event, workflow, Workflow._workflows);
		if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
			if (enableWorkflow && debugEnabled > 0)
				warn("Roll Attack: No workflow for item ", this.name, this.id, event);
			const roll = await wrapped(options);
			return roll;
		}
		workflow.systemCard = options.systemCard;
		if (["Workflow"].includes(workflow.workflowType)) {
			if (this.system.target?.type === "self") {
				workflow.targets = getTokenForActorAsSet(this.actor);
			}
			else if (game.user?.targets?.size ?? 0 > 0)
				workflow.targets = validTargetTokens(game.user?.targets);
			if (workflow.attackRoll && workflow.currentAction === workflow.WorkflowState_Completed) {
				// we are re-rolling the attack.
				await workflow.setDamageRolls(undefined);
				if (workflow.itemCardUuid) {
					await Workflow.removeItemCardAttackDamageButtons(workflow.itemCardUuid);
					await Workflow.removeItemCardConfirmRollButton(workflow.itemCardUuid);
				}
				if (workflow.damageRollCount > 0) { // re-rolling damage counts as new damage
					const itemCard = await this.displayCard(foundry.utils.mergeObject(options, { systemCard: false, workflowId: workflow.id, minimalCard: false, createMessage: true }));
					workflow.itemCardId = itemCard.id;
					workflow.itemCardUuid = itemCard.uuid;
					workflow.needItemCard = false;
				}
			}
		}
		if (options.resetAdvantage) {
			workflow.advantage = false;
			workflow.disadvantage = false;
			workflow.rollOptions = foundry.utils.deepClone(defaultRollOptions);
		}
		if (workflow instanceof TrapWorkflow)
			workflow.rollOptions.fastForward = true;
		if (configSettings.allowUseMacro && workflow.options.noTargetOnusemacro !== true) {
			await workflow.triggerTargetMacros(["isPreAttacked"]);
			if (workflow.aborted) {
				console.warn(`midi-qol | item ${workflow.ammo.name ?? ""} roll blocked by isPreAttacked macro`);
				return workflow.performState(workflow.WorkflowState_Abort);
			}
		}
		const promises = [];
		if (!foundry.utils.getProperty(this, "flags.midi-qol.noProvokeReaction")) {
			for (let targetToken of workflow.targets) {
				promises.push(new Promise(async (resolve) => {
					//@ts-expect-error targetToken Type
					const result = await doReactions(targetToken, workflow.tokenUuid, null, "reactionpreattack", { item: this, workflow, workflowOptions: foundry.utils.mergeObject(workflow.workflowOptions, { sourceActorUuid: this.actor?.uuid, sourceItemUuid: this?.uuid }, { inplace: false, overwrite: true }) });
					if (result?.name) {
						//@ts-expect-error _initialize()
						targetToken.actor?._initialize();
						// targetToken.actor?.prepareData(); // allow for any items applied to the actor - like shield spell
					}
					resolve(result);
				}));
			}
		}
		await Promise.allSettled(promises);
		// Compute advantage
		await workflow.checkAttackAdvantage();
		if (await asyncHooksCall("midi-qol.preAttackRoll", workflow) === false || await asyncHooksCall(`midi-qol.preAttackRoll.${this.uuid}`, workflow) === false) {
			console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
			return;
		}
		// Active defence resolves by triggering saving throws and returns early
		if (game.user?.isGM && workflow.useActiveDefence) {
			delete options.event; // for dnd 3.0
			let result = await wrapped(foundry.utils.mergeObject(options, {
				advantage: false,
				disadvantage: workflow.rollOptions.disadvantage,
				chatMessage: false,
				fastForward: true,
				messageData: {
					speaker: getSpeaker(this.actor)
				}
			}, { overwrite: true, insertKeys: true, insertValues: true }));
			return workflow.activeDefence(this, result);
		}
		// Advantage is true if any of the sources of advantage are true;
		let advantage = options.advantage
			|| workflow.options.advantage
			|| workflow?.advantage
			|| workflow?.rollOptions.advantage
			|| workflow?.workflowOptions?.advantage
			|| workflow.flankingAdvantage;
		if (workflow.noAdvantage)
			advantage = false;
		// Attribute advantaage
		if (workflow.rollOptions.advantage) {
			workflow.attackAdvAttribution.add(`ADV:keyPress`);
			workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
		}
		if (workflow.flankingAdvantage) {
			workflow.attackAdvAttribution.add(`ADV:flanking`);
			workflow.advReminderAttackAdvAttribution.add(`ADV:Flanking`);
		}
		let disadvantage = options.disadvantage
			|| workflow.options.disadvantage
			|| workflow?.disadvantage
			|| workflow?.workflowOptions?.disadvantage
			|| workflow.rollOptions.disadvantage;
		if (workflow.noDisadvantage)
			disadvantage = false;
		if (workflow.rollOptions.disadvantage) {
			workflow.attackAdvAttribution.add(`DIS:keyPress`);
			workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
		}
		if (workflow.workflowOptions?.disadvantage)
			workflow.attackAdvAttribution.add(`DIS:workflowOptions`);
		if (advantage && disadvantage) {
			advantage = false;
			disadvantage = false;
		}
		const wrappedRollStart = Date.now();
		workflow.attackRollCount += 1;
		if (workflow.attackRollCount > 1)
			workflow.damageRollCount = 0;
		// create an options object to pass to the roll.
		// advantage/disadvantage are already set (in options)
		const wrappedOptions = foundry.utils.mergeObject(options, {
			chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : options.chatMessage,
			fastForward: workflow.workflowOptions?.fastForwardAttack ?? workflow.rollOptions.fastForwardAttack ?? options.fastForward,
			messageData: {
				speaker: getSpeaker(this.actor)
			}
		}, { insertKeys: true, overwrite: true });
		if (workflow.rollOptions.rollToggle)
			wrappedOptions.fastForward = !wrappedOptions.fastForward;
		if (advantage)
			wrappedOptions.advantage = true; // advantage passed to the roll takes precedence
		if (disadvantage)
			wrappedOptions.disadvantage = true; // disadvantage passed to the roll takes precedence
		// Setup labels for advantage reminder
		const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));
		;
		if (advantageLabels.length > 0)
			foundry.utils.setProperty(wrappedOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
		const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
		if (disadvantageLabels.length > 0)
			foundry.utils.setProperty(wrappedOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);
		// It seems that sometimes the option is true/false but when passed to the roll the critical threshold needs to be a number
		if (wrappedOptions.critical === true || wrappedOptions.critical === false)
			wrappedOptions.critical = this.criticalThreshold;
		if (wrappedOptions.fumble === true || wrappedOptions.fumble === false)
			delete wrappedOptions.fumble;
		wrappedOptions.chatMessage = false;
		Hooks.once("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
			if ((workflow?.attackRollCount ?? 0) > 1) {
				while (ammoUpdate.length > 0)
					ammoUpdate.pop();
			}
		});
		delete wrappedOptions.event; // for dnd5e stop the event being passed to the roll or errors will happend
		let result = await wrapped(wrappedOptions);
		if (!result)
			return result;
		result = Roll.fromJSON(JSON.stringify(result.toJSON()));
		const maxflags = foundry.utils.getProperty(workflow, "actor.flags.midi-qol.max") ?? {};
		if ((maxflags.attack && (maxflags.attack.all || maxflags.attack[this.system.actionType])) ?? false)
			result = await result.reroll({ maximize: true });
		const minflags = foundry.utils.getProperty(this, "flags.midi-qol.min") ?? {};
		if ((minflags.attack && (minflags.attack.all || minflags.attack[this.system.actionType])) ?? false)
			result = await result.reroll({ minimize: true });
		if (["formulaadv", "adv"].includes(configSettings.rollAlternate))
			addAdvAttribution(result, workflow.attackAdvAttribution);
		await workflow.setAttackRoll(result);
		// workflow.ammo = this._ammo; Work out why this was here - seems to just break stuff
		if (workflow.workflowOptions?.attackRollDSN !== false)
			await displayDSNForRoll(result, "attackRollD20");
		await workflow.processAttackRoll();
		result = await processAttackRollBonusFlags.bind(workflow)();
		if (configSettings.keepRollStats) {
			const terms = result.terms;
			const rawRoll = Number(terms[0].total);
			const total = result.total;
			const options = terms[0].options;
			const fumble = rawRoll <= options.fumble;
			const critical = rawRoll >= options.critical;
			gameStats.addAttackRoll({ rawRoll, total, fumble, critical }, this);
		}
		if (workflow.targets?.size === 0) { // no targets recorded when we started the roll grab them now
			workflow.targets = validTargetTokens(game.user?.targets);
		}
		if (!result) { // attack roll failed.
			const message = `itemhandling.rollAttack failed for ${this?.name} ${this?.uuid}`;
			error(message);
			TroubleShooter.recordError(new Error(message), message);
			return;
		}
		if (debugCallTiming)
			log(`final item.rollAttack():  elapsed ${Date.now() - attackRollStart}ms`);
		// Can this cause a race condition?
		if (workflow.suspended)
			workflow.unSuspend.bind(workflow)({ attackRoll: result });
		// workflow.performState(workflow.WorkflowState_AttackRollComplete);
		return result;
	}
	catch (err) {
		const message = `doAttackRoll Error for ${this.parent?.name} ${this.name} ${this.uuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
export async function doDamageRoll(wrapped, { event = undefined, critical = false, systemCard = false, spellLevel = null, powerLevel = null, versatile = null, options = {} } = {}) {
	//@ts-expect-error
	const DamageRoll = CONFIG.Dice.DamageRoll;
	try {
		const pressedKeys = globalThis.MidiKeyManager.pressedKeys; // record the key state if needed
		let workflow = Workflow.getWorkflow(this.uuid);
		if (workflow && systemCard)
			workflow.systemCard = true;
		if (workflow && !workflow.shouldRollDamage) // if we did not auto roll then process any keys
			workflow.rollOptions = foundry.utils.mergeObject(workflow.rollOptions, mapSpeedKeys(pressedKeys, "damage", workflow.rollOptions?.rollToggle), { insertKeys: true, insertValues: true, overwrite: true });
		//@ts-expect-error
		if (CONFIG.debug.keybindings) {
			log("itemhandling: workflow.rolloptions", workflow?.rollOption);
			log("item handling newOptions", mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow?.rollOptions?.rollToggle));
		}
		if (workflow?.workflowType === "TrapWorkflow")
			workflow.rollOptions.fastForward = true;
		const damageRollStart = Date.now();
		if (!enableWorkflow || !workflow) {
			if (!workflow && debugEnabled > 0)
				warn("Roll Damage: No workflow for item ", this.name);
			return wrapped({ critical, event, versatile, spellLevel, powerLevel, options });
		}
		const midiFlags = workflow.actor.flags["midi-qol"];
		if (workflow.currentAction !== workflow.WorkflowStaate_WaitForDamageRoll && workflow.noAutoAttack) {
			// TODO NW check this allow damage roll to go ahead if it's an ordinary roll
			workflow.currentAction = workflow.WorkflowState_WaitForDamageRoll;
		}
		if (workflow.currentAction !== workflow.WorkflowState_WaitForDamageRoll) {
			if (workflow.currentAction === workflow.WorkflowState_AwaitTemplate)
				return ui.notifications?.warn(i18n("midi-qol.noTemplateSeen"));
			else if (workflow.currentAction === workflow.WorkflowState_WaitForAttackRoll)
				return ui.notifications?.warn(i18n("midi-qol.noAttackRoll"));
		}
		if (workflow.damageRollCount > 0) { // we are re-rolling the damage. redisplay the item card but remove the damage if the roll was finished
			let chatMessage = getCachedDocument(workflow.itemCardUuid);
			// let chatMessage = game.messages?.get(workflow.itemCardId ?? "");
			//@ts-ignore content v10
			let content = (chatMessage && chatMessage.content) ?? "";
			let data;
			if (content) {
				data = chatMessage?.toObject(); // TODO check this v10
				content = data.content || "";
				let searchRe = /<div class="midi-qol-damage-roll">[\s\S\n\r]*<div class="end-midi-qol-damage-roll">/;
				let replaceString = `<div class="midi-qol-damage-roll"><div class="end-midi-qol-damage-roll">`;
				content = content.replace(searchRe, replaceString);
				searchRe = /<div class="midi-qol-other-roll">[\s\S\n\r]*<div class="end-midi-qol-other-roll">/;
				replaceString = `<div class="midi-qol-other-roll"><div class="end-midi-qol-other-roll">`;
				content = content.replace(searchRe, replaceString);
				searchRe = /<div class="midi-qol-bonus-roll">[\s\S\n\r]*<div class="end-midi-qol-bonus-roll">/;
				replaceString = `<div class="midi-qol-bonus-roll"><div class="end-midi-qol-bonus-roll">`;
				content = content.replace(searchRe, replaceString);
			}
			if (data && workflow.currentAction === workflow.WorkflowState_Completed) {
				if (workflow.itemCardUuid) {
					await Workflow.removeItemCardAttackDamageButtons(workflow.itemCardUuid);
					await Workflow.removeItemCardConfirmRollButton(workflow.itemCardUuid);
				}
				delete data._id;
				const itemCard = await ChatMessage.create(data);
				workflow.itemCardId = itemCard?.id;
				workflow.itemCardUuid = itemCard?.uuid;
			}
		}
		;
		workflow.processDamageEventOptions();
		// Allow overrides form the caller
		if (spellLevel)
			workflow.rollOptions.spellLevel = spellLevel;
		if (powerLevel)
			workflow.rollOptions.spellLevel = powerLevel;
		if (workflow.isVersatile || versatile)
			workflow.rollOptions.versatile = true;
		if (debugEnabled > 0)
			warn("rolling damage  ", this.name, this);
		if (await asyncHooksCall("midi-qol.preDamageRoll", workflow) === false || await asyncHooksCall(`midi-qol.preDamageRoll.${this.uuid}`, workflow) === false) {
			console.warn("midi-qol | Damage roll blocked via pre-hook");
			return;
		}
		//@ts-expect-error .critical
		if (options?.critical !== undefined)
			workflow.isCritical = options?.critical;
		const wrappedRollStart = Date.now();
		workflow.damageRollCount += 1;
		let result;
		let result2;
		if (!workflow.rollOptions.other) {
			const damageRollOptions = foundry.utils.mergeObject(options, {
				fastForward: workflow.workflowOptions?.fastForwardDamage ?? workflow.rollOptions.fastForwardDamage,
				chatMessage: false,
				returnMultiple: true,
			}, { overwrite: true, insertKeys: true, insertValues: true });
			const damageRollData = {
				critical: workflow.workflowOptions?.critical || (workflow.rollOptions.critical || workflow.isCritical || critical),
				spellLevel: workflow.rollOptions.spellLevel,
				powerLevel: workflow.rollOptions.spellLevel,
				versatile: workflow.rollOptions.versatile,
				// dnd3 event: {},
				event: undefined,
				options: damageRollOptions
			};
			result = await wrapped(damageRollData);
			if (foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.advantage"))
				result2 = await wrapped(damageRollData);
			if (debugCallTiming)
				log(`wrapped item.rollDamage():  elapsed ${Date.now() - wrappedRollStart}ms`);
		}
		else { // roll other damage instead of main damage.
			// This is problematic - the dice roll can have multiple damage types in it, 
			let tempRoll = new DamageRoll(workflow.otherDamageFormula, workflow.otherDamageItem?.getRollData(), { critical: workflow.rollOptions.critical || workflow.isCritical, returnMultiple: false });
			tempRoll = Roll.fromTerms(tempRoll.terms);
			tempRoll = await tempRoll.evaluate({ async: true });
			result = [tempRoll];
		}
		if (!result) { // user backed out of damage roll or roll failed
			return;
		}
		let magicalDamage = workflow.item?.system.properties?.has("mgc") || workflow.item?.flags?.midiProperties?.magicdam;
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && workflow.item?.system.attackBonus > 0);
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && workflow.item?.type !== "weapon");
		magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && workflow.item?.type === "spell");
		if (result?.length > 0) {
			result.forEach(roll => {
				const droll = roll;
				if (!droll.options.properties)
					droll.options.properties = [];
				if (workflow?.item.type === "spell")
					droll.options.properties.push("spell");
				if (magicalDamage && !droll.options.properties.includes("mgc"))
					droll.options.properties.push("mgc");
				droll.options.properties.push(workflow?.item.system.actionType);
			});
		}
		//@ts-expect-error .first
		const firstTarget = workflow.hitTargets.first() ?? workflow.targets?.first();
		const firstTargetActor = firstTarget?.actor;
		const targetMaxFlags = foundry.utils.getProperty(firstTargetActor, "flags.midi-qol.grants.max.damage") ?? {};
		const maxFlags = foundry.utils.getProperty(workflow, "actor.flags.midi-qol.max") ?? {};
		let needsMaxDamage = (maxFlags.damage?.all && await evalActivationCondition(workflow, maxFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
			|| (maxFlags.damage && maxFlags.damage[this.system.actionType] && await evalActivationCondition(workflow, maxFlags.damage[this.system.actionType], firstTarget, { async: true, errorReturn: false }));
		needsMaxDamage = needsMaxDamage || ((targetMaxFlags.all && await evalActivationCondition(workflow, targetMaxFlags.all, firstTarget, { async: true, errorReturn: false }))
			|| (targetMaxFlags[this.system.actionType] && await evalActivationCondition(workflow, targetMaxFlags[this.system.actionType], firstTarget, { async: true, errorReturn: false })));
		const targetMinFlags = foundry.utils.getProperty(firstTargetActor, "flags.midi-qol.grants.min.damage") ?? {};
		const minFlags = foundry.utils.getProperty(workflow, "actor.flags.midi-qol.min") ?? {};
		let needsMinDamage = (minFlags.damage?.all && await evalActivationCondition(workflow, minFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
			|| (minFlags?.damage && minFlags.damage[this.system.actionType] && evalActivationCondition(workflow, minFlags.damage[this.system.actionType], firstTarget));
		needsMinDamage = needsMinDamage || ((targetMinFlags.damage && await evalActivationCondition(workflow, targetMinFlags.all, firstTarget, { async: true, errorReturn: false }))
			|| (targetMinFlags[this.system.actionType] && await evalActivationCondition(workflow, targetMinFlags[this.system.actionType], firstTarget, { async: true, errorReturn: false })));
		if (needsMaxDamage && needsMinDamage) {
			needsMaxDamage = false;
			needsMinDamage = false;
		}
		let actionFlavor;
		switch (game.system.id) {
			case "sw5e":
				actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "SW5E.Healing" : "SW5E.DamageRoll");
				break;
			case "n5e":
				actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "N5E.Healing" : "N5E.DamageRoll");
				break;
			case "dnd5e":
			default:
				actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");
		}
		const title = `${this.name} - ${actionFlavor}`;
		const speaker = getSpeaker(this.actor);
		let messageData = foundry.utils.mergeObject({
			title,
			flavor: this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title,
			speaker,
		}, { "flags.dnd5e.roll": { type: "damage", itemId: this.id } });
		if (game.system.id === "sw5e")
			foundry.utils.setProperty(messageData, "flags.sw5e.roll", { type: "damage", itemId: this.id });
		if (needsMaxDamage) {
			for (let i = 0; i < result.length; i++) {
				result[i] = await result[i].reroll({ maximize: true });
			}
			// result = result.map(r => new DamageRoll(r.formula).roll({ maximize: true, async: false }));
		}
		else if (needsMinDamage) {
			for (let i = 0; i < result.length; i++) {
				result[i] = await result[i].reroll({ minimize: true });
				// result = result.map(r => new DamageRoll(r.formula).roll({ minimize: true, async: false }));
			}
		}
		else if (foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kh") || foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kl")) {
			let result2 = [];
			for (let i = 0; i < result.length; i++) {
				result2.push(await result[i].reroll({ async: true }));
				// result2 = result.map(r => r.reroll({ async: false }));
			}
			if ((foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kh") && (sumRolls(result2) > sumRolls(result)))
				|| (foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kl") && (sumRolls(result2) < sumRolls(result)))) {
				[result, result2] = [result2, result];
			}
			// display roll not being used.
			if (workflow.workflowOptions?.damageRollDSN !== false) {
				let promises = result2.map(r => displayDSNForRoll(r, "damageRoll"));
				await Promise.all(promises);
			}
			DamageRoll.toMessage(result2, messageData, { rollMode: game.settings.get("core", "rollMode") });
			// await result2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
		}
		setDamageRollMinTerms(result);
		if (this.system.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(workflow.defaultDamageType ?? ""))
			workflow.defaultDamageType = "healing";
		workflow.damageDetail = createDamageDetail({ roll: result, item: this, ammo: workflow.ammo, defaultType: workflow.defaultDamageType, versatile: workflow.rollOptions.versatile });
		await workflow.setDamageRolls(result);
		if (workflow.workflowOptions?.damageRollDSN !== false) {
			let promises = result.map(r => displayDSNForRoll(r, "damageRoll"));
			await Promise.all(promises);
		}
		result = await processDamageRollBonusFlags.bind(workflow)();
		if (result instanceof Array)
			await workflow.setDamageRolls(result);
		else
			await workflow.setDamageRolls[result];
		let card;
		if (!configSettings.mergeCard) {
			card = await DamageRoll.toMessage(result, messageData, { rollMode: game.settings.get("core", "rollMode") });
			// card = await result.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
		}
		if (workflow && configSettings.undoWorkflow) {
			// Assumes workflow.undoData.chatCardUuids has been initialised
			if (workflow.undoData && card) {
				workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat([card.uuid]);
				untimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
			}
		}
		// await workflow.setDamageRolls(result);
		let otherResult = undefined;
		let otherResult2 = undefined;
		workflow.shouldRollOtherDamage = await shouldRollOtherDamage.bind(workflow.otherDamageItem)(workflow, configSettings.rollOtherDamage, configSettings.rollOtherSpellDamage);
		if (workflow.shouldRollOtherDamage) {
			const otherRollOptions = {};
			if (game.settings.get("midi-qol", "CriticalDamage") === "default") {
				otherRollOptions.powerfulCritical = game.settings.get(game.system.id, "criticalDamageMaxDice");
				otherRollOptions.multiplyNumeric = game.settings.get(game.system.id, "criticalDamageModifiers");
			}
			otherRollOptions.critical = (workflow.otherDamageItem?.flags.midiProperties?.critOther ?? false) && (workflow.isCritical || workflow.rollOptions.critical);
			if ((workflow.otherDamageFormula ?? "") !== "") { // other damage formula swaps in versatile if needed
				let otherRollData = workflow.otherDamageItem?.getRollData();
				otherRollData.spellLevel = spellLevel;
				let otherRollResult = new DamageRoll(workflow.otherDamageFormula, otherRollData, otherRollOptions);
				otherRollResult = Roll.fromTerms(otherRollResult.terms); // coerce it back to a roll
				// let otherRollResult = new Roll.fromRoll((workflow.otherDamageFormula, otherRollData, otherRollOptions);
				otherResult = await otherRollResult?.evaluate({ async: true, maximize: needsMaxDamage, minimize: needsMinDamage });
				if (otherResult?.total !== undefined) {
					switch (game.system.id) {
						case "sw5e":
							actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "SW5E.Healing" : "SW5E.OtherFormula");
							break;
						case "n5e":
							actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "N5E.Healing" : "N5E.OtherFormula");
							break;
						case "dnd5e":
						default:
							actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "DND5E.Healing" : "DND5E.OtherFormula");
					}
					const title = `${this.name} - ${actionFlavor}`;
					const messageData = {
						title,
						flavor: title,
						speaker,
						itemId: this.id
					};
					if (configSettings.mergeCard)
						foundry.utils.setProperty(messageData, `flags.${game.system.id}.roll.type`, "midi");
					if ((foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kh")) ||
						(foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kl"))) {
						otherResult2 = await otherResult.reroll({ async: true });
						if (otherResult2?.total !== undefined && otherResult?.total !== undefined) {
							if ((foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kh") && (otherResult2?.total > otherResult?.total)) ||
								(foundry.utils.getProperty(this, "parent.flags.midi-qol.damage.reroll-kl") && (otherResult2?.total < otherResult?.total))) {
								[otherResult, otherResult2] = [otherResult2, otherResult];
							}
							// display roll not being used
							if (workflow.workflowOptions?.damageRollDSN !== false)
								await displayDSNForRoll(otherResult2, "damageRoll");
							await otherResult2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
						}
					}
					setDamageRollMinTerms([otherResult]);
					for (let term of otherResult.terms) {
						if (term.options?.flavor) {
							term.options.flavor = getDamageType(term.options.flavor);
						}
					}
					let otherMagicalDamage = workflow.otherDamageItem?.system.properties?.has("mgc") || workflow.otherDamageItem?.flags?.midiProperties?.magicdam;
					otherMagicalDamage = otherMagicalDamage || (configSettings.requireMagical === "off" && workflow.otherDamageItem?.system.attackBonus > 0);
					otherMagicalDamage = otherMagicalDamage || (configSettings.requireMagical === "off" && workflow.otherDamageItem?.type !== "weapon");
					otherMagicalDamage = otherMagicalDamage || (configSettings.requireMagical === "nonspell" && workflow.otherDamageItem?.type === "spell");
					if (!foundry.utils.getProperty(otherResult, "options.properties"))
						foundry.utils.setProperty(otherResult, "options.properties", []);
					const otherProperties = foundry.utils.getProperty(otherResult, "options.properties");
					if (workflow?.item.type === "spell")
						otherProperties.push("spell");
					if (otherMagicalDamage && !otherProperties.includes("mgc"))
						otherProperties.push("mgc");
					otherProperties.push(workflow?.otherDamageItem?.system.actionType);
					await workflow.setOtherDamageRoll(otherResult);
					workflow.otherDamageDetail = createDamageDetail({ roll: otherResult, item: null, ammo: null, versatile: false, defaultType: workflow.otherDamageItem.system.damage?.parts[0]?.[1] ?? workflow.defaultDamageType ?? MQdefaultDamageType });
					if (workflow.workflowOptions?.otherDamageRollDSN !== false)
						await displayDSNForRoll(otherResult, "damageRoll");
					if (!configSettings.mergeCard) {
						foundry.utils.setProperty(messageData, `flags.${game.system.id}.roll.type`, "other");
						foundry.utils.setProperty(messageData, `flags.${game.system.id}.roll.itemId`, this.id);
						await otherResult?.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
					}
				}
			}
		}
		workflow.bonusDamageRolls = null;
		workflow.bonusDamageHTML = null;
		if (debugCallTiming)
			log(`item.rollDamage():  elapsed ${Date.now() - damageRollStart}ms`);
		if (workflow.suspended)
			workflow.unSuspend.bind(workflow)({ damageRoll: result, otherDamageRoll: workflow.otherDamageRoll });
		// workflow.performState(workflow.WorkflowState_ConfirmRoll);
		return result;
	}
	catch (err) {
		const message = `doDamageRoll error for item ${this.parent?.name} ${this?.name} ${this.uuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
export function setDamageRollMinTerms(rolls) {
	if (rolls && sumRolls(rolls)) {
		for (let roll of rolls) {
			for (let term of roll.terms) {
				// I don't like the default display and it does not look good for dice so nice - fiddle the results for maximised rolls
				if (term instanceof Die && term.modifiers.includes(`min${term.faces}`)) {
					for (let result of term.results) {
						result.result = term.faces;
					}
				}
			}
		}
	}
}
export function preRollDamageHook(item, rollConfig) {
	if (item.flags.midiProperties?.offHandWeapon) {
		rollConfig.data.mod = Math.min(0, rollConfig.data.mod);
	}
	return true;
}
export function preItemUsageConsumptionHook(item, config, options) {
	/* Spell level can be fetched in preItemUsageConsumption */
	if (!game.settings.get("midi-qol", "EnableWorkflow"))
		return true;
	const workflow = Workflow.getWorkflow(item.uuid);
	if (!workflow) {
		if (!game.settings.get("midi-qol", "EnableWorkflow")) {
			const message = `Failed to find workflow in preItemUsageConsumption for ${item?.name} ${item?.uuid}`;
			error(message);
			TroubleShooter.recordError(new Error(message), message);
		}
		return true;
	}
	// need to get spell level from the html returned in result
	if (item.type === "spell") {
		workflow.itemLevel = item.system.level;
		workflow.castData.castLevel = item.system.level;
	}
	if (item.type === "power") {
		workflow.itemLevel = item.system.level;
		workflow.castData.castLevel = item.system.level;
	}
	workflow.dnd5eConsumptionConfig = config;
	return true;
}
// If we are blocking the roll let anyone waiting on the roll know it is complete
function blockRoll(item, workflow) {
	if (item) {
		if (workflow)
			workflow.aborted = true;
		let hookName = `midi-qol.RollComplete.${item?.uuid}`;
		Hooks.callAll(hookName, workflow);
	}
	return false;
}
// Override default display card method. Can't use a hook since a template is rendefed async
export async function wrappedDisplayCard(wrapped, options) {
	try {
		let { systemCard, workflowId, minimalCard, createMessage, workflow } = options ?? {};
		// let workflow = options.workflow; // Only DamageOnlyWorkflow passes this in
		if (workflowId)
			workflow = Workflow.getWorkflow(this.uuid);
		if (workflow)
			workflow.itemLevel = this.system.level;
		if (systemCard === undefined)
			systemCard = false;
		if (!workflow)
			return wrapped(options);
		if (debugEnabled > 0)
			warn("show item card ", this, this.actor, this.actor.token, systemCard, workflow);
		let token = tokenForActor(this.actor);
		let needAttackButton = !getRemoveAttackButtons(this) || configSettings.mergeCardMulti || configSettings.confirmAttackDamage !== "none" ||
			(!workflow.someAutoRollEventKeySet() && !getAutoRollAttack(workflow) && !workflow.rollOptions.autoRollAttack);
		const needDamagebutton = itemHasDamage(this) && ((["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || workflow.rollOptions?.rollToggle)
			|| configSettings.confirmAttackDamage !== "none"
			|| !getRemoveDamageButtons(this)
			|| systemCard
			|| configSettings.mergeCardMulti);
		const needVersatileButton = itemIsVersatile(this) && (systemCard || ["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || !getRemoveDamageButtons(this.item));
		// not used const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;
		const isPlayerOwned = this.actor.hasPlayerOwner;
		const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
			|| !configSettings.itemTypeList?.includes(this.type);
		const hasEffects = !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects) && hasDAE(workflow) && workflow.workflowType === "Workflow" && this.effects.find(ae => !ae.transfer && !foundry.utils.getProperty(ae, "flags.dae.dontApply"));
		let dmgBtnText = (this.system?.actionType === "heal") ? i18n(`${SystemString}.Healing`) : i18n(`${SystemString}.Damage`);
		if (workflow.rollOptions.fastForwardDamage && configSettings.showFastForward)
			dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;
		let versaBtnText = i18n(`${SystemString}.Versatile`);
		if (workflow.rollOptions.fastForwardDamage && configSettings.showFastForward)
			versaBtnText += ` ${i18n("midi-qol.fastForward")}`;
		const templateData = {
			actor: this.actor,
			// tokenId: token?.id,
			tokenId: token?.document?.uuid ?? token?.uuid ?? null,
			tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
			hasButtons: true,
			item: this,
			data: await this.system.getCardData(),
			labels: this.labels,
			//@ts-expect-error
			config: game.system.config,
			condensed: this.hasAttack && configSettings.mergeCardCondensed,
			hasAttack: !minimalCard && this.hasAttack && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
			isHealing: !minimalCard && this.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
			hasDamage: needDamagebutton,
			isVersatile: needVersatileButton,
			isSpell: this.type === "spell",
			isPower: this.type === "power",
			hasSave: !minimalCard && this.hasSave && (systemCard || configSettings.autoCheckSaves === "none"),
			hasAreaTarget: !minimalCard && this.hasAreaTarget,
			hasAttackRoll: !minimalCard && this.hasAttack,
			configSettings,
			hideItemDetails,
			dmgBtnText,
			versaBtnText,
			showProperties: workflow.workflowType === "Workflow",
			hasEffects,
			effects: this.effects,
			isMerge: configSettings.mergeCard,
			mergeCardMulti: configSettings.mergeCardMulti && (this.hasAttack || this.hasDamage),
			confirmAttackDamage: configSettings.confirmAttackDamage !== "none" && (this.hasAttack || this.hasDamage),
			RequiredMaterials: i18n(`${SystemString}.RequiredMaterials`),
			Attack: i18n(`${SystemString}.Attack`),
			SavingThrow: i18n(`${SystemString}.SavingThrow`),
			OtherFormula: i18n(`${SystemString}.OtherFormula`),
			PlaceTemplate: i18n(`${SystemString}.PlaceTemplate`),
			Use: i18n(`${SystemString}.Use`),
			canCancel: configSettings.undoWorkflow // TODO enable this when more testing done.
		};
		const templateType = ["tool"].includes(this.type) ? this.type : "item";
		const template = `modules/midi-qol/templates/${templateType}-card.hbs`;
		const html = await renderTemplate(template, templateData);
		if (debugEnabled > 1)
			debug(" Show Item Card ", configSettings.useTokenNames, (configSettings.useTokenNames && token) ? token?.name : this.actor.name, token, token?.name, this.actor.name);
		let theSound = configSettings.itemUseSound;
		if (this.type === "weapon") {
			theSound = configSettings.weaponUseSound;
			if (["rwak"].includes(this.system.actionType))
				theSound = configSettings.weaponUseSoundRanged;
		}
		else if (["spell", "power"].includes(this.type)) {
			theSound = configSettings.spellUseSound;
			if (["rsak", "rpak"].includes(this.system.actionType))
				theSound = configSettings.spellUseSoundRanged;
		}
		else if (this.type === "consumable" && this.name.toLowerCase().includes(i18n("midi-qol.potion").toLowerCase()))
			theSound = configSettings.potionUseSound;
		const chatData = {
			user: game.user?.id,
			content: html,
			// flavor: this.system.chatFlavor, with dnd5e 3.1 the chat flavor is in the description.
			//@ts-expect-error token vs tokenDocument
			speaker: ChatMessage.getSpeaker({ actor: this.actor, token: (token?.document ?? token) }),
			flags: {
				"midi-qol": {
					itemUuid: workflow.item.uuid,
					actorUuid: workflow.actor.uuid,
					sound: theSound,
					type: MESSAGETYPES.ITEM,
					itemId: workflow.itemId,
					workflowId: workflow.item.uuid
				},
				"core": { "canPopout": true }
			}
		};
		//@ts-expect-error
		if (game.release.generation < 12) {
			chatData.type = CONST.CHAT_MESSAGE_TYPES.OTHER;
		}
		else {
			//@ts-expect-error
			chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
		}
		if (workflow.flagTags)
			chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", workflow.flagTags);
		// Temp items (id undefined) or consumables that were removed need itemData set.
		if (!this.id || (this.type === "consumable" && !this.actor.items.has(this.id))) {
			foundry.utils.setProperty(chatData, `flags.${game.system.id}.itemData`, this.toObject()); // TODO check this v10
		}
		foundry.utils.setProperty(chatData, `flags.${game.system.id}.roll.type`, "midi");
		chatData.flags = foundry.utils.mergeObject(chatData.flags, options.flags);
		Hooks.callAll("dnd5e.preDisplayCard", this, chatData, options);
		workflow.chatUseFlags = foundry.utils.getProperty(chatData, "flags") ?? {};
		ChatMessage.applyRollMode(chatData, options.rollMode ?? game.settings.get("core", "rollMode"));
		let card;
		if (createMessage == false)
			card = chatData;
		if (configSettings.mergeCard) {
			card = await ChatMessageMidi.create(chatData);
		}
		else {
			//@ts-expect-error
			card = createMessage !== false ? await game.system.documents.ChatMessage5e.create(chatData) : chatData;
		}
		Hooks.callAll("dnd5e.displayCard", this, card);
		return card;
	}
	catch (err) {
		const message = `wrappedDisplayCard error for ${this.parent?.name} ${this.name} ${this.uuid}`;
		TroubleShooter.recordError(message, err);
		throw err;
	}
}
export async function resolveTargetConfirmation(item, options, pressedKeys) {
	const savedSettings = { control: ui.controls?.control?.name, tool: ui.controls?.tool };
	const savedActiveLayer = canvas?.activeLayer;
	await canvas?.tokens?.activate();
	ui.controls?.initialize({ tool: "target", control: "token" });
	const wasMaximized = !(item.actor.sheet?._minimized);
	// Hide the sheet that originated the preview
	if (wasMaximized)
		await item.actor.sheet.minimize();
	let targets = new Promise((resolve, reject) => {
		// no timeout since there is a dialog to close
		// create target dialog which updates the target display
		options = foundry.utils.mergeObject(options, { callback: resolve, pressedKeys });
		let targetConfirmation = new TargetConfirmationDialog(item.actor, item, game.user, options).render(true);
	});
	let shouldContinue = await targets;
	if (savedActiveLayer)
		await savedActiveLayer.activate();
	if (savedSettings.control && savedSettings.tool)
		//@ts-ignore savedSettings.tool is really a string
		ui.controls?.initialize(savedSettings);
	if (wasMaximized)
		await item.actor.sheet.maximize();
	return shouldContinue ? true : false;
}
export async function showItemInfo() {
	const token = this.actor.token;
	const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;
	const templateData = {
		actor: this.actor,
		// tokenId: token?.id,
		tokenId: token?.document?.uuid ?? token?.uuid,
		tokenUuid: token?.document?.uuid ?? token?.uuid,
		item: this,
		itemUuid: this.uuid,
		data: await await this.system.getCardData(),
		labels: this.labels,
		condensed: false,
		hasAttack: false,
		isHealing: false,
		hasDamage: false,
		isVersatile: false,
		isSpell: this.type === "spell",
		isPower: this.type === "power",
		hasSave: false,
		hasAreaTarget: false,
		hasAttackRoll: false,
		configSettings,
		hideItemDetails: false,
		hasEffects: false,
		isMerge: false,
	};
	const templateType = ["tool"].includes(this.type) ? this.type : "item";
	const template = `modules/midi-qol/templates/${templateType}-card.hbs`;
	const html = await renderTemplate(template, templateData);
	const chatData = {
		user: game.user?.id,
		content: html,
		flavor: this.system.chatFlavor || this.name,
		speaker: getSpeaker(this.actor),
		flags: {
			"core": { "canPopout": true }
		}
	};
	//@ts-expect-error
	if (game.release.generation < 12) {
		chatData.type = CONST.CHAT_MESSAGE_TYPES.OTHER;
	}
	else {
		//@ts-expect-error
		chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
	}
	// Toggle default roll mode
	let rollMode = game.settings.get("core", "rollMode");
	if (["gmroll", "blindroll"].includes(rollMode))
		chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
	if (rollMode === "blindroll")
		chatData["blind"] = true;
	if (rollMode === "selfroll")
		chatData["whisper"] = [game.user?.id];
	// Create the chat message
	return ChatMessage.create(chatData);
}
function isTokenInside(template, token, wallsBlockTargeting) {
	//@ts-ignore grid v10
	const grid = canvas?.scene?.grid;
	if (!grid)
		return false;
	//@ts-expect-error
	const templatePos = template.document ? { x: template.document.x, y: template.document.y } : { x: template.x, y: template.y };
	if (configSettings.optionalRules.wallsBlockRange !== "none" && hasWallBlockingCondition(token))
		return false;
	if (!isTargetable(token))
		return false;
	// Check for center of  each square the token uses.
	// e.g. for large tokens all 4 squares
	//@ts-ignore document.width
	const startX = token.document.width >= 1 ? 0.5 : (token.document.width / 2);
	//@ts-ignore document.height
	const startY = token.document.height >= 1 ? 0.5 : (token.document.height / 2);
	//@ts-ignore document.width
	for (let x = startX; x < token.document.width; x++) {
		//@ts-ignore document.height
		for (let y = startY; y < token.document.height; y++) {
			const currGrid = {
				x: token.x + x * grid.size - templatePos.x,
				y: token.y + y * grid.size - templatePos.y,
			};
			let contains = template.shape?.contains(currGrid.x, currGrid.y);
			if (contains && wallsBlockTargeting) {
				let tx = templatePos.x;
				let ty = templatePos.y;
				if (template.shape instanceof PIXI.Rectangle) {
					tx = tx + template.shape.width / 2;
					ty = ty + template.shape.height / 2;
				}
				const r = new Ray({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y });
				// If volumetric templates installed always leave targeting to it.
				if (configSettings.optionalRules.wallsBlockRange === "centerLevels"
					&& installedModules.get("levels")
					&& !installedModules.get("levelsvolumetrictemplates")) {
					let p1 = {
						x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y,
						//@ts-expect-error
						z: token.elevation
					};
					// installedModules.get("levels").lastTokenForTemplate.elevation no longer defined
					//@ts-expect-error .elevation CONFIG.Levels.UI v10
					// const p2z = _token?.document?.elevation ?? CONFIG.Levels.UI.nextTemplateHeight ?? 0;
					const { elevation } = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false);
					let p2 = {
						x: tx, y: ty,
						//@ts-ignore
						z: elevation
					};
					//@ts-expect-error .distance
					contains = getUnitDist(p2.x, p2.y, p2.z, token) <= template.distance;
					//@ts-expect-error .Levels
					contains = contains && !CONFIG.Levels?.API?.testCollision(p1, p2, "collision");
				}
				else if (!installedModules.get("levelsvolumetrictemplates")) {
					//@ts-expect-error polygonBackends
					contains = !CONFIG.Canvas.polygonBackends.sight.testCollision({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y }, { mode: "any", type: "move" });
				}
			}
			// Check the distance from origin.
			if (contains)
				return true;
		}
	}
	return false;
}
export function isAoETargetable(targetToken, options = { ignoreSelf: false, AoETargetType: "any" }) {
	if (!isTargetable(targetToken))
		return false;
	const autoTarget = options.autoTarget ?? configSettings.autoTarget;
	const selfToken = getToken(options.selfToken);
	if (["wallsBlockIgnoreIncapacitated", "alwaysIgnoreIncapacitated"].includes(autoTarget) && checkIncapacitated(targetToken, false))
		return false;
	if (["wallsBlockIgnoreDefeated", "alwaysIgnoreDefeated"].includes(autoTarget) && checkDefeated(targetToken))
		return false;
	if (targetToken === selfToken)
		return !options.ignoreSelf;
	//@ts-expect-error .disposition
	const selfDisposition = selfToken?.document.disposition ?? 1;
	switch (options.AoETargetType) {
		case "any":
			return true;
		case "ally":
			return targetToken.document.disposition === selfDisposition;
		case "notAlly":
			return targetToken.document.disposition !== selfDisposition;
		case "enemy":
			//@ts-expect-error
			return targetToken.document.disposition === -selfDisposition || targetToken.document.disposition == CONST.TOKEN_DISPOSITIONS.SECRET;
		case "notEnemy":
			//@ts-expect-error
			return targetToken.document.disposition !== -selfDisposition && targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET;
		case "neutral":
			return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL;
		case "notNeutral":
			return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL;
		case "friendly":
			return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
		case "notFriendly":
			return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY;
		case "hostile":
			//@ts-expect-error
			return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE || targetToken.document.disposition == CONST.TOKEN_DISPOSITIONS.SECRET;
		case "notHostile":
			//@ts-expect-error
			return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE && targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET;
		default: return true;
	}
}
export function templateTokens(templateDetails, selfTokenRef = "", ignoreSelf = false, AoETargetType = "any", autoTarget) {
	//@ts-expect-error .item
	if (!autoTarget)
		autoTarget = getAutoTarget(templateDetails.item);
	if ((autoTarget) === "none")
		return [];
	const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget);
	const tokens = canvas?.tokens?.placeables ?? []; //.map(t=>t)
	const selfToken = getToken(selfTokenRef);
	let targetIds = [];
	let targetTokens = [];
	game.user?.updateTokenTargets([]);
	if (autoTarget === "walledtemplates" && game.modules.get("walledtemplates")?.active) {
		//@ts-expect-error
		if (foundry.utils.getProperty(templateDetails?.item, "flags.walledtemplates.noAutotarget"))
			return targetTokens;
		//@ts-expect-error
		targetTokens = (templateDetails.targetsWithinShape) ? templateDetails.targetsWithinShape() : [];
		targetTokens = targetTokens.filter(token => isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget }));
		targetIds = targetTokens.map(t => t.id);
	}
	else {
		for (const token of tokens) {
			if (!isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget }))
				continue;
			if (token.actor && isTokenInside(templateDetails, token, wallsBlockTargeting)) {
				if (token.id) {
					targetTokens.push(token);
					targetIds.push(token.id);
				}
			}
		}
	}
	game.user?.updateTokenTargets(targetIds);
	// game.user?.broadcastActivity({ targets });
	return targetTokens;
}
// this is bound to a workflow when called - most of the time
export function selectTargets(templateDocument, data, user) {
	//@ts-expect-error
	const workflow = this?.currentAction ? this : Workflow.getWorkflow(templateDocument.flags?.dnd5e?.origin);
	if (workflow === undefined)
		return true;
	if (debugEnabled > 0)
		warn("selectTargets ", workflow, templateDocument, data, user);
	const selfToken = getToken(workflow.tokenUuid);
	let ignoreSelf = false;
	if (workflow?.item && workflow.item.hasAreaTarget
		&& (workflow.item.system.range.type === "self") || foundry.utils.getProperty(workflow, "item.flags.midi-qol.AoETargetTypeIncludeSelf") === false)
		ignoreSelf = true;
	const AoETargetType = foundry.utils.getProperty(workflow, "item.flags.midi-qol.AoETargetType") ?? "any";
	// think about special = allies, self = all but self and any means everyone.
	let item = workflow.item;
	let targeting = getAutoTarget(item);
	if ((game.user?.targets.size === 0 || user !== game.user?.id)
		&& templateDocument?.object && !installedModules.get("levelsvolumetrictemplates") && targeting !== "none") {
		//@ts-expect-error fromUuidSync
		let mTemplate = fromUuidSync(templateDocument.uuid)?.object;
		//@ts-ignore
		if (mTemplate.shape)
			//@ts-ignore templateDocument.x, mtemplate.distance TODO check this v10
			templateTokens(mTemplate, selfToken, ignoreSelf, AoETargetType, getAutoTarget(workflow.item));
		else {
			console.warn("midi-qol | selectTargets | Need to compute template shape");
			// @ ts-expect-error
			// mTemplate.shape = mTemplate._computeShape();
			let { shape, distance } = computeTemplateShapeDistance(templateDocument);
			//@ts-expect-error
			mTemplate.shape = shape;
			//@ ts-expect-error
			// mTemplate.distance = distance;
			if (debugEnabled > 0)
				warn(`selectTargets computed shape ${shape} distance ${distance}`);
			//@ts-ignore .x, .y v10
			templateTokens(mTemplate, selfToken, ignoreSelf, AoETargetType, getAutoTarget(workflow.item));
		}
	}
	workflow.templateId = templateDocument?.id;
	workflow.templateUuid = templateDocument?.uuid;
	// if (user === game.user?.id && item) templateDocument.setFlag("midi-qol", "originUuid", item.uuid); // set a refernce back to the item that created the template.
	if (targeting === "none") { // this is no good
		Hooks.callAll("midi-qol-targeted", workflow.targets);
		return true;
	}
	game.user?.targets?.forEach(token => {
		if (!isAoETargetable(token, { ignoreSelf, selfToken, AoETargetType, autoTarget: getAutoTarget(item) }))
			token.setTarget(false, { user: game.user, releaseOthers: false });
	});
	workflow.saves = new Set();
	//@ts-expect-error filter
	workflow.targets = new Set(game.user?.targets ?? new Set()).filter(token => isTargetable(token));
	workflow.hitTargets = new Set(workflow.targets);
	workflow.templateData = templateDocument.toObject(); // TODO check this v10
	if (this instanceof TrapWorkflow)
		return;
	if (debugEnabled > 0)
		warn("selectTargets ", workflow?.suspended, workflow?.needTemplate, templateDocument);
	if (workflow.needTemplate) {
		workflow.needTemplate = false;
		if (workflow.suspended)
			workflow.unSuspend.bind(workflow)({ templateDocument });
		// TODO NW return workflow.performState(workflow.WorkflowState_AwaitTemplate);
	}
	return;
}
;
// TODO work out this in new setup
export async function shouldRollOtherDamage(workflow, conditionFlagNonSpell, conditionFlagSpell) {
	if (this.type === "spell" && conditionFlagSpell === "none")
		return false;
	if (this.type !== "spell" && conditionFlagNonSpell === "none")
		return false;
	if (this.type === "spell" && conditionFlagSpell === "always")
		return true;
	if (this.type !== "spell" && conditionFlagNonSpell === "always")
		return true;
	let rollOtherDamage = true;
	let conditionToUse = foundry.utils.getProperty(this, "flags.midi-qol.otherCondition")?.trim() ?? "";
	if (this.type === "spell") {
		rollOtherDamage = conditionFlagSpell !== "ifSave" || this.hasSave;
	}
	else if (["rwak", "mwak"].includes(this.system.actionType)) {
		rollOtherDamage = (conditionFlagNonSpell !== "ifSave" || workflow.otherDamageItem.hasSave);
	}
	else if (conditionToUse === "")
		rollOtherDamage = false;
	if (!rollOtherDamage && conditionToUse.length === 0)
		return false;
	//@ts-ignore
	for (let target of workflow.hitTargets) {
		rollOtherDamage = await evalActivationCondition(workflow, conditionToUse, target, { async: true, errorReturn: false });
		if (rollOtherDamage)
			return true;
	}
	return rollOtherDamage;
}
