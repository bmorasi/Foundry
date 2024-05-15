import { debug, i18n, error, warn, noDamageSaves, cleanSpellName, MQdefaultDamageType, allAttackTypes, gameStats, debugEnabled, overTimeEffectsToDelete, geti18nOptions, failedSaveOverTimeEffectsToDelete, GameSystemConfig, systemConcentrationId, MQItemMacroLabel, SystemString } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule, targetConfirmation, criticalDamage, criticalDamageGM, checkMechanic, safeGetGameSetting, DebounceInterval, _debouncedUpdateAction } from "./settings.js";
import { log } from "../midi-qol.js";
import { DummyWorkflow, Workflow } from "./workflow.js";
import { socketlibSocket, timedAwaitExecuteAsGM, untimedExecuteAsGM } from "./GMAction.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { concentrationCheckItemDisplayName, itemJSONData, midiFlagTypes } from "./Hooks.js";
import { OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { busyWait } from "./tests/setupTest.js";
const defaultTimeout = 30;
export function getDamageType(flavorString) {
	if (flavorString === '')
		return "none";
	if (GameSystemConfig.damageTypes[flavorString] !== undefined) {
		return flavorString;
	}
	if (GameSystemConfig.healingTypes[flavorString] !== undefined) {
		return flavorString;
	}
	//@ts-expect-error
	const validDamageTypes = Object.entries(GameSystemConfig.damageTypes).map(e => { e[1] = e[1].label.toLowerCase(); return e; }).deepFlatten().concat(Object.entries(GameSystemConfig.healingTypes).deepFlatten());
	//@ts-expect-error
	const validHealingTypes = Object.entries(GameSystemConfig.healingTypes).map(e => { e[1] = e[1].label.toLowerCase(); return e; }).deepFlatten();
	const validDamagingTypes = validDamageTypes.concat(validHealingTypes);
	const allDamagingTypeEntries = Object.entries(GameSystemConfig.damageTypes).concat(Object.entries(GameSystemConfig.healingTypes));
	if (validDamagingTypes.includes(flavorString?.toLowerCase()) || validDamageTypes.includes(flavorString)) {
		//@ts-expect-error
		const damageEntry = allDamagingTypeEntries?.find(e => e[1].label.toLowerCase() === flavorString.toLowerCase());
		return damageEntry ? damageEntry[0] : flavorString;
	}
	return undefined;
}
export function getDamageFlavor(damageType) {
	const validDamageTypes = Object.entries(GameSystemConfig.damageTypes).deepFlatten().concat(Object.entries(GameSystemConfig.healingTypes).deepFlatten());
	const allDamageTypeEntries = Object.entries(GameSystemConfig.damageTypes).concat(Object.entries(GameSystemConfig.healingTypes));
	if (validDamageTypes.includes(damageType)) {
		const damageEntry = allDamageTypeEntries?.find(e => e[0] === damageType);
		return damageEntry ? damageEntry[1].label : damageType;
	}
	return undefined;
}
/**
*  return a list of {damage: number, type: string} for the roll and the item
*/
export function createDamageDetail({ roll, item, versatile, defaultType = MQdefaultDamageType, ammo }) {
	let damageParts = {};
	let rolls = roll;
	//@ts-expect-error
	const DamageRoll = CONFIG.Dice.DamageRoll;
	if (rolls instanceof DamageRoll) {
		rolls = [rolls];
	}
	if (item?.system.damage?.parts[0]) {
		defaultType = item.system.damage.parts[0][1];
	}
	if (rolls instanceof Array) {
		for (let r of rolls) {
			if (!r.options.type)
				r.options.type = defaultType;
			let rr = r;
			if (rr.terms?.length)
				for (let i = rr.terms.length - 1; i >= 0;) {
					const term = rr.terms[i--];
					if (!(term instanceof NumericTerm) && !(term instanceof DiceTerm))
						continue;
					const flavorType = getDamageType(term.flavor);
					let type = (term.flavor !== "") ? flavorType : rr.options.type;
					if (!type || type === "none")
						type = r.options.type ?? defaultType;
					let multiplier = 1;
					let operator = rr.terms[i];
					while (operator instanceof OperatorTerm) {
						if (operator.operator === "-")
							multiplier *= -1;
						operator = rolls.entries[i--];
					}
					let value = Number((term?.total ?? "0")) * multiplier;
					damageParts[type] = value + (damageParts[type] ?? 0);
					damageParts[type];
				}
		}
		//  damageParts[r.options.type || defaultType] = r.total + (damageParts[r.options.type || defaultType] ?? 0);
	}
	else { // rolls is a single roll and not a DamageRoll
		let evalString = "";
		let damageType = defaultType;
		let partPos = 0;
		let rollTerms = roll.terms;
		let numberTermFound = false; // We won't evaluate until at least 1 numeric term is found
		while (partPos < rollTerms.length) {
			// Accumulate the text for each of the terms until we have enough to eval
			const evalTerm = rollTerms[partPos];
			partPos += 1;
			if (evalTerm instanceof DiceTerm) {
				// this is a dice roll
				damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
				if (!evalTerm?.options.flavor) {
					foundry.utils.setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
				}
				numberTermFound = true;
				evalString += evalTerm.total;
			}
			else if (evalTerm instanceof Die) { // special case for better rolls that does not return a proper roll
				damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
				if (!evalTerm?.options.flavor) {
					foundry.utils.setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
				}
				numberTermFound = true;
				evalString += evalTerm.total;
			}
			else if (evalTerm instanceof NumericTerm) {
				damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
				if (!evalTerm?.options.flavor) {
					foundry.utils.setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
				}
				numberTermFound = true;
				evalString += evalTerm.total;
			}
			if (evalTerm instanceof PoolTerm) {
				damageType = getDamageType(evalTerm?.options?.flavor) ?? damageType;
				if (!evalTerm?.options.flavor) {
					foundry.utils.setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
				}
				evalString += evalTerm.total;
			}
			if (evalTerm instanceof OperatorTerm) {
				if (["*", "/"].includes(evalTerm.operator)) {
					// multiply or divide keep going
					evalString += evalTerm.total;
				}
				else if (["-", "+"].includes(evalTerm.operator)) {
					if (numberTermFound) { // we have a number and a +/- so we can eval the term (do it straight away so we get the right damage type)
						let result = Roll.safeEval(evalString);
						damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + result;
						// reset for the next term - we don't know how many there will be
						evalString = "";
						damageType = defaultType;
						numberTermFound = false;
						evalString = evalTerm.operator;
					}
					else { // what to do with parenthetical term or others?
						evalString += evalTerm.total;
					}
				}
			}
		}
		// evalString contains the terms we have not yet evaluated so do them now
		if (evalString) {
			const damage = Roll.safeEval(evalString);
			// we can always add since the +/- will be recorded in the evalString
			damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + damage;
		}
	}
	const damageDetail = Object.entries(damageParts).map(([type, damage]) => { return { damage, type }; });
	if (debugEnabled > 1)
		debug("CreateDamageDetail: Final damage detail is ", damageDetail);
	return damageDetail;
}
export function getTokenForActor(actor) {
	if (actor.token)
		return actor.token.object; //actor.token is a token document.
	const token = tokenForActor(actor);
	if (token)
		return token;
	const tokenData = actor.prototypeToken.toObject();
	tokenData.actorId = actor.id;
	const cls = getDocumentClass("Token");
	//@ts-expect-error
	return new cls(tokenData, { actor });
}
export function getTokenForActorAsSet(actor) {
	const selfTarget = getTokenForActor(actor);
	if (selfTarget)
		return new Set([selfTarget]);
	return new Set();
}
// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a, appliedDamage, t, totalDamage, dmgType, existingDamage) {
	if (debugEnabled > 1)
		debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType);
	let prevDamage = existingDamage?.find(ed => ed.tokenId === t.id);
	//@ts-expect-error attributes
	var hp = a.system.attributes.hp;
	var oldHP, tmp, oldVitality, newVitality;
	const vitalityResource = checkRule("vitalityResource");
	if (hp.value <= 0 && typeof vitalityResource === "string" && foundry.utils.getProperty(a, vitalityResource) !== undefined) {
		// Damage done to vitality rather than hp
		oldVitality = foundry.utils.getProperty(a, vitalityResource) ?? 0;
		newVitality = Math.max(0, oldVitality - appliedDamage);
	}
	if (prevDamage) {
		oldHP = prevDamage.newHP;
		tmp = prevDamage.newTempHP;
	}
	else {
		oldHP = hp.value;
		tmp = parseInt(hp.temp) || 0;
	}
	let value = Math.floor(appliedDamage);
	if (dmgType.includes("temphp")) { // only relevent for healing of tmp HP
		var newTemp = Math.max(tmp, -value, 0);
		var newHP = oldHP;
	}
	else {
		var dt = value > 0 ? Math.min(tmp, value) : 0;
		var newTemp = tmp - dt;
		var newHP = Math.clamped(oldHP - (value - dt), 0, hp.max + (parseInt(hp.tempmax) || 0));
	}
	//TODO review this awfulness
	// Stumble around trying to find the actual token that corresponds to the multi level token TODO make this sane
	const altSceneId = foundry.utils.getProperty(t, "flags.multilevel-tokens.sscene");
	let sceneId = altSceneId ?? t.scene?.id;
	const altTokenId = foundry.utils.getProperty(t, "flags.multilevel-tokens.stoken");
	let tokenId = altTokenId ?? t.id;
	const altTokenUuid = (altTokenId && altSceneId) ? `Scene.${altSceneId}.Token.${altTokenId}` : undefined;
	let tokenUuid = altTokenUuid; // TODO this is nasty fix it.
	if (!tokenUuid && t.document)
		tokenUuid = t.document.uuid;
	if (debugEnabled > 1)
		debug("calculateDamage: results are ", newTemp, newHP, appliedDamage, totalDamage);
	if (game.user?.isGM)
		log(`${a.name} ${oldHP} takes ${value} reduced from ${totalDamage} Temp HP ${newTemp} HP ${newHP} `);
	// TODO change tokenId, actorId to tokenUuid and actor.uuid
	return {
		tokenId, tokenUuid, actorId: a.id, actorUuid: a.uuid, tempDamage: tmp - newTemp, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
		oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value, sceneId, oldVitality, newVitality
	};
}
/**
* Work out the appropriate multiplier for DamageTypeString on actor
* If configSettings.damageImmunities are not being checked always return 1
*
*/
export let getTraitMult = (actor, dmgTypeString, item) => {
	dmgTypeString = getDamageType(dmgTypeString);
	let totalMult = 1;
	if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp"))
		totalMult = -1;
	if (dmgTypeString.includes("midi-none"))
		return 0;
	if (configSettings.damageImmunities === "none")
		return totalMult;
	const phsyicalDamageTypes = Object.keys(GameSystemConfig.physicalDamageTypes);
	if (dmgTypeString !== "") {
		// if not checking all damage counts as magical
		let magicalDamage = item?.system.properties?.has("mgc") || item?.flags?.midiProperties?.magicdam;
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.system.attackBonus > 0);
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.type !== "weapon");
		magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && item?.type === "spell");
		const silverDamage = item?.system.properties.has("sil") || magicalDamage;
		const adamantineDamage = item?.system.properties?.has("ada");
		const physicalDamage = phsyicalDamageTypes.includes(dmgTypeString);
		let traitList = [
			{ type: "di", mult: configSettings.damageImmunityMultiplier },
			{ type: "dr", mult: configSettings.damageResistanceMultiplier },
			{ type: "dv", mult: configSettings.damageVulnerabilityMultiplier }
		];
		// for sw5e use sdi/sdr/sdv instead of di/dr/dv
		if (game.system.id === "sw5e" && actor.type === "starship" && actor.system.attributes.hp.tenp > 0) {
			traitList = [{ type: "sdi", mult: 0 }, { type: "sdr", mult: configSettings.damageResistanceMultiplier }, { type: "sdv", mult: configSettings.damageVulnerabilityMultiplier }];
		}
		for (let { type, mult } of traitList) {
			let trait = foundry.utils.deepClone(actor.system.traits[type].value);
			// trait = trait.map(dt => dt.toLowerCase());
			let customs = [];
			if (actor.system.traits[type].custom?.length > 0) {
				customs = actor.system.traits[type].custom.split(";").map(s => s.trim());
			}
			const bypasses = actor.system.traits[type].bypasses ?? new Set();
			if (magicalDamage && physicalDamage && bypasses.has("mgc"))
				continue; // magical damage bypass of trait.
			if (adamantineDamage && physicalDamage && bypasses.has("ada"))
				continue;
			if (silverDamage && physicalDamage && bypasses.has("sil"))
				continue;
			// process new custom field versions
			if (!["healing", "temphp"].includes(dmgTypeString)) {
				if (customs.includes(dmgTypeString) || trait.has(dmgTypeString)) {
					totalMult = totalMult * mult;
					continue;
				}
				if (!magicalDamage && (trait.has("nonmagic") || customs.includes(GameSystemConfig.damageResistanceTypes["nonmagic"]))) {
					totalMult = totalMult * mult;
					continue;
				}
				else if (!magicalDamage && physicalDamage && (trait.has("physical") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.physical))) {
					totalMult = totalMult * mult;
					continue;
				}
				else if (magicalDamage && trait.has("magic")) {
					totalMult = totalMult * mult;
					continue;
				}
				else if (item?.type === "spell" && trait.has("spell")) {
					totalMult = totalMult * mult;
					continue;
				}
				else if (item?.type === "power" && trait.has("power")) {
					totalMult = totalMult * mult;
					continue;
				}
				if (customs.length > 0) {
					if (!magicalDamage && (customs.includes("nonmagic") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.nonmagic))) {
						totalMult = totalMult * mult;
						continue;
					}
					else if (!magicalDamage && physicalDamage && (customs.includes("physical") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.physical))) {
						totalMult = totalMult * mult;
						continue;
					}
					else if (magicalDamage && (customs.includes("magic") || customs.includes(GameSystemConfig.customDamageResistanceTypes.magic))) {
						totalMult = totalMult * mult;
						continue;
					}
					else if (item?.type === "spell" && (customs.includes("spell") || customs.includes(GameSystemConfig.customDamageResistanceTypes.spell))) {
						totalMult = totalMult * mult;
						continue;
					}
					else if (item?.type === "power" && (customs.includes("power") || customs.includes(GameSystemConfig.customDamageResistanceTypes.power))) {
						totalMult = totalMult * mult;
						continue;
					}
				}
				// Support old style leftover settings
				if (configSettings.damageImmunities === "immunityPhysical") {
					if (!magicalDamage && trait.has("physical"))
						phsyicalDamageTypes.forEach(dt => trait.add(dt));
					if (!(magicalDamage || silverDamage) && trait.has("silver"))
						phsyicalDamageTypes.forEach(dt => trait.add(dt));
					if (!(magicalDamage || adamantineDamage) && trait.has("adamant"))
						phsyicalDamageTypes.forEach(dt => trait.add(dt));
				}
			}
			if (trait.has(dmgTypeString))
				totalMult = totalMult * mult;
		}
	}
	return totalMult;
	// Check the custom immunities
};
export async function applyTokenDamage(damageDetail, totalDamage, theTargets, item, saves, options = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }) {
	const fixedTargets = theTargets.map(t => getToken(t));
	return legacyApplyTokenDamageMany([damageDetail], [totalDamage], fixedTargets, item, [saves], {
		hitTargets: options.hitTargets ?? fixedTargets,
		existingDamage: options.existingDamage,
		superSavers: options.superSavers ? [options.superSavers] : [],
		semiSuperSavers: options.semiSuperSavers ? [options.semiSuperSavers] : [],
		workflow: options.workflow,
		updateContext: options.updateContext,
		forceApply: options.forceApply ?? true,
		noConcentrationCheck: options.noConcentrationCheck
	});
}
export async function applyTokenDamageMany({ applyDamageDetails, theTargets, item, options = { hitTargets: new Set(), existingDamage: [], workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false } }) {
	let damageList = [];
	let targetNames = [];
	let appliedDamage;
	let workflow = options.workflow ?? {};
	if (debugEnabled > 0)
		warn("applyTokenDamage |", applyDamageDetails, theTargets, item, workflow);
	if (!theTargets || theTargets.size === 0) {
		// TODO NW workflow.currentAction = workflow.WorkflowState_RollFinished
		// probably called from refresh - don't do anything
		return [];
	}
	if (!(item instanceof CONFIG.Item.documentClass)) {
		if (workflow.item)
			item = workflow.item;
		else if (item?.uuid) {
			item = MQfromUuid(item.uuid);
		}
		else if (item) {
			error("ApplyTokenDamage passed item must be of type Item or null/undefined");
			return [];
		}
	}
	if (item && !options.workflow)
		workflow = Workflow.getWorkflow(item.uuid) ?? {};
	const damageDetailArr = applyDamageDetails.map(a => a.damageDetail);
	const highestOnlyDR = false;
	let totalDamage = applyDamageDetails.reduce((a, b) => a + (b.damageTotal ?? 0), 0);
	let totalAppliedDamage = 0;
	let appliedTempHP = 0;
	for (let t of theTargets) {
		const targetToken = getToken(t);
		const targetTokenDocument = getTokenDocument(t);
		if (!targetTokenDocument || !targetTokenDocument.actor || !targetToken)
			continue;
		let targetActor = targetTokenDocument.actor;
		appliedDamage = 0;
		appliedTempHP = 0;
		let DRAll = 0;
		// damage absorption:
		const absorptions = foundry.utils.getProperty(targetActor, "flags.midi-qol.absorption") ?? {};
		const firstDamageHealing = applyDamageDetails[0].damageDetail && ["healing", "temphp"].includes(applyDamageDetails[0].damageDetail[0]?.type);
		const isHealing = ("heal" === workflow.item?.system.actionType) || firstDamageHealing;
		const noDamageReactions = (item?.hasSave && item.flags?.midiProperties?.nodam && workflow?.saves?.has(t));
		const noProvokeReaction = foundry.utils.getProperty(workflow, "item.flags.midi-qol.noProvokeReaction");
		if (totalDamage > 0
			//@ts-expect-error isEmpty
			&& !foundry.utils.isEmpty(workflow)
			&& !noDamageReactions
			&& !noProvokeReaction
			&& options.hitTargets.has(t)
			&& [Workflow].includes(workflow.constructor)) {
			// TODO check that the targetToken is actually taking damage
			// Consider checking the save multiplier for the item as a first step
			let result = await doReactions(targetToken, workflow.tokenUuid, workflow.damageRoll, !isHealing ? "reactiondamage" : "reactionheal", { item: workflow.item, workflow, workflowOptions: { damageDetail: workflow.damageDetail, damageTotal: totalDamage, sourceActorUuid: workflow.actor?.uuid, sourceItemUuid: workflow.item?.uuid, sourceAmmoUuid: workflow.ammo?.uuid } });
			if (!Workflow.getWorkflow(workflow.id)) // workflow has been removed - bail out
				return [];
		}
		let uncannyDodge = foundry.utils.getProperty(targetActor, "flags.midi-qol.uncanny-dodge") && item?.hasAttack;
		if (uncannyDodge && workflow)
			uncannyDodge = canSense(targetToken, workflow?.tokenUuid);
		if (game.system.id === "sw5e" && targetActor?.type === "starship") {
			// Starship damage r esistance applies only to attacks
			if (item && ["mwak", "rwak"].includes(item?.system.actionType)) {
				// This should be a roll?
				DRAll = foundry.utils.getProperty(t, "actor.system.attributes.equip.armor.dr") ?? 0;
			}
		}
		else if (foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.all") !== undefined)
			DRAll = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.all") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
		if (item?.hasAttack && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.${item?.system.actionType}`)) {
			const flag = `flags.midi-qol.DR.${item?.system.actionType}`;
			DRAll += (await new Roll(`${foundry.utils.getProperty(targetActor, flag) ?? "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
		}
		let DRAllRemaining = DRAll;
		// const magicalDamage = (item?.type !== "weapon" || item?.system.attackBonus > 0 || item?.system.properties.has("mgc"));
		let magicalDamage = item?.system.properties?.has("mgc") || item?.flags?.midiProperties?.magicdam;
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.system.attackBonus > 0);
		magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.type !== "weapon");
		magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && item?.type === "spell");
		const silverDamage = magicalDamage || (item?.type === "weapon" && item?.system.properties?.has("sil"));
		const adamantineDamage = item?.system.properties?.has("ada");
		let AR = 0; // Armor reduction for challenge mode armor etc.
		const ac = targetActor.system.attributes.ac;
		let damageDetail;
		let damageDetailResolved = [];
		totalDamage = 0;
		for (let i = 0; i < applyDamageDetails.length; i++) {
			if (applyDamageDetails[i].label === "otherDamage" && !workflow.otherDamageMatches?.has(targetToken))
				continue; // don't apply other damage is activationFails includes the token
			totalDamage += (applyDamageDetails[i].damageTotal ?? 0);
			damageDetail = foundry.utils.duplicate(applyDamageDetails[i].damageDetail ?? []);
			const label = applyDamageDetails[i].label;
			const itemSaveMultiplier = getSaveMultiplierForItem(item, label);
			let attackRoll = workflow.attackTotal;
			let saves = applyDamageDetails[i].saves ?? new Set();
			let superSavers = applyDamageDetails[i].superSavers ?? new Set();
			let semiSuperSavers = applyDamageDetails[i].semiSuperSavers ?? new Set();
			var dmgType;
			// Apply saves if required
			// This is overall Damage Reduction
			let maxDR = Number.NEGATIVE_INFINITY;
			if (checkRule("challengeModeArmor") === "scale") {
				AR = workflow.isCritical ? 0 : ac.AR;
			}
			else if (checkRule("challengeModeArmor") === "challenge" && attackRoll) {
				AR = ac.AR;
			}
			else
				AR = 0;
			let maxDRIndex = -1;
			for (let [index, damageDetailItem] of damageDetail.entries()) {
				if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && attackRoll && workflow.hitTargetsEC?.has(t)) {
					//scale the damage detail for a glancing blow - only for the first damage list? or all?
					const scale = workflow.challengeModeScale[targetActor?.uuid ?? "dummy"] ?? 1;
					// const scale = foundry.utils.getProperty(targetActor, "flags.midi-qol.challengeModeScale") ?? 1;
					damageDetailItem.damage *= scale;
				}
			}
			let nonMagicalDRUsed = false;
			let nonMagicalPysicalDRUsed = false;
			let nonPhysicalDRUsed = false;
			let nonSilverDRUsed = false;
			let nonAdamantineDRUsed = false;
			let physicalDRUsed = false;
			if (configSettings.saveDROrder === "SaveDRdr") {
				for (let [index, damageDetailItem] of damageDetail.entries()) {
					let { damage, type, DR } = damageDetailItem;
					if (!type)
						type = MQdefaultDamageType;
					let mult = saves.has(t) ? itemSaveMultiplier : 1;
					if (superSavers.has(t) && itemSaveMultiplier === 0.5) {
						mult = saves.has(t) ? 0 : 0.5;
					}
					if (semiSuperSavers.has(t) && itemSaveMultiplier === 0.5)
						mult = saves.has(t) ? 0 : 1;
					damageDetailItem.damage = damageDetailItem.damage * mult;
				}
			}
			// Calculate the Damage Reductions for each damage type
			for (let [index, damageDetailItem] of damageDetail.entries()) {
				let { damage, type } = damageDetailItem;
				type = type ?? MQdefaultDamageType;
				const physicalDamage = ["bludgeoning", "slashing", "piercing"].includes(type);
				if (absorptions[type] && absorptions[type] !== false) {
					const abMult = Number.isNumeric(absorptions[type]) ? Number(absorptions[type]) : 1;
					damageDetailItem.damage = damageDetailItem.damage * abMult;
					type = "healing";
					damageDetailItem.type = "healing";
				}
				let DRType = 0;
				if (type.toLowerCase() !== "temphp")
					dmgType = type.toLowerCase();
				// Pick the highest DR applicable to the damage type being inflicted.
				if (foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.${type}`)) {
					const flag = `flags.midi-qol.DR.${type}`;
					DRType = (await new Roll(`${foundry.utils.getProperty(targetActor, flag) || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DRType < 0) {
						damageDetailItem.damage -= DRType;
						DRType = 0;
					}
				}
				if (!nonMagicalPysicalDRUsed && physicalDamage && !magicalDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.non-magical-physical`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.non-magical-physical") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						nonMagicalPysicalDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				if (!nonMagicalDRUsed && !magicalDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.non-magical`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.non-magical") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						nonMagicalDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				if (!nonSilverDRUsed && physicalDamage && !silverDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.non-silver`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.non-silver") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						nonSilverDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				if (!nonAdamantineDRUsed && physicalDamage && !adamantineDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.non-adamant`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.non-adamant") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						nonAdamantineDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				if (!physicalDRUsed && physicalDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.physical`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.physical") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						physicalDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				if (!nonPhysicalDRUsed && !physicalDamage && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.non-physical`)) {
					const DR = (await new Roll(`${foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.non-physical") || "0"}`, targetActor.getRollData()).evaluate()).total ?? 0;
					if (DR < 0) {
						damageDetailItem.damage -= DR;
					}
					else {
						nonPhysicalDRUsed = DR > DRType;
						DRType = Math.max(DRType, DR);
					}
				}
				DRType = Math.min(damage, DRType);
				// We have the DRType for the current damage type
				if (DRType >= maxDR) {
					maxDR = DRType;
					maxDRIndex = index;
				}
				damageDetailItem.DR = DRType;
			}
			if (DRAll > 0 && DRAll < maxDR && checkRule("maxDRValue"))
				DRAll = 0;
			if (checkRule("DRAllPerDamageDetail"))
				DRAllRemaining = Math.max(DRAll, 0);
			// Now apportion DRAll to each damage type if required
			for (let [index, damageDetailItem] of damageDetail.entries()) {
				let { damage, type, DR } = damageDetailItem;
				if (checkRule("maxDRValue")) {
					if (index !== maxDRIndex) {
						damageDetailItem.DR = 0;
						DR = 0;
					}
					else if (DRAll > maxDR) {
						damageDetailItem.DR = 0;
						DR = 0;
					}
				}
				if (DR < damage && DRAllRemaining > 0 && !["healing", "temphp"].includes(damageDetailItem.type)) {
					damageDetailItem.DR = Math.min(damage, DR + DRAllRemaining);
					DRAllRemaining = Math.max(0, DRAllRemaining + DR - damage);
				}
				// Apply AR here
			}
			//Apply saves/dr/di/dv
			for (let [index, damageDetailItem] of damageDetail.entries()) {
				let { damage, type, DR } = damageDetailItem;
				if (!type)
					type = MQdefaultDamageType;
				let mult = 1;
				if (configSettings.saveDROrder !== "SaveDRdr") {
					mult = saves.has(t) ? itemSaveMultiplier : 1;
					if (superSavers.has(t) && itemSaveMultiplier === 0.5) {
						mult = saves.has(t) ? 0 : 0.5;
					}
					if (semiSuperSavers.has(t) && itemSaveMultiplier === 0.5)
						mult = saves.has(t) ? 0 : 1;
				}
				if (uncannyDodge)
					mult = mult / 2;
				const resMult = getTraitMult(targetActor, type, item);
				mult = mult * resMult;
				damageDetailItem.damageMultiplier = mult;
				/*
				if (!["healing", "temphp"].includes(type)) damage -= DR; // Damage reduction does not apply to healing
				*/
				damage -= DR;
				let typeDamage = Math.floor(damage * Math.abs(mult)) * Math.sign(mult);
				let typeDamageUnRounded = damage * mult;
				if (type.includes("temphp")) {
					appliedTempHP += typeDamage;
				}
				else {
					appliedDamage += typeDamageUnRounded;
				}
				// TODO: consider mwak damage reduction - we have the workflow so should be possible
			}
			damageDetailResolved = damageDetailResolved.concat(damageDetail);
			if (debugEnabled > 0)
				warn("applyTokenDamageMany | Damage Details plus resistance/save multiplier for ", targetActor.name, foundry.utils.duplicate(damageDetail));
		}
		if (DRAll < 0 && appliedDamage > -1) { // negative DR is extra damage
			damageDetailResolved = damageDetailResolved.concat({ damage: -DRAll, type: "DR", DR: DRAll });
			appliedDamage -= DRAll;
			// totalDamage -= DRAll; removing this allows the display to reflect the DRAll
		}
		if (false && !Object.keys(GameSystemConfig.healingTypes).includes(dmgType)) {
			totalDamage = Math.max(totalDamage, 0);
			appliedDamage = Math.max(appliedDamage, 0);
		}
		if (AR > 0 && appliedDamage > 0 && ["challenge", "scale"].includes(checkRule("challengeModeArmor"))
			&& !Object.keys(GameSystemConfig.healingTypes).includes(dmgType)) {
			totalDamage = appliedDamage;
			if (checkRule("challengeModeArmor") === "scale" || (checkRule("challengeModeArmor") === "challenge" && workflow.hitTargetsEC.has(t))) // TODO: the hitTargetsEC test won't ever fire?
				appliedDamage = Math.max(0, appliedDamage - AR);
		}
		totalAppliedDamage += appliedDamage;
		if (!dmgType)
			dmgType = "temphp";
		if (!["healing", "temphp"].includes(dmgType) && foundry.utils.getProperty(targetActor, `flags.midi-qol.DR.final`)) {
			let DRType = (await new Roll(`foundry.utils.getProperty(targetActor, "flags.midi-qol.DR.final") || "0"`, targetActor.getRollData()).evaluate()).total ?? 0;
			appliedDamage = Math.max(0, appliedDamage - DRType);
		}
		// Deal with vehicle damage threshold.
		if (appliedDamage > 0 && appliedDamage < (targetActor.system.attributes.hp.dt ?? 0))
			appliedDamage = 0;
		let ditem = calculateDamage(targetActor, appliedDamage, targetToken, totalDamage, dmgType, options.existingDamage);
		ditem.tempDamage = ditem.tempDamage + appliedTempHP;
		if (appliedTempHP <= 0) { // temp healing applied to actor does not add only gets the max
			ditem.newTempHP = Math.max(ditem.newTempHP, -appliedTempHP);
		}
		else {
			ditem.newTempHP = Math.max(0, ditem.newTempHP - appliedTempHP);
		}
		ditem.damageDetail = foundry.utils.duplicate([damageDetailResolved]);
		ditem.critical = workflow?.isCritical;
		ditem.wasHit = options.hitTargets.has(t);
		//@ts-expect-error isEmpty Allow macros to fiddle with the damage
		if (!foundry.utils.isEmpty(workflow) && configSettings.allowUseMacro && !workflow?.options?.noTargetOnuseMacro && workflow.item?.flags) {
			workflow.damageItem = ditem;
			await workflow.triggerTargetMacros(["preTargetDamageApplication"], [t]);
			ditem = workflow.damageItem;
		}
		workflow.damageItem = ditem;
		await asyncHooksCallAll(`midi-qol.preTargetDamageApplication`, t, { item, workflow, damageItem: ditem, ditem });
		ditem = workflow.damageItem;
		let dnd5eDamages = ditem.damageDetail[0].reduce((acc, detail) => {
			acc[detail.type] = Math.floor((detail.damage - (detail.DR ?? 0)) * detail.damageMultiplier);
			return acc;
		}, {});
		dnd5eDamages = Object.keys(dnd5eDamages).map(key => ({ type: key, value: dnd5eDamages[key] }));
		const dnd5eOptions = {
			midi: {
				noCalc: true,
				item,
				superSavers: workflow.superSavers,
				semiSuperSavers: workflow.semiSuperSavers,
				target: t,
				isCritical: workflow.isCritical,
				isFumble: workflow.isFumble,
				save: workflow.saves?.has(t),
				fumbleSave: workflow.fumbleSaves?.has(t),
				criticalSave: workflow.criticalSaves?.has(t)
			}
		};
		if (options.hitTargets.has(t) && !configSettings.v3DamageApplication) {
			Hooks.call("dnd5e.calculateDamage", t.actor, dnd5eDamages, dnd5eOptions);
			Hooks.call("dnd5e.applyDamage", t.actor, appliedDamage, dnd5eOptions);
		}
		// delete workflow.damageItem
		damageList.push(ditem);
		targetNames.push(t.name);
		if (ditem.appliedDamage !== 0 && ditem.wasHit) {
			const healedDamaged = ditem.appliedDamage < 0 ? "isHealed" : "isDamaged";
			workflow.ditem = foundry.utils.duplicate(ditem);
			await asyncHooksCallAll(`midi-qol.${healedDamaged}`, t, { item, workflow, damageItem: workflow.ditem, ditem: workflow.ditem });
			const actorOnUseMacros = foundry.utils.getProperty(t.actor ?? {}, "flags.midi-qol.onUseMacroParts") ?? new OnUseMacros();
			// It seems applyTokenDamageMany without a workflow gets through to here - so a silly guard in place TODO come back and fix this properly
			if (workflow.callMacros)
				await workflow.callMacros(workflow.item, actorOnUseMacros?.getMacros(healedDamaged), "TargetOnUse", healedDamaged, { actor: t.actor, token: t });
			//@ts-expect-error
			const expiredEffects = t?.actor?.appliedEffects.filter(ef => {
				const specialDuration = foundry.utils.getProperty(ef, "flags.dae.specialDuration");
				if (!specialDuration)
					return false;
				return specialDuration.includes(healedDamaged);
			}).map(ef => ef.id);
			if (expiredEffects?.length ?? 0 > 0) {
				await timedAwaitExecuteAsGM("removeEffects", {
					actorUuid: t.actor?.uuid,
					effects: expiredEffects,
					options: { "expiry-reason": `midi-qol:${healedDamaged}` }
				});
			}
		}
	}
	if (theTargets.size > 0) {
		workflow.damageList = damageList;
		//@ts-expect-error isEmpty
		if (!foundry.utils.isEmpty(workflow) && configSettings.allowUseMacro && workflow.item?.flags) {
			await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
			if (workflow.ammo)
				await workflow.callMacros(workflow.ammo, workflow.ammoOnUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
		}
		const chatCardUuids = await timedAwaitExecuteAsGM("createReverseDamageCard", {
			autoApplyDamage: configSettings.autoApplyDamage,
			sender: game.user?.name,
			actorId: workflow.actor?.id,
			charName: workflow.actor?.name ?? game?.user?.name,
			damageList: damageList,
			targetNames,
			chatCardId: workflow.itemCardId,
			chatCardUuid: workflow.itemCardUuid,
			flagTags: workflow.flagTags,
			updateContext: foundry.utils.mergeObject(options?.updateContext ?? {}, { noConcentrationCheck: options?.noConcentrationCheck }),
			forceApply: options.forceApply,
		});
		if (workflow && configSettings.undoWorkflow) {
			// Assumes workflow.undoData.chatCardUuids has been initialised
			if (workflow.undoData) {
				workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat(chatCardUuids);
				untimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
			}
		}
	}
	if (configSettings.keepRollStats) {
		gameStats.addDamage(totalAppliedDamage, totalDamage, theTargets.size, item);
	}
	return damageList;
}
;
export async function legacyApplyTokenDamageMany(damageDetailArr, totalDamageArr, theTargets, item, savesArr, options = { hitTargets: new Set(), existingDamage: [], superSavers: [], semiSuperSavers: [], workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }) {
	const mappedDamageDetailArray = damageDetailArr.map((dd, i) => {
		return {
			label: "test",
			damageDetail: dd,
			damageTotal: totalDamageArr[i],
			saves: savesArr[i],
			superSavers: options.superSavers[i],
			semiSuperSavers: options.semiSuperSavers[i],
		};
	});
	return applyTokenDamageMany({ applyDamageDetails: mappedDamageDetailArray, theTargets, item, options });
}
export async function processDamageRoll(workflow, defaultDamageType) {
	if (debugEnabled > 0)
		warn("processDamageRoll |", workflow);
	// proceed if adding chat damage buttons or applying damage for our selves
	let appliedDamage = [];
	const actor = workflow.actor;
	let item = workflow.saveItem;
	// const re = /.*\((.*)\)/;
	// const defaultDamageType = message.flavor && message.flavor.match(re);
	// Show damage buttons if enabled, but only for the applicable user and the GM
	let hitTargets = new Set([...workflow.hitTargets, ...workflow.hitTargetsEC]);
	let theTargets = new Set(workflow.targets);
	if (item?.system.target?.type === "self")
		theTargets = getTokenForActorAsSet(actor) || theTargets;
	let effectsToExpire = [];
	if (hitTargets.size > 0 && item?.hasAttack)
		effectsToExpire.push("1Hit");
	if (hitTargets.size > 0 && item?.hasDamage)
		effectsToExpire.push("DamageDealt");
	if (effectsToExpire.length > 0) {
		await expireMyEffects.bind(workflow)(effectsToExpire);
	}
	if (debugEnabled > 0)
		warn("processDamageRoll | damage details pre merge are ", workflow.damageDetail, workflow.bonusDamageDetail);
	let totalDamage = 0;
	if (workflow.saveItem?.hasSave &&
		(foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.saveDamage") ?? "default") !==
			(foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.bonusSaveDamage") ?? "default")) {
		// need to keep bonus damage and base damage separate
		let merged = (workflow.bonusDamageDetail ?? []).reduce((acc, item) => {
			acc[item.type] = (acc[item.type] ?? 0) + item.damage;
			return acc;
		}, {});
		workflow.bonusDamageDetail = Object.keys(merged).map((key) => { return { damage: Math.max(0, merged[key]), type: key }; });
		const baseNoDamage = workflow.damageDetail.length === 0 || (workflow.damageDetail.length === 1 && workflow.damageDetail[0] === "midi-none");
		const bonusNoDamage = workflow.bonusDamageDetail.length === 0 || (workflow.bonusDamageDetail.length === 1 && workflow.bonusDamageDetail[0] === "midi-none");
		const otherNoDamage = workflow.otherDamageDetail.length === 0 || (workflow.otherDamageDetail.length === 1 && workflow.otherDamageDetail[0] === "midi-none");
		if (baseNoDamage && bonusNoDamage && otherNoDamage)
			return;
		const baseTotalDamage = workflow.damageDetail.reduce((acc, value) => acc + value.damage, 0);
		const bonusTotalDamage = workflow.bonusDamageDetail.reduce((acc, value) => acc + value.damage, 0);
		workflow.bonusDamageTotal = bonusTotalDamage;
	}
	else { // merge bonus damage and base damage together.
		let merged = workflow.damageDetail.concat(workflow.bonusDamageDetail ?? []).reduce((acc, item) => {
			acc[item.type] = (acc[item.type] ?? 0) + item.damage;
			return acc;
		}, {});
		if ((Object.keys(merged).length === 1 && Object.keys(merged)[0] === "midi-none")
			&& (workflow.otherDamageDetail.length === 0
				|| (workflow.otherDamageDetail.length === 1 && workflow.otherDamageDetail[0] === "midi-none")))
			return;
		//TODO come back and decide if -ve damage per type should be allowed, no in the case of 1d4 -2, yes? in the case of -1d4[fire]
		const newDetail = Object.keys(merged).map((key) => { return { damage: Math.max(0, merged[key]), type: key }; });
		totalDamage = newDetail.reduce((acc, value) => acc + value.damage, 0);
		workflow.damageDetail = newDetail;
		workflow.damageTotal = totalDamage;
		workflow.bonusDamageDetail = undefined;
		workflow.bonusDamageTotal = undefined;
	}
	let savesToUse = (workflow.otherDamageFormula ?? "") !== "" ? new Set() : workflow.saves;
	// TODO come back and remove bonusDamage from the args to applyTokenDamageMany
	// Don't check for critical - RAW say these don't get critical damage
	// if (["rwak", "mwak"].includes(item?.system.actionType) && configSettings.rollOtherDamage !== "none") {
	// TODO clean this up - but need to work out what save set to use for base damage
	let baseDamageSaves = new Set();
	let bonusDamageSaves = new Set();
	// If we are not doing default save damage then pass through the workflow saves
	if ((foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.saveDamage") ?? "default") !== "default")
		baseDamageSaves = workflow.saves;
	// if default save damage then we do full full damage if other damage is being rolled.
	else if ((foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.saveDamage") ?? "default") === "default"
		&& itemOtherFormula(workflow.saveItem) === "")
		baseDamageSaves = workflow.saves ?? new Set();
	if ((foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.bonusSaveDamage") ?? "default") !== "default")
		bonusDamageSaves = workflow.saves;
	// if default save damage then we do full full damage if other damage is being rolled.
	else if ((foundry.utils.getProperty(workflow.saveItem, "flags.midiProperties.bonusSaveDamage") ?? "default") === "default"
		&& itemOtherFormula(workflow.saveItem) === "")
		baseDamageSaves = workflow.saves ?? new Set();
	if (configSettings.v3DamageApplication) {
		const allDamages = {};
		for (let token of theTargets) {
			if (!token.actor)
				continue;
			const tokenDocument = getTokenDocument(token);
			if (!tokenDocument)
				continue;
			allDamages[tokenDocument?.uuid] = {
				uuid: getTokenDocument(token)?.uuid,
				tokenDamages: [],
				isHit: hitTargets.has(token),
				saved: savesToUse.has(token),
				superSaver: workflow.superSavers.has(token),
				semiSuperSaver: workflow.semiSuperSavers.has(token),
				totalDamage: 0,
				appliedDamage: 0,
				tempDamage: 0,
				challengeModeScale: 1
			};
			let challengeModeScale = 1;
			let options = {};
			if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && workflow.attackRoll && workflow.hitTargetsEC?.has(token)) {
				//scale the damage detail for a glancing blow - only for the first damage list? or all?
				const scale = workflow.challengeModeScale[tokenDocument?.uuid ?? "dummy"] ?? 1;
				challengeModeScale = scale;
			}
			for (let [rolls, saves, type] of [[workflow.damageRolls, baseDamageSaves, "defaultDamage"], [(workflow.otherDamageMatches?.has(token) ?? true) ? [workflow.otherDamageRoll] : [], workflow.saves, "otherDamage"], [workflow.bonusDamageRolls, bonusDamageSaves, "bonusDamage"]]) {
				const tokenDamages = allDamages[tokenDocument.uuid].tokenDamages;
				if (rolls?.length > 0 && rolls[0]) {
					//@ts-expect-error
					const damages = game.system.dice.aggregateDamageRolls(rolls, { respectProperties: true }).map(roll => ({
						value: roll.total,
						type: roll.options.type,
						properties: new Set(roll.options.properties ?? [])
					}));
					let saveMultiplier = 1;
					if (saves.has(token)) {
						saveMultiplier = getSaveMultiplierForItem(item, type);
					}
					else if (workflow.superSavers.has(token)) {
						saveMultiplier = getSaveMultiplierForItem(item, type) === 0.5 ? 0 : 0.5;
					}
					else if (workflow.semiSuperSavers.has(token)) {
						saveMultiplier = getSaveMultiplierForItem(item, type) === 0.5 ? 0 : 1;
					}
					options = {
						invertHealing: true,
						multiplier: challengeModeScale,
						// ignore: {"resistance": new Set(["fire"])},
						midi: {
							saved: saves?.has(token),
							itemType: item.type,
							saveMultiplier,
							isHit: hitTargets.has(token),
							superSaver: workflow.superSavers?.has(token),
							semiSuperSaver: workflow.semiSuperSavers?.has(token),
							token,
							sourceActor: workflow.actor,
						}
					};
					//@ts-expect-error
					let returnDamages = token.actor.calculateDamage(damages, options);
					workflow.damages = returnDamages;
					//@ts-expect-error isEmpty
					if (!foundry.utils.isEmpty(workflow) && configSettings.allowUseMacro && workflow.item?.flags) {
						await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
						if (workflow.ammo)
							await workflow.callMacros(workflow.ammo, workflow.ammoOnUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
					}
					returnDamages = workflow.damages;
					const appliedTotal = returnDamages.reduce((acc, value) => acc + value.value, 0);
					allDamages[tokenDocument.uuid].totalDamage += (options.midi.totalDamage ?? 0);
					allDamages[tokenDocument.uuid].appliedDamage += (options.midi.appliedDamage ?? 0);
					if (appliedTotal !== 0 && hitTargets.has(token)) {
						const healedDamaged = appliedTotal < 0 ? "isHealed" : "isDamaged";
						workflow.damages = foundry.utils.duplicate(returnDamages);
						await asyncHooksCallAll(`midi-qol.${healedDamaged}`, token, { item, workflow, damageItem: workflow.ditem, ditem: workflow.ditem });
						const actorOnUseMacros = foundry.utils.getProperty(token.actor ?? {}, "flags.midi-qol.onUseMacroParts") ?? new OnUseMacros();
						// It seems applyTokenDamageMany without a workflow gets through to here - so a silly guard in place TODO come back and fix this properly
						if (workflow.callMacros)
							await workflow.callMacros(workflow.item, actorOnUseMacros?.getMacros(healedDamaged), "TargetOnUse", healedDamaged, { actor: token.actor, token });
						//@ts-expect-error
						const expiredEffects = token?.actor?.appliedEffects.filter(ef => {
							const specialDuration = foundry.utils.getProperty(ef, "flags.dae.specialDuration");
							if (!specialDuration)
								return false;
							return specialDuration.includes(healedDamaged);
						}).map(ef => ef.id);
						if (expiredEffects?.length ?? 0 > 0) {
							await timedAwaitExecuteAsGM("removeEffects", {
								actorUuid: token.actor?.uuid,
								effects: expiredEffects,
								options: { "expiry-reason": `midi-qol:${healedDamaged}` }
							});
						}
					}
					tokenDamages.push(returnDamages);
					/* setup damageList for backwards compatibility... {
			tokenId, tokenUuid, actorId: a.id, actorUuid: a.uuid, tempDamage: tmp - newTemp, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
			oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value, sceneId, oldVitality, newVitality
		};
		*/
				}
			}
		}
		workflow.v3Damages = allDamages;
		let baseDamageRolls = [];
		for (let damageRolls of [workflow.damageRolls, workflow.otherDamageRoll, workflow.bonusDamageRolls]) {
			if (damageRolls?.length > 0 && damageRolls[0]) {
				baseDamageRolls = baseDamageRolls.concat(damageRolls);
			}
		}
		const options = { hitTargets, existingDamage: [], workflow, updateContext: undefined, forceApply: false, noConcentrationCheck: item?.flags?.midiProperties?.noConcentrationCheck ?? false };
		const chatCardUuids = await timedAwaitExecuteAsGM("createV3ReverseDamageCard", {
			autoApplyDamage: configSettings.autoApplyDamage,
			sender: game.user?.name,
			actorId: workflow.actor?.id,
			charName: workflow.actor?.name ?? game?.user?.name,
			allDamages,
			baseDamageRolls: baseDamageRolls.map(r => JSON.stringify(r)),
			chatCardId: workflow.itemCardId,
			chatCardUuid: workflow.itemCardUuid,
			flagTags: workflow.flagTags,
			updateContext: options.updateContext,
			forceApply: options.forceApply,
		});
		if (workflow && configSettings.undoWorkflow) {
			// Assumes workflow.undoData.chatCardUuids has been initialised
			if (workflow.undoData) {
				workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat(chatCardUuids);
				untimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
			}
		}
	}
	else {
		if (workflow.shouldRollOtherDamage) {
			if (workflow.otherDamageRoll && configSettings.singleConcentrationRoll) {
				appliedDamage = await applyTokenDamageMany({
					applyDamageDetails: [
						{
							label: "defaultDamage",
							damageDetail: workflow.damageDetail,
							damageTotal: workflow.damageTotal,
							saves: baseDamageSaves,
							superSavers: workflow.superSavers,
							semiSuperSavers: workflow.semiSuperSavers
						},
						{
							label: "otherDamage",
							damageDetail: workflow.otherDamageDetail,
							damageTotal: workflow.otherDamageTotal,
							saves: workflow.saves,
							superSavers: workflow.superSavers,
							semiSuperSavers: workflow.semiSuperSavers
						},
						{
							label: "bonusDamage",
							damageDetail: workflow.bonusDamageDetail,
							damageTotal: workflow.bonusDamageTotal,
							saves: bonusDamageSaves,
							superSavers: workflow.superSavers,
							semiSuperSavers: workflow.semiSuperSavers
						}
					],
					theTargets,
					item,
					options: { hitTargets, existingDamage: [], workflow, updateContext: undefined, forceApply: false, noConcentrationCheck: item?.flags?.midiProperties?.noConcentrationCheck ?? false }
				});
			}
			else {
				appliedDamage = await applyTokenDamageMany({
					applyDamageDetails: [
						{
							label: "defaultDamage",
							damageDetail: workflow.damageDetail,
							damageTotal: workflow.damageTotal,
							saves: baseDamageSaves,
							superSavers: workflow.superSavers,
							semiSuperSavers: workflow.semiSuperSavers
						},
						{
							label: "bonusDamage",
							damageDetail: workflow.bonusDamageDetail,
							damageTotal: workflow.bonusDamageTotal,
							saves: bonusDamageSaves,
							superSavers: workflow.superSavers,
							semiSuperSavers: workflow.semiSuperSavers
						},
					],
					theTargets,
					item,
					options: { hitTargets, existingDamage: [], workflow, updateContext: undefined, forceApply: false, noConcentrationCheck: item?.flags?.midiProperties?.noConcentrationCheck ?? false }
				});
				if (workflow.otherDamageRoll) {
					// assume previous damage applied and then calc extra damage
					appliedDamage = await applyTokenDamageMany({
						applyDamageDetails: [{
								label: "otherDamage",
								damageDetail: workflow.otherDamageDetail,
								damageTotal: workflow.otherDamageTotal,
								saves: workflow.saves,
								superSavers: workflow.superSavers,
								semiSuperSavers: workflow.semiSuperSavers
							}],
						theTargets,
						item,
						options: { hitTargets, existingDamage: [], workflow, updateContext: undefined, forceApply: false, noConcentrationCheck: item?.flags?.midiProperties?.noConcentrationCheck ?? false }
					});
				}
			}
		}
		else {
			appliedDamage = await applyTokenDamageMany({
				applyDamageDetails: [
					{
						label: "defaultDamage",
						damageDetail: workflow.damageDetail,
						damageTotal: workflow.damageTotal,
						saves: workflow.saves,
						superSavers: workflow.superSavers,
						semiSuperSavers: workflow.semiSuperSavers
					},
					{
						label: "bonusDamage",
						damageDetail: workflow.bonusDamageDetail,
						damageTotal: workflow.bonusDamageTotal,
						saves: bonusDamageSaves,
						superSavers: workflow.superSavers,
						semiSuperSavers: workflow.semiSuperSavers
					},
				],
				theTargets,
				item,
				options: {
					existingDamage: [],
					hitTargets,
					workflow,
					updateContext: undefined,
					forceApply: false,
					noConcentrationCheck: item?.flags?.midiProperties?.noConcentrationCheck ?? false
				}
			});
		}
		workflow.damageList = appliedDamage;
	}
	if (debugEnabled > 1)
		debug("process damage roll: ", configSettings.autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves);
}
export let getSaveMultiplierForItem = (item, itemDamageType) => {
	// find a better way for this ? perhaps item property
	if (!item)
		return 1;
	// Midi default - base/bonus damage full, other damage half.
	if (["defaultDamage", "bonusDamage"].includes(itemDamageType) && itemOtherFormula(item) !== ""
		&& ["default", undefined].includes(foundry.utils.getProperty(item, "flags.midiProperties.saveDamage"))) {
		return 1;
	}
	//@ts-expect-error
	if (item.actor && item.type === "spell" && item.system.level === 0) { // cantrip
		const midiFlags = foundry.utils.getProperty(item.actor ?? {}, "flags.midi-qol");
		if (midiFlags?.potentCantrip)
			return 0.5;
	}
	let itemDamageSave = "fulldam";
	switch (itemDamageType) {
		case "defaultDamage":
			itemDamageSave = foundry.utils.getProperty(item, "flags.midiProperties.saveDamage");
			break;
		case "otherDamage":
			itemDamageSave = foundry.utils.getProperty(item, "flags.midiProperties.otherSaveDamage");
			break;
		case "bonusDamage":
			itemDamageSave = foundry.utils.getProperty(item, "flags.midiProperties.bonusSaveDamage");
			break;
	}
	//@ts-expect-error item.flags v10
	const midiItemProperties = item.flags.midiProperties;
	if (midiItemProperties?.nodam || itemDamageSave === "nodam")
		return 0;
	if (midiItemProperties?.fulldam || itemDamageSave === "fulldam")
		return 1;
	if (midiItemProperties?.halfdam || itemDamageSave === "halfdam")
		return 0.5;
	if (!configSettings.checkSaveText)
		return configSettings.defaultSaveMult;
	//@ts-expect-error item.system v10
	let description = TextEditor.decodeHTML((item.system.description?.value || "")).toLocaleLowerCase();
	let noDamageText = i18n("midi-qol.noDamage").toLocaleLowerCase().trim();
	if (!noDamageText || noDamageText === "")
		noDamageText = "midi-qol.noDamage";
	let noDamageTextAlt = i18n("midi-qol.noDamageAlt").toLocaleLowerCase().trim();
	if (!noDamageTextAlt || noDamageTextAlt === "")
		noDamageTextAlt = "midi-qol.noDamageAlt";
	if (description?.includes(noDamageText) || description?.includes(noDamageTextAlt)) {
		return 0.0;
	}
	let fullDamageText = i18n("midi-qol.fullDamage").toLocaleLowerCase().trim();
	if (!fullDamageText || fullDamageText === "")
		fullDamageText = "midi-qol.fullDamage";
	let fullDamageTextAlt = i18n("midi-qol.fullDamageAlt").toLocaleLowerCase().trim();
	if (!fullDamageTextAlt || fullDamageTextAlt === "")
		fullDamageText = "midi-qol.fullDamageAlt";
	if (description.includes(fullDamageText) || description.includes(fullDamageTextAlt)) {
		return 1;
	}
	let halfDamageText = i18n("midi-qol.halfDamage").toLocaleLowerCase().trim();
	if (!halfDamageText || halfDamageText === "")
		halfDamageText = "midi-qol.halfDamage";
	let halfDamageTextAlt = i18n("midi-qol.halfDamageAlt").toLocaleLowerCase().trim();
	if (!halfDamageTextAlt || halfDamageTextAlt === "")
		halfDamageTextAlt = "midi-qol.halfDamageAlt";
	if (description?.includes(halfDamageText) || description?.includes(halfDamageTextAlt)) {
		return 0.5;
	}
	//@ts-expect-error item.name v10 - allow the default list to be overridden by item settings.
	if (noDamageSaves.includes(cleanSpellName(item.name)))
		return 0;
	//  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
	return configSettings.defaultSaveMult;
};
export function requestPCSave(ability, rollType, player, actor, { advantage, disadvantage, flavor, dc, requestId, GMprompt, isMagicSave, magicResistance, magicVulnerability, saveItemUuid, isConcentrationCheck }) {
	const useUuid = true; // for  LMRTFY
	const actorId = useUuid ? actor.uuid : actor.id;
	const playerLetme = !player?.isGM && ["letme", "letmeQuery"].includes(configSettings.playerRollSaves);
	const playerLetMeQuery = "letmeQuery" === configSettings.playerRollSaves;
	const gmLetmeQuery = "letmeQuery" === GMprompt;
	const gmLetme = player.isGM && ["letme", "letmeQuery"].includes(GMprompt);
	let rollAdvantage = 0;
	try {
		if (player && installedModules.get("lmrtfy") && (playerLetme || gmLetme)) {
			if (((!player.isGM && playerLetMeQuery) || (player.isGM && gmLetmeQuery))) {
				// TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
				rollAdvantage = 2;
			}
			else {
				rollAdvantage = (advantage && !disadvantage ? 1 : (!advantage && disadvantage) ? -1 : 0);
			}
			if (isMagicSave) { // rolls done via LMRTFY won't pick up advantage when passed through and we can't pass both advantage and disadvantage
				if (magicResistance && disadvantage)
					rollAdvantage = 1; // This will make the LMRTFY display wrong
				if (magicVulnerability && advantage)
					rollAdvantage = -1; // This will make the LMRTFY display wrong
			}
			//@ts-expect-error
			let mode = foundry.utils.isNewerVersion(game.version ?? game.version, "0.9.236") ? "publicroll" : "roll";
			if (configSettings.autoCheckSaves !== "allShow") {
				mode = "blindroll";
			}
			let message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`;
			if (rollType === "abil")
				message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.ability-check")} ${flavor}`;
			if (rollType === "skill")
				message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${flavor}`;
			// Send a message for LMRTFY to do a save.
			const socketData = {
				user: player.id,
				actors: [actorId],
				abilities: rollType === "abil" ? [ability] : [],
				saves: rollType === "save" ? [ability] : [],
				skills: rollType === "skill" ? [ability] : [],
				advantage: rollAdvantage,
				mode,
				title: i18n("midi-qol.saving-throw"),
				message,
				formula: "",
				attach: { requestId },
				deathsave: false,
				initiative: false,
				isMagicSave,
				saveItemUuid,
				isConcentrationCheck
			};
			if (debugEnabled > 1)
				debug("process player save ", socketData);
			game.socket?.emit('module.lmrtfy', socketData);
			//@ts-expect-error - global variable
			LMRTFY.onMessage(socketData);
		}
		else { // display a chat message to the user telling them to save
			const actorName = actor.name;
			let abilityString = GameSystemConfig.abilities[ability];
			if (abilityString.label)
				abilityString = abilityString.label;
			let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + dc : ""} ${abilityString} ${i18n("midi-qol.saving-throw")}`;
			if (advantage && !disadvantage)
				content = content + ` (${i18n("DND5E.Advantage")}) - ${flavor})`;
			else if (!advantage && disadvantage)
				content = content + ` (${i18n("DND5E.Disadvantage")}) - ${flavor})`;
			else
				content + ` - ${flavor})`;
			const chatData = {
				content,
				whisper: [player]
			};
			// think about how to do this if (workflow?.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", workflow.flagTags);
			ChatMessage.create(chatData);
		}
	}
	catch (err) {
		const message = `midi-qol | request PC save`;
		TroubleShooter.recordError(err, message);
		error(message, err);
	}
}
export function requestPCActiveDefence(player, actor, advantage, saveItemName, rollDC, formula, requestId, options) {
	const useUuid = true; // for  LMRTFY
	const actorId = useUuid ? actor.uuid : actor.id;
	if (!player.isGM && false) {
		// TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
		advantage = 2;
	}
	else {
		advantage = (advantage === true ? 1 : advantage === false ? -1 : 0);
	}
	//@ts-expect-error
	let mode = foundry.utils.isNewerVersion(game.version ?? game.version, "0.9.236") ? "publicroll" : "roll";
	if (checkRule("activeDefenceShowGM"))
		mode = "gmroll";
	else
		mode = "selfroll";
	let message = `${saveItemName} ${configSettings.hideRollDetails === "none" ? "DC " + rollDC : ""} ${i18n("midi-qol.ActiveDefenceString")}`;
	if (installedModules.get("lmrtfy")) {
		// Send a message for LMRTFY to do a save.
		const socketData = {
			"abilities": [],
			"saves": [],
			"skills": [],
			mode,
			"title": i18n("midi-qol.ActiveDefenceString"),
			message,
			"tables": [],
			user: player.id,
			actors: [actorId],
			advantage,
			formula,
			attach: { requestId, mode },
			deathsave: false,
			initiative: false
		};
		if (debugEnabled > 1)
			debug("process player save ", socketData);
		game.socket?.emit('module.lmrtfy', socketData);
		// LMRTFY does not emit to self so in case it needs to be handled by the local client pretend we received it.
		//@ts-expect-error - LMRTFY
		LMRTFY.onMessage(socketData);
	}
	else if (options?.workflow) { //prompt for a normal roll.
		const rollOptions = { advantage, midiType: "defenceRoll", flavor: message };
		if (configSettings.autoCheckHit === "all")
			rollOptions.targetValue = rollDC;
		socketlibSocket.executeAsUser("D20Roll", player.id, { targetUuid: actor.uuid, formula, request: message, rollMode: mode, options: rollOptions }).then(result => {
			if (debugEnabled > 1)
				debug("D20Roll result ", result);
			log("midi-qol | D20Roll result ", result);
			const handler = options.workflow.defenceRequests[requestId];
			delete options.workflow.defenceRequests[requestId];
			delete options.workflow.defenceTimeouts[requestId];
			let returnValue;
			try {
				//@ts-expect-error D20Roll
				returnValue = CONFIG.Dice.D20Roll.fromJSON(JSON.stringify(result));
			}
			catch (err) {
				returnValue = {};
			}
			handler(returnValue);
		});
	}
}
export function midiCustomEffect(...args) {
	let [actor, change, current, delta, changes] = args;
	if (!change.key)
		return true;
	if (typeof change?.key !== "string")
		return true;
	if (!change.key?.startsWith("flags.midi-qol") && !change.key?.startsWith("system.traits.da."))
		return true;
	const deferredEvaluation = [
		"flags.midi-qol.OverTime",
		"flags.midi-qol.optional",
		"flags.midi-qol.advantage",
		"flags.midi-qol.disadvantage",
		"flags.midi-qol.superSaver",
		"flags.midi-qol.semiSuperSaver",
		"flags.midi-qol.grants",
		"flags.midi-qol.fail",
		"flags.midi-qol.max.damage",
		"flags.midi-qol.min.damage",
		"flags.midi-qol.critical",
		"flags.midi-qol.noCritical",
		"flags.midi-qol.ignoreCover",
		"flags.midi-qol.ignoreWalls"
	]; // These have trailing data in the change key change.key values and should always just be a string
	if (change.key === `flags.${game.system.id}.DamageBonusMacro`) {
		// DAEdnd5e - daeCustom processes these
	}
	else if (change.key === "flags.midi-qol.onUseMacroName") {
		const args = change.value.split(",")?.map(arg => arg.trim());
		const currentFlag = foundry.utils.getProperty(actor, "flags.midi-qol.onUseMacroName") ?? "";
		if (args[0] === "ItemMacro" || args[0] === MQItemMacroLabel) { // rewrite the ItemMacro if possible
			if (change.effect.transfer)
				args[0] = `ItemMacro.${change.effect.parent.uuid}`;
			else if (change.effect?.origin?.includes("Item.")) {
				args[0] = `ItemMacro.${change.effect.origin}`;
			}
		}
		if (change.effect?.origin?.includes("Item.")) {
			args[0] = `${args[0]}|${change.effect.origin}`;
		}
		const extraFlag = `[${args[1]}]${args[0]}`;
		const macroString = (currentFlag?.length > 0) ? [currentFlag, extraFlag].join(",") : extraFlag;
		foundry.utils.setProperty(actor, "flags.midi-qol.onUseMacroName", macroString);
		return true;
	}
	else if (change.key.startsWith("flags.midi-qol.optional.") && (change.value.trim() === "ItemMacro" || change.value.trim() === MQItemMacroLabel)) {
		if (change.effect?.origin?.includes("Item.")) {
			const macroString = `ItemMacro.${change.effect.origin}`;
			foundry.utils.setProperty(actor, change.key, macroString);
		}
		else
			foundry.utils.setProperty(actor, change.key, change.value);
		return true;
	}
	else if (deferredEvaluation.some(k => change.key.startsWith(k))) {
		if (typeof change.value !== "string")
			foundry.utils.setProperty(actor, change.key, change.value);
		else if (["true", "1"].includes(change.value.trim()))
			foundry.utils.setProperty(actor, change.key, true);
		else if (["false", "0"].includes(change.value.trim()))
			foundry.utils.setProperty(actor, change.key, false);
		else
			foundry.utils.setProperty(actor, change.key, change.value);
	}
	else if (change.key.match(/system.traits.*custom/)) {
		// do the trait application here - think about how to update both trait and bypass
	}
	else if (typeof change.value === "string") {
		let val;
		try {
			switch (midiFlagTypes[change.key]) {
				case "string":
					val = change.value;
					break;
				case "number":
					val = Number.isNumeric(change.value) ? JSON.parse(change.value) : 0;
					break;
				default: // boolean by default
					val = evalCondition(change.value, actor.getRollData(), { async: false });
			}
			if (debugEnabled > 0)
				warn("midiCustomEffect | setting ", change.key, " to ", val, " from ", change.value, " on ", actor.name);
			foundry.utils.setProperty(actor, change.key, val);
			foundry.utils.setProperty(actor, change.key.replace("flags.midi-qol", "flags.midi-qol.evaluated"), { value: val, effects: [change.effect.name] });
		}
		catch (err) {
			const message = `midi-qol | midiCustomEffect | custom flag eval error ${change.key} ${change.value}`;
			TroubleShooter.recordError(err, message);
			console.warn(message, err);
		}
	}
	else {
		foundry.utils.setProperty(actor, change.key, change.value);
	}
	return true;
}
export function checkImmunity(candidate, data, options, user) {
	// Not using this in preference to marking effect unavailable
	const parent = candidate.parent;
	if (!parent || !(parent instanceof CONFIG.Actor.documentClass))
		return true;
	//@ts-expect-error .traits
	const ci = parent.system.traits?.ci?.value;
	const statusId = (data.name ?? (data.label ?? "no effect")).toLocaleLowerCase(); // TODO 11 chck this
	const returnvalue = !(ci.length && ci.some(c => c === statusId));
	return returnvalue;
}
export function untargetDeadTokens() {
	if (autoRemoveTargets !== "none") {
		game.user?.targets.forEach((t) => {
			//@ts-expect-error .system v10
			if (t.actor?.system.attributes.hp.value <= 0) {
				t.setTarget(false, { releaseOthers: false });
			}
		});
	}
}
function replaceAtFields(value, context, options = { blankValue: "", maxIterations: 4 }) {
	if (typeof value !== "string")
		return value;
	let count = 0;
	if (!value.includes("@"))
		return value;
	let re = /@[\w\._\-]+/g;
	let result = foundry.utils.duplicate(value);
	result = result.replace("@item.level", "@itemLevel"); // fix for outdated item.level
	result = result.replace("@flags.midi-qol", "@flags.midiqol");
	// Remove @data references allow a little bit of recursive lookup
	do {
		count += 1;
		for (let match of result.match(re) || []) {
			result = result.replace(match.replace("@data.", "@"), foundry.utils.getProperty(context, match.slice(1)) ?? options.blankValue);
		}
	} while (count < options.maxIterations && result.includes("@"));
	return result;
}
export async function processOverTime(wrapped, data, options, user) {
	if (data.round === undefined && data.turn === undefined)
		return wrapped(data, options, user);
	try {
		// await expirePerTurnBonusActions(this, data, options, user);
		await _processOverTime(this, data, options, user);
	}
	catch (err) {
		TroubleShooter.recordError(err, "processOverTime");
		error("processOverTime", err);
	}
	finally {
		return wrapped(data, options, user);
	}
}
export async function doOverTimeEffect(actor, effect, startTurn = true, options = { saveToUse: undefined, rollFlags: undefined, isActionSave: false }) {
	if (game.user?.isGM)
		return gmOverTimeEffect(actor, effect, startTurn, options);
	return untimedExecuteAsGM("gmOverTimeEffect", { actorUuid: actor.uuid, effectUuid: effect.uuid, startTurn, options });
}
export async function gmOverTimeEffect(actor, effect, startTurn = true, options = { saveToUse: undefined, rollFlags: undefined, rollMode: undefined }) {
	const endTurn = !startTurn;
	if (effect.disabled || effect.isSuppressed)
		return;
	const auraFlags = effect.flags?.ActiveAuras ?? {};
	if (auraFlags.isAura && auraFlags.ignoreSelf)
		return;
	const rollData = createConditionData({ actor, workflow: undefined, target: undefined });
	// const rollData = actor.getRollData();
	if (!rollData.flags)
		rollData.flags = actor.flags;
	rollData.flags.midiqol = rollData.flags["midi-qol"];
	const changes = effect.changes.filter(change => change.key.startsWith("flags.midi-qol.OverTime"));
	if (changes.length > 0)
		for (let change of changes) {
			// flags.midi-qol.OverTime turn=start/end, damageRoll=rollspec, damageType=string, saveDC=number, saveAbility=str/dex/etc, damageBeforeSave=true/[false], label="String"
			let spec = change.value;
			spec = replaceAtFields(spec, rollData, { blankValue: 0, maxIterations: 3 });
			spec = spec.replace(/\s*=\s*/g, "=");
			spec = spec.replace(/\s*,\s*/g, ",");
			spec = spec.replace("\n", "");
			let parts;
			if (spec.includes("#"))
				parts = spec.split("#");
			else
				parts = spec.split(",");
			let details = {};
			for (let part of parts) {
				const p = part.split("=");
				details[p[0]] = p.slice(1).join("=");
			}
			if (details.turn === undefined)
				details.turn = "start";
			if (details.applyCondition || details.condition) {
				let applyCondition = details.applyCondition ?? details.condition; // maintain support for condition
				let value = replaceAtFields(applyCondition, rollData, { blankValue: 0, maxIterations: 3 });
				let result;
				try {
					result = await evalCondition(value, rollData, { async: true });
					// result = Roll.safeEval(value);
				}
				catch (err) {
					const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime apply condition ${value} - assuming true`;
					TroubleShooter.recordError(err, message);
					console.warn(message, err);
					result = true;
				}
				if (!result)
					continue;
			}
			const changeTurnStart = details.turn === "start" ?? false;
			const changeTurnEnd = details.turn === "end" ?? false;
			let actionSave = details.actionSave;
			if (![undefined, "dialog", "roll"].includes(actionSave)) {
				console.warn(`midi-qol | gmOverTimeEffect | invalid actionSave: ${actionSave} for ${actor.name} ${effect.name}`);
				console.warn(`midi-qol | gmOverTimeEffect | valid values are "undefined", "dialog" or "roll"`);
				if (["0", "false"].includes(actionSave))
					actionSave = undefined;
				else
					actionSave = "roll";
				console.warn(`midi-qol | gmOverTimeEffect | setting actionSave to ${actionSave}`);
			}
			const saveAbilityString = (details.saveAbility ?? "");
			const saveAbility = (saveAbilityString.includes("|") ? saveAbilityString.split("|") : [saveAbilityString]).map(s => s.trim().toLocaleLowerCase());
			const label = (details.name ?? details.label ?? effect.name).replace(/"/g, "");
			const chatFlavor = details.chatFlavor ?? "";
			const rollTypeString = details.rollType ?? "save";
			const rollType = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString]).map(s => s.trim().toLocaleLowerCase());
			const saveMagic = JSON.parse(details.saveMagic ?? "false"); //parse the saving throw true/false
			const rollMode = details.rollMode;
			let actionType = "other";
			if (Object.keys(GameSystemConfig.itemActionTypes).includes(details.actionType?.toLocaleLowerCase()))
				actionType = details.actionType.toLocaleLowerCase();
			const messageFlavor = {
				"save": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.saving-throw")}`,
				"check": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.ability-check")}`,
				"skill": `${GameSystemConfig.skills[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.skill-check")}`
			};
			let saveDC;
			let value;
			let saveResultDisplayed = false;
			try {
				value = replaceAtFields(details.saveDC, rollData, { blankValue: 0, maxIterations: 3 });
				saveDC = !!value && Roll.safeEval(value);
			}
			catch (err) {
				TroubleShooter.recordError(err, `overTime effect | error evaluating saveDC ${value}`);
			}
			finally {
				if (!value)
					saveDC = -1;
			}
			if (endTurn) {
				const chatcardUuids = effect.getFlag("midi-qol", "overtimeChatcardUuids");
				if (chatcardUuids)
					for (let chatcardUuid of chatcardUuids) {
						//@ts-expect-error
						const chatCard = fromUuidSync(chatcardUuid);
						chatCard?.delete();
					}
			}
			if (options.isActionSave && actionSave === "dialog") {
				// generated by a save roll so we can ignore
				continue;
			}
			//@ts-expect-error
			let owner = playerForActor(actor) ?? game.users?.activeGM;
			//@ts-expect-error
			if (!owner?.active)
				owner = game.users?.activeGM;
			if (actionSave && startTurn && actionSave === "dialog") {
				if (!owner?.active) {
					error(`No active owmer to request overtime save for ${actor.name} ${effect.name}`);
					return effect.id;
				}
				let saveResult = await new Promise(async (resolve, reject) => {
					let timeoutId;
					if (configSettings.playerSaveTimeout)
						timeoutId = setTimeout(() => resolve(undefined), configSettings.playerSaveTimeout * 1000);
					const content = `${actor.name} use your action to overcome ${label}`;
					const result = await socketlibSocket.executeAsUser("rollActionSave", owner?.id, {
						title: `${actor.name} Action: ${label}`,
						content,
						actorUuid: actor.uuid,
						request: rollTypeString,
						abilities: saveAbility,
						saveDC,
						actionSave,
						options: {
							simulate: false,
							targetValue: saveDC,
							messageData: { user: owner?.id, flavor: `${label} ${i18n(messageFlavor[details.rollType])}` },
							chatMessage: true,
							rollMode,
							mapKeys: false,
							// advantage: saveDetails.advantage,
							// disadvantage: saveDetails.disadvantage,
							fastForward: false,
							isMagicSave: saveMagic,
							isConcentrationCheck: false
						}
					});
					if (timeoutId)
						clearTimeout(timeoutId);
					resolve(result);
				});
				if (saveResult?.class)
					saveResult = JSON.parse(JSON.stringify(saveResult));
				const success = saveResult?.options?.success || saveResult?.total >= saveDC;
				if (saveResult?.options)
					saveResultDisplayed = true;
				setProperty(effect, "flags.midi-qol.actionSaveSuccess", success === true);
			}
			else if (actionSave && actionSave === "roll" && options.isActionSave && options.saveToUse) {
				// player has made a save record the save/flags on the effect
				// if a match and saved then record the save success
				if (!options.rollFlags)
					return effect.id;
				if (options.rollFlags.type === "ability")
					options.rollFlags.type = "check";
				if (!rollType.includes(options.rollFlags.type) || !saveAbility.includes(options.rollFlags.abilityId ?? options.rollFlags.skillId))
					continue;
				const success = options.saveToUse?.options?.success || options.saveToUse?.total >= saveDC || (checkRule("criticalSaves") && options.saveToUse.isCritical);
				if (success !== undefined) {
					const chatcardUuids = effect.getFlag("midi-qol", "overtimeChatcardUuids");
					for (let chatcardUuid of chatcardUuids) {
						//@ts-expect-error
						const chatCard = fromUuidSync(chatcardUuid);
						await chatCard?.delete();
					}
				}
				if (success) {
					expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
					return effect.id;
				}
				else {
					await effect.setFlag("midi-qol", "actionSaveSuccess", success === true);
				}
				/*
				if (success !== undefined && !saveResultDisplayed) {
				let content;
				if (success) {
					content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-success")}`;
				} else {
					content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-failure")}`;
				}
				}
				*/
				return effect.id;
			}
			else if (actionSave === "roll" && startTurn) {
				const MessageClass = getDocumentClass("ChatMessage");
				let dataset;
				const chatCardUuids = [];
				for (let ability of saveAbility) {
					dataset = dataset = { type: rollTypeString, dc: saveDC, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid, rollMode };
					if (["check", "save"].includes(rollTypeString))
						dataset.ability = ability;
					// dataset = { type: rollTypeString, ability, dc: saveDC, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid };
					else if (rollTypeString === "skill")
						dataset.skill = ability;
					// dataset = { type: rollTypeString, dc: saveDC, skill: ability, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid };
					let whisper = ChatMessage.getWhisperRecipients(owner.name);
					if (owner.isGM) {
						whisper = ChatMessage.getWhisperRecipients("GM");
					}
					// const content = `${effect.name} ${i18n(messageFlavor[details.rollType])} as your action to overcome ${label}`;
					const chatData = {
						user: game.user?.id,
						whisper: whisper.map(u => u.id ?? ""),
						rollMode: rollMode ?? "public",
						content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", {
							//@ts-expect-error
							buttonLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "short", icon: true, hideDC: !owner.isGM && !configSettings.displaySaveDC }),
							//@ts-expect-error
							hiddenLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "short", icon: true, hideDC: true }),
							dataset
						}),
						flavor: `Action: ${label ?? effect.name} ${i18n(messageFlavor[details.rollType])}`,
						speaker: MessageClass.getSpeaker({ actor })
					};
					//@ts-expect-error TODO: Remove when v11 support is dropped.
					if (game.release.generation < 12)
						chatData.type = CONST.CHAT_MESSAGE_TYPES.OTHER;
					const chatCard = await ChatMessage.create(chatData);
					if (chatCard) {
						chatCardUuids.push(chatCard.uuid);
						chatCard?.setFlag("midi-qol", "actorUuid", actor.uuid);
					}
				}
				foundry.utils.setProperty(effect, "flags.midi-qol.actionSaveSuccess", undefined);
				effect.setFlag("midi-qol", "overtimeChatcardUuids", chatCardUuids)
					.then(() => effect.setFlag("midi-qol", "actionSaveSuccess", undefined));
				if (changeTurnEnd)
					return effect.id;
			}
			let actionSaveSuccess = foundry.utils.getProperty(effect, "flags.midi-qol.actionSaveSuccess");
			if (actionSaveSuccess === true && changeTurnEnd) {
				await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
				return effect.id;
			}
			if ((endTurn && changeTurnEnd) || (startTurn && changeTurnStart)) {
				const saveDamage = details.saveDamage ?? "nodamage";
				const damageRoll = details.damageRoll;
				const damageType = details.damageType ?? "piercing";
				const itemName = details.itemName;
				const damageBeforeSave = JSON.parse(details.damageBeforeSave ?? "false");
				const macroToCall = details.macro;
				const allowIncapacitated = JSON.parse(details.allowIncapacitated ?? "true");
				const fastForwardDamage = details.fastForwardDamage && JSON.parse(details.fastForwardDamage);
				const killAnim = JSON.parse(details.killAnim ?? "false");
				const saveRemove = JSON.parse(details.saveRemove ?? "true");
				if (debugEnabled > 0)
					warn(`gmOverTimeEffect | Overtime provided data is `, details);
				if (debugEnabled > 0)
					warn(`gmOverTimeEffect | OverTime label=${label} startTurn=${startTurn} endTurn=${endTurn} damageBeforeSave=${damageBeforeSave} saveDC=${saveDC} saveAbility=${saveAbility} damageRoll=${damageRoll} damageType=${damageType}`);
				let itemData = {}; //foundry.utils.duplicate(overTimeJSONData);
				itemData.img = "icons/svg/aura.svg";
				if (typeof itemName === "string") {
					if (itemName.startsWith("Actor.")) { // TODO check this
						const localName = itemName.replace("Actor.", "");
						const theItem = actor.items.getName(localName);
						if (theItem)
							itemData = theItem.toObject();
					}
					else {
						const theItem = game.items?.getName(itemName);
						if (theItem)
							itemData = theItem.toObject();
					}
				}
				itemData.img = effect.img ?? effect.icon; // v12 icon -> img
				foundry.utils.setProperty(itemData, "system.save.dc", saveDC);
				foundry.utils.setProperty(itemData, "system.save.scaling", "flat");
				itemData.type = "equipment";
				foundry.utils.setProperty(itemData, "system.type.value", "trinket");
				foundry.utils.setProperty(itemData, "flags.midi-qol.noProvokeReaction", true);
				if (saveMagic) {
					itemData.type = "spell";
					foundry.utils.setProperty(itemData, "system.preparation", { mode: "atwill" });
				}
				if (rollTypeString === "save" && !actionSave) {
					actionType = "save";
					foundry.utils.setProperty(itemData, "system.save.ability", saveAbility[0]);
				}
				if (rollTypeString === "check" && !actionSave) {
					actionType = "abil";
					foundry.utils.setProperty(itemData, "system.save.ability", saveAbility[0]);
				}
				if (rollTypeString === "skill" && !actionSave) { // skill checks for this is a fiddle - set a midi flag so that the midi save roll will pick it up.
					actionType = "save";
					let skill = saveAbility[0];
					if (!GameSystemConfig.skills[skill]) { // not a skill id see if the name matches an entry
						//@ts-expect-error
						const skillEntry = Object.entries(GameSystemConfig.skills).find(([id, entry]) => entry.label.toLocaleLowerCase() === skill);
						if (skillEntry)
							skill = skillEntry[0];
					}
					foundry.utils.setProperty(itemData, "flags.midi-qol.overTimeSkillRoll", skill);
				}
				if (damageBeforeSave || saveDamage === "fulldamage") {
					foundry.utils.setProperty(itemData.flags, "midiProperties.saveDamage", "fulldam");
				}
				else if (saveDamage === "halfdamage" || !damageRoll) {
					foundry.utils.setProperty(itemData.flags, "midiProperties.saveDamage", "halfdam");
				}
				else {
					foundry.utils.setProperty(itemData.flags, "midiProperties.saveDamage", "nodam");
				}
				itemData.name = label;
				foundry.utils.setProperty(itemData, "system.chatFlavor", chatFlavor);
				foundry.utils.setProperty(itemData, "system.description.chat", effect.description ?? "");
				foundry.utils.setProperty(itemData, "system.actionType", actionType);
				itemData._id = foundry.utils.randomID();
				// roll the damage and save....
				const theTargetToken = getTokenForActor(actor);
				const theTargetId = theTargetToken?.document.id;
				const theTargetUuid = theTargetToken?.document.uuid;
				if (game.user && theTargetId)
					game.user.updateTokenTargets([theTargetId]);
				if (damageRoll) {
					let damageRollString = damageRoll;
					let stackCount = effect.flags.dae?.stacks ?? 1;
					if (globalThis.EffectCounter && theTargetToken) {
						const counter = globalThis.EffectCounter.findCounter(theTargetToken, effect.img ?? effect.icon); //v12 icon -> img
						if (counter)
							stackCount = counter.getValue();
					}
					for (let i = 1; i < stackCount; i++)
						damageRollString = `${damageRollString} + ${damageRoll}`;
					foundry.utils.setProperty(itemData, "system.damage.parts", [[damageRollString, damageType]]);
					// itemData.system.damage.parts = [[damageRollString, damageType]];
				}
				foundry.utils.setProperty(itemData.flags, "midi-qol.forceCEOff", true);
				if (killAnim)
					foundry.utils.setProperty(itemData.flags, "autoanimations.killAnim", true);
				if (macroToCall) {
					foundry.utils.setProperty(itemData, "flags.midi-qol.onUseMacroName", macroToCall);
					foundry.utils.setProperty(itemData, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macroToCall));
				}
				// Try and find the source actor for the overtime effect so that optional bonuses etc can fire.
				//@ts-expect-error
				let origin = fromUuidSync(effect.origin);
				while (origin && !(origin instanceof Actor)) {
					origin = origin?.parent;
				}
				let ownedItem = new CONFIG.Item.documentClass(itemData, { parent: ((origin instanceof Actor) ? origin : actor) });
				if (!actionSave && saveRemove && saveDC > -1)
					failedSaveOverTimeEffectsToDelete[ownedItem.uuid] = { uuid: effect.uuid };
				if (details.removeCondition) {
					let value = replaceAtFields(details.removeCondition, rollData, { blankValue: 0, maxIterations: 3 });
					let remove;
					try {
						remove = await evalCondition(value, rollData, { errorReturn: true, async: true });
						// remove = Roll.safeEval(value);
					}
					catch (err) {
						const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime remove condition ${value} - assuming true`;
						TroubleShooter.recordError(err, message);
						console.warn(message, err);
						remove = true;
					}
					if (remove) {
						overTimeEffectsToDelete[ownedItem.uuid] = { uuid: effect.uuid };
					}
				}
				try {
					const options = {
						systemCard: false,
						createWorkflow: true,
						versatile: false,
						configureDialog: false,
						saveDC,
						checkGMStatus: true,
						targetUuids: [theTargetUuid],
						rollMode,
						workflowOptions: { targetConfirmation: "none", autoRollDamage: "onHit", fastForwardDamage, isOverTime: true, allowIncapacitated },
						flags: {
							dnd5e: { "itemData": ownedItem.toObject() },
							"midi-qol": { "isOverTime": true }
						}
					};
					await completeItemUse(ownedItem, {}, options); // worried about multiple effects in flight so do one at a time
					if (actionSaveSuccess) {
						await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
					}
					/*
					if (actionSaveSuccess !== undefined && !saveResultDisplayed) {
					let content;
					if (actionSaveSuccess) {
						content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-success")}`;
					} else {
						content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-failure")}`;
					}
					ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
					}
					*/
					return effect.id;
				}
				catch (err) {
					const message = "midi-qol | completeItemUse | error";
					TroubleShooter.recordError(err, message);
					console.warn(message, err);
				}
				finally {
				}
			}
		}
}
export async function _processOverTime(combat, data, options, user) {
	let prev = (combat.current.round ?? 0) * 100 + (combat.current.turn ?? 0);
	let testTurn = combat.current.turn ?? 0;
	let testRound = combat.current.round ?? 0;
	const last = (data.round ?? combat.current.round) * 100 + (data.turn ?? combat.current.turn);
	// These changed since overtime moved to _preUpdate function instead of hook
	// const prev = (combat.previous.round ?? 0) * 100 + (combat.previous.turn ?? 0);
	// let testTurn = combat.previous.turn ?? 0;
	// let testRound = combat.previous.round ?? 0;
	// const last = (combat.current.round ?? 0) * 100 + (combat.current.turn ?? 0);
	let toTest = prev;
	let count = 0;
	while (toTest <= last && count < 200) { // step through each turn from prev to current
		count += 1; // make sure we don't do an infinite loop
		const actor = combat.turns[testTurn]?.actor;
		const endTurn = toTest < last;
		const startTurn = toTest > prev;
		// Remove reaction used status from each combatant
		if (actor && toTest !== prev) {
			// do the whole thing as a GM to avoid multiple calls to the GM to set/remove flags/conditions
			await untimedExecuteAsGM("removeActionBonusReaction", { actorUuid: actor.uuid });
		}
		/*
		// Remove any per turn optional bonus effects
		const midiFlags: any = foundry.utils.getProperty(actor, "flags.midi-qol");
		if (actor && toTest !== prev && midiFlags) {
		if (midiFlags.optional) {
			for (let key of Object.keys(midiFlags.optional)) {
			if (midiFlags.optional[key].used) {
				untimedExecuteAsGM("_gmSetFlag", { actorUuid: actor.uuid, base: "midi-qol", key: `optional.${key}.used`, value: false })
				// await actor.setFlag("midi-qol", `optional.${key}.used`, false)
			}
			}
		}
		}
	*/
		if (actor)
			for (let effect of actor.appliedEffects) {
				if (effect.changes.some(change => change.key.startsWith("flags.midi-qol.OverTime"))) {
					await doOverTimeEffect(actor, effect, startTurn);
				}
			}
		testTurn += 1;
		if (testTurn === combat.turns.length) {
			testTurn = 0;
			testRound += 1;
			toTest = testRound * 100;
		}
		else
			toTest += 1;
	}
}
export async function completeItemRoll(item, options) {
	//@ts-expect-error .version
	if (foundry.utils.isNewerVersion(game.version, "10.278)"))
		console.warn("midi-qol | completeItemRoll(item, options) is deprecated please use completeItemUse(item, config, options)");
	return completeItemUse(item, {}, options);
}
export async function completeItemUse(item, config = {}, options = { checkGMstatus: false, targetUuids: [] }) {
	let theItem;
	if (typeof item === "string") {
		theItem = MQfromUuid(item);
	}
	else if (!(item instanceof CONFIG.Item.documentClass)) {
		const magicItemUuid = item.magicItem.items.find(i => i.id === item.id)?.uuid;
		theItem = await fromUuid(magicItemUuid);
	}
	else
		theItem = item;
	// delete any existing workflow - complete item use always is fresh.
	if (Workflow.getWorkflow(theItem.uuid))
		await Workflow.removeWorkflow(theItem.uuid);
	if (game.user?.isGM || !options.checkGMStatus) {
		return new Promise((resolve) => {
			let saveTargets = Array.from(game.user?.targets ?? []).map(t => { return t.id; });
			let selfTarget = false;
			if (options.targetUuids?.length > 0 && game.user && theItem.system.target.type !== "self") {
				game.user.updateTokenTargets([]);
				for (let targetUuid of options.targetUuids) {
					const theTarget = MQfromUuid(targetUuid);
					if (theTarget)
						theTarget.object.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
				}
			}
			let hookName = `midi-qol.postCleanup.${item?.uuid}`;
			if (!(item instanceof CONFIG.Item.documentClass)) {
				// Magic items create a pseudo item when doing the roll so have to hope we get the right completion
				hookName = "midi-qol.postCleanup";
			}
			Hooks.once(hookName, (workflow) => {
				if (debugEnabled > 0)
					warn(`completeItemUse hook fired: ${workflow.workflowName} ${hookName}`);
				if (!workflow.aborted && saveTargets && game.user) {
					game.user?.updateTokenTargets(saveTargets);
				}
				resolve(workflow);
			});
			if (item.magicItem) {
				item.magicItem.magicItemActor.roll(item.magicItem.id, item.id);
			}
			else {
				item.use(config, options).then(result => { if (!result)
					resolve(result); });
			}
		});
	}
	else {
		const targetUuids = options.targetUuids ? options.targetUuids : Array.from(game.user?.targets || []).map(t => t.document.uuid); // game.user.targets is always a set of tokens
		const data = {
			itemData: theItem.toObject(false),
			actorUuid: theItem.parent.uuid,
			targetUuids,
			config,
			options
		};
		return await timedAwaitExecuteAsGM("completeItemUse", data);
	}
}
export function untargetAllTokens(...args) {
	let combat = args[0];
	//@ts-expect-error combat.current
	let prevTurn = combat.current.turn - 1;
	if (prevTurn === -1)
		prevTurn = combat.turns.length - 1;
	const previous = combat.turns[prevTurn];
	if ((game.user?.isGM && ["allGM", "all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && canvas?.tokens?.controlled.find(t => t.id === previous.token?.id))) {
		// release current targets
		game.user?.targets.forEach((t) => {
			t.setTarget(false, { releaseOthers: false });
		});
	}
}
export function checkDefeated(tokenRef) {
	const tokenDoc = getTokenDocument(tokenRef);
	//@ts-expect-error specialStatusEffects
	return hasCondition(tokenDoc, CONFIG.specialStatusEffects.DEFEATED)
		|| hasCondition(tokenDoc, configSettings.midiDeadCondition);
}
export function checkIncapacitated(tokenRef, logResult = true) {
	const tokenDoc = getTokenDocument(tokenRef);
	if (!tokenDoc)
		return false;
	if (tokenDoc.actor) {
		const vitalityResource = checkRule("vitalityResource");
		if (typeof vitalityResource === "string" && foundry.utils.getProperty(tokenDoc.actor, vitalityResource.trim()) !== undefined) {
			const vitality = foundry.utils.getProperty(tokenDoc.actor, vitalityResource.trim()) ?? 0;
			//@ts-expect-error .system
			if (vitality <= 0 && tokenDoc?.actor?.system.attributes?.hp?.value <= 0) {
				if (logResult)
					log(`${tokenDoc.actor.name} is dead and therefore incapacitated`);
				return "dead";
			}
		}
		else 
		//@ts-expect-error .system
		if (tokenDoc.actor?.system.attributes?.hp?.value <= 0) {
			if (logResult)
				log(`${tokenDoc.actor.name} is incapacitated`);
			return "dead";
		}
	}
	if (configSettings.midiUnconsciousCondition && hasCondition(tokenDoc, configSettings.midiUnconsciousCondition)) {
		if (logResult)
			log(`${tokenDoc.name} is ${getStatusName(configSettings.midiUnconsciousCondition)} and therefore incapacitated`);
		return configSettings.midiUnconsciousCondition;
	}
	if (configSettings.midiDeadCondition && hasCondition(tokenDoc, configSettings.midiDeadCondition)) {
		if (logResult)
			log(`${tokenDoc.name} is ${getStatusName(configSettings.midiDeadCondition)} and therefore incapacitated`);
		return configSettings.midiDeadCondition;
	}
	const incapCondition = globalThis.MidiQOL.incapacitatedConditions.find(cond => hasCondition(tokenDoc, cond));
	if (incapCondition) {
		if (logResult)
			log(`${tokenDoc.name} has condition ${getStatusName(incapCondition)} so incapacitated`);
		return incapCondition;
	}
	return false;
}
export function getUnitDist(x1, y1, z1, token2) {
	if (!canvas?.dimensions)
		return 0;
	const unitsToPixel = canvas.dimensions.size / canvas.dimensions.distance;
	z1 = z1 * unitsToPixel;
	const x2 = token2.center.x;
	const y2 = token2.center.y;
	const z2 = token2.document.elevation * unitsToPixel;
	const d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)) / unitsToPixel;
	return d;
}
// not working properly yet
export function getSurroundingHexes(token) {
	let start = canvas?.grid?.grid?.getGridPositionFromPixels(token.center.x, token.center.y);
	if (!start)
		return;
	const surrounds = new Array(11);
	for (let r = 0; r < 11; r++) {
		surrounds[r] = new Array(11);
	}
	for (let c = -5; c <= 5; c++)
		for (let r = -5; r <= 5; r++) {
			const row = start[0] + r;
			const col = start[1] + c;
			let [x1, y1] = canvas?.grid?.grid?.getPixelsFromGridPosition(row, col) ?? [0, 0];
			let x, y;
			//@ts-expect-error getCenter -> getCenterPoint v12
			if (game.release.generation > 11) {
				//@ts-expect-error
				({ x, y } = canvas?.grid?.getCenterPoint({ x, y }) ?? { x: 0, y: 0 });
			}
			else {
				[x, y] = canvas?.grid?.getCenter(x1, y1) ?? [0, 0];
			}
			if (!x && !y)
				continue;
			const distance = distancePointToken({ x, y }, token);
			surrounds[r + 5][c + 5] = ({ r: row, c: col, d: distance });
		}
	//  for (let r = -5; r <=5; r++)
	//  console.error("Surrounds are ", ...surrounds[r+5]);
	const filtered = surrounds.map(row => row.filter(ent => {
		const entDist = ent.d / (canvas?.dimensions?.distance ?? 5);
		//@ts-expect-error .width v10
		const tokenWidth = token.document.width / 2;
		// console.error(ent.r, ent.c, ent.d, entDist, tokenWidth)
		//@ts-expect-error .width v10
		if (token.document.width % 2)
			return entDist >= tokenWidth && entDist <= tokenWidth + 0.5;
		else
			return entDist >= tokenWidth && entDist < tokenWidth + 0.5;
	}));
	const hlt = canvas?.grid?.highlightLayers["mylayer"] || canvas?.grid?.addHighlightLayer("mylayer");
	hlt?.clear();
	for (let a of filtered)
		if (a.length !== 0) {
			a.forEach(item => {
				let [x, y] = canvas?.grid?.grid?.getPixelsFromGridPosition(item.r, item.c) ?? [0, 0];
				// console.error("highlighting ", x, y, item.r, item.c)
				//@ts-expect-error
				canvas?.grid?.highlightPosition("mylayer", { x, y, color: game?.user?.color });
			});
			// console.error(...a);
		}
}
export function distancePointToken({ x, y, elevation = 0 }, token, wallblocking = false) {
	if (!canvas || !canvas.scene)
		return undefined;
	let coverACBonus = 0;
	let tokenTileACBonus = 0;
	let coverData;
	if (!canvas.grid || !canvas.dimensions)
		undefined;
	if (!token || x === undefined || y === undefined)
		return undefined;
	if (!canvas || !canvas.grid || !canvas.dimensions)
		return undefined;
	const t2StartX = -Math.max(0, token.document.width - 1);
	const t2StartY = -Math.max(0, token.document.height - 1);
	var d, r, segments = [], rdistance, distance;
	const [row, col] = canvas.grid.grid?.getGridPositionFromPixels(x, y) || [0, 0];
	const [xbase, ybase] = canvas.grid.grid?.getPixelsFromGridPosition(row, col) || [0, 0];
	let xc, yc;
	//@ts-expect-error v12 getCenter -> getCenterPoint
	if (game.release.version > 11) {
		//@ts-expect-error v12
		({ xc, yc } = canvas.grid.getCenterPoint.bind(canvas.grid)(xbase, ybase) || { x: 0, y: 0 });
	}
	else {
		[xc, yc] = canvas.grid.getCenter.bind(canvas.grid)(xbase, ybase) || [0, 0];
	}
	// const snappedOrigin = canvas?.grid?.getSnappedPosition(x,y)
	const origin = new PIXI.Point(x, y);
	const tokenCenter = token.center;
	const ray = new Ray(origin, tokenCenter);
	distance = canvas?.grid?.measureDistances([{ ray }], { gridSpaces: false })[0];
	distance = Math.max(0, distance);
	return distance;
}
export function getDistanceSimpleOld(t1, t2, includeCover, wallBlocking = false) {
	//@ts-expect-error logCompatibilityWarning
	logCompatibilityWarning("getDistance(t1,t2,includeCover,wallBlocking) is deprecated in favor computeDistance(t1,t2,wallBlocking?).", { since: "11.2.1", untill: "12.0.0" });
	return getDistance(t1, t2, wallBlocking);
}
export function getDistanceSimple(t1, t2, wallBlocking = false) {
	return getDistance(t1, t2, wallBlocking);
}
export function checkDistance(t1, t2, distance, wallsBlocking) {
	const dist = getDistance(t1, t2, wallsBlocking);
	return 0 <= dist && dist <= distance;
}
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
export function getDistance(t1 /*Token*/, t2 /*Token*/, wallblocking = false) {
	if (!canvas || !canvas.scene)
		return -1;
	if (!canvas.grid || !canvas.dimensions)
		return -1;
	t1 = getToken(t1);
	t2 = getToken(t2);
	if (!t1 || !t2)
		return -1;
	if (!canvas || !canvas.grid || !canvas.dimensions)
		return -1;
	const actor = t1.actor;
	const ignoreWallsFlag = foundry.utils.getProperty(actor, "flags.midi-qol.ignoreWalls");
	// get condition data & eval the property
	if (ignoreWallsFlag) {
		wallblocking = false;
	}
	const t1StartX = t1.document.width >= 1 ? 0.5 : t1.document.width / 2;
	const t1StartY = t1.document.height >= 1 ? 0.5 : t1.document.height / 2;
	const t2StartX = t2.document.width >= 1 ? 0.5 : t2.document.width / 2;
	const t2StartY = t2.document.height >= 1 ? 0.5 : t2.document.height / 2;
	const t1Elevation = t1.document.elevation ?? 0;
	const t2Elevation = t2.document.elevation ?? 0;
	const t1TopElevation = t1Elevation + Math.max(t1.document.height, t1.document.width) * (canvas?.dimensions?.distance ?? 5);
	const t2TopElevation = t2Elevation + Math.min(t2.document.height, t2.document.width) * (canvas?.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
	let coverVisible;
	// For levels autocover and simbul's cover calculator pre-compute token cover - full cover means no attack and so return -1
	// otherwise don't bother doing los checks they are overruled by the cover check
	if (installedModules.get("levelsautocover") && game.settings.get("levelsautocover", "apiMode") && wallblocking && configSettings.optionalRules.wallsBlockRange === "levelsautocover") {
		//@ts-expect-error
		const levelsautocoverData = AutoCover.calculateCover(t1, t2, getLevelsAutoCoverOptions());
		coverVisible = levelsautocoverData.rawCover > 0;
		if (!coverVisible)
			return -1;
	}
	else if (globalThis.CoverCalculator && configSettings.optionalRules.wallsBlockRange === "simbuls-cover-calculator") {
		if (t1 === t2)
			return 0; // Simbul's throws an error when calculating cover for the same token
		const coverData = globalThis.CoverCalculator.Cover(t1, t2);
		if (debugEnabled > 0)
			warn("getDistance | simbuls cover calculator ", t1.name, t2.name, coverData);
		if (coverData?.data.results.cover === 3 && wallblocking)
			return -1;
		coverVisible = true;
	}
	else if (installedModules.get("tokencover") && configSettings.optionalRules.wallsBlockRange === "tokencover") {
		const coverValue = calcTokenCover(t1, t2);
		if (coverValue === 3 && wallblocking)
			return -1;
		coverVisible = true;
	}
	var x, x1, y, y1, d, r, segments = [], rdistance, distance;
	for (x = t1StartX; x < t1.document.width; x++) {
		for (y = t1StartY; y < t1.document.height; y++) {
			let origin;
			//@ts-expect-error
			if (game.release.generation > 11) {
				//@ts-expect-error
				const point = canvas.grid.getCenterPoint(Math.round(t1.document.x + (canvas.dimensions.size * x)), Math.round(t1.document.y + (canvas.dimensions.size * y)));
				origin = new PIXI.Point(point.x, point.y);
			}
			else
				origin = new PIXI.Point(...canvas.grid.getCenter(Math.round(t1.document.x + (canvas.dimensions.size * x)), Math.round(t1.document.y + (canvas.dimensions.size * y))));
			for (x1 = t2StartX; x1 < t2.document.width; x1++) {
				for (y1 = t2StartY; y1 < t2.document.height; y1++) {
					let dest;
					//@ts-expect-error
					if (game.release.generation > 11) {
						//@ts-expect-error
						const point = canvas.grid.getCenterPoint(Math.round(t2.document.x + (canvas.dimensions.size * x1)), Math.round(t2.document.y + (canvas.dimensions.size * y1)));
						dest = new PIXI.Point(point.x, point.y);
					}
					else
						dest = new PIXI.Point(...canvas.grid.getCenter(Math.round(t2.document.x + (canvas.dimensions.size * x1)), Math.round(t2.document.y + (canvas.dimensions.size * y1))));
					const r = new Ray(origin, dest);
					if (wallblocking) {
						switch (configSettings.optionalRules.wallsBlockRange) {
							case "center":
								let collisionCheck;
								//@ts-expect-error polygonBackends
								collisionCheck = CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { mode: "any", type: "move" });
								if (collisionCheck)
									continue;
								break;
							case "centerLevels":
								// //@ts-expect-error
								// TODO include auto cover calcs in checking console.error(AutoCover.calculateCover(t1, t2));
								if (configSettings.optionalRules.wallsBlockRange === "centerLevels" && installedModules.get("levels")) {
									if (coverVisible === false)
										continue;
									if (coverVisible === undefined) {
										let p1 = {
											x: origin.x,
											y: origin.y,
											z: t1Elevation
										};
										let p2 = {
											x: dest.x,
											y: dest.y,
											z: t2Elevation
										};
										//@ts-expect-error
										const baseToBase = CONFIG.Levels.API.testCollision(p1, p2, "collision");
										p1.z = t1TopElevation;
										p2.z = t2TopElevation;
										//@ts-expect-error
										const topToBase = CONFIG.Levels.API.testCollision(p1, p2, "collision");
										if (baseToBase && topToBase)
											continue;
									}
								}
								else {
									let collisionCheck;
									//@ts-expect-error polygonBackends
									collisionCheck = CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { mode: "any", type: "move" });
									if (collisionCheck)
										continue;
								}
								break;
							case "alternative":
							case "simbuls-cover-calculator":
								if (coverVisible === undefined) {
									let collisionCheck;
									//@ts-expect-error polygonBackends
									collisionCheck = CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, { mode: "any", type: "sight" });
									if (collisionCheck)
										continue;
								}
								break;
							case "none":
							default:
						}
					}
					segments.push({ ray: r });
				}
			}
		}
	}
	if (segments.length === 0) {
		return -1;
	}
	rdistance = segments.map(ray => midiMeasureDistances([ray], { gridSpaces: true }));
	distance = Math.min(...rdistance);
	if (configSettings.optionalRules.distanceIncludesHeight) {
		let heightDifference = 0;
		let t1ElevationRange = Math.max(t1.document.height, t1.document.width) * (canvas?.dimensions?.distance ?? 5);
		if (Math.abs(t2Elevation - t1Elevation) < t1ElevationRange) {
			// token 2 is within t1's size so height difference is functionally 0
			heightDifference = 0;
		}
		else if (t1Elevation < t2Elevation) { // t2 above t1
			heightDifference = Math.max(0, t2Elevation - t1TopElevation);
		}
		else if (t1Elevation > t2Elevation) { // t1 above t2
			heightDifference = Math.max(0, t1Elevation - t2TopElevation);
		}
		//@ts-expect-error diagonalRule from DND5E
		const rule = canvas.grid.diagonalRule;
		if (["555", "5105"].includes(rule)) {
			let nd = Math.min(distance, heightDifference);
			let ns = Math.abs(distance - heightDifference);
			distance = nd + ns;
			let dimension = canvas?.dimensions?.distance ?? 5;
			if (rule === "5105")
				distance = distance + Math.floor(nd / 2 / dimension) * dimension;
		}
		else {
			distance = Math.sqrt(heightDifference * heightDifference + distance * distance);
		}
	}
	return distance;
}
;
let pointWarn = debounce(() => {
	ui.notifications?.warn("4 Point LOS check selected but dnd5e-helpers not installed");
}, 100);
export function checkRange(itemIn, tokenRef, targetsRef, showWarning = true) {
	if (!canvas || !canvas.scene)
		return { result: "normal" };
	const checkRangeFunction = (item, token, targets) => {
		if (!canvas || !canvas.scene)
			return {
				result: "normal",
			};
		// check that a range is specified at all
		if (!item.system.range)
			return {
				result: "normal",
			};
		if (!token) {
			if (debugEnabled > 0)
				warn(`checkRange | ${game.user?.name} no token selected cannot check range`);
			return {
				result: "fail",
				reason: `${game.user?.name} no token selected`,
			};
		}
		let actor = token.actor;
		// look at undefined versus !
		if (!item.system.range.value && !item.system.range.long && item.system.range.units !== "touch")
			return {
				result: "normal",
				reason: "no range specified"
			};
		if (item.system.target?.type === "self")
			return {
				result: "normal",
				reason: "self attack",
				range: 0
			};
		// skip non mwak/rwak/rsak/msak types that do not specify a target type
		if (!allAttackTypes.includes(item.system.actionType) && !["creature", "ally", "enemy"].includes(item.system.target?.type))
			return {
				result: "normal",
				reason: "not an attack"
			};
		const attackType = item.system.actionType;
		let range = (item.system.range?.value ?? 0);
		let longRange = (item.system.range?.long ?? 0);
		if (item.parent?.system) {
			let conditionData;
			let rangeBonus = foundry.utils.getProperty(item.parent, `flags.midi-qol.range.${attackType}`) ?? "0";
			rangeBonus = rangeBonus + " + " + (foundry.utils.getProperty(item.parent, `flags.midi-qol.range.all`) ?? "0");
			if (rangeBonus !== "0 + 0") {
				conditionData = createConditionData({ item, actor: item.parent, target: token });
				const bonusValue = evalCondition(rangeBonus, conditionData, { errorReturn: 0, async: false });
				range = Math.max(0, range + bonusValue);
			}
			;
			let longRangeBonus = foundry.utils.getProperty(item.parent, `flags.midi-qol.long.${attackType}`) ?? "0";
			longRangeBonus = longRangeBonus + " + " + (foundry.utils.getProperty(item.parent, `flags.midi-qol.long.all`) ?? "0");
			if (longRangeBonus !== "0 + 0") {
				if (!conditionData)
					conditionData = createConditionData({ item, actor: item.parent, target: token });
				const bonusValue = evalCondition(longRangeBonus, conditionData, { errorReturn: 0, async: false });
				longRange = Math.max(0, longRange + bonusValue);
			}
			;
		}
		if (longRange > 0 && longRange < range)
			longRange = range;
		if (item.system.range?.units) {
			switch (item.system.range.units) {
				case "mi": // miles - assume grid units are feet or miles - ignore furlongs/chains whatever
					//@ts-expect-error
					if (["feet", "ft"].includes(canvas?.scene?.grid.units?.toLocaleLowerCase())) {
						range *= 5280;
						longRange *= 5280;
						//@ts-expect-error
					}
					else if (["yards", "yd", "yds"].includes(canvas?.scene?.grid.units?.toLocaleLowerCase())) {
						range *= 1760;
						longRange *= 1760;
					}
					break;
				case "km": // kilometeres - assume grid units are meters or kilometers
					//@ts-expect-error
					if (["meter", "m", "meters", "metre", "metres"].includes(canvas?.scene?.grid.units?.toLocaleLowerCase())) {
						range *= 1000;
						longRange *= 1000;
					}
					break;
				// "none" "self" "ft" "m" "any" "spec":
				default:
					break;
			}
		}
		if (foundry.utils.getProperty(actor, "flags.midi-qol.sharpShooter") && range < longRange)
			range = longRange;
		if (item.system.actionType === "rsak" && foundry.utils.getProperty(actor, "flags.dnd5e.spellSniper")) {
			range = 2 * range;
			longRange = 2 * longRange;
		}
		if (item.system.range.units === "touch") {
			range = canvas?.dimensions?.distance ?? 5;
			if (item.system.properties?.has("rch"))
				range += canvas?.dimensions?.distance ?? 5;
			longRange = 0;
		}
		if (["mwak", "msak", "mpak"].includes(item.system.actionType) && !item.system.properties?.has("thr"))
			longRange = 0;
		for (let target of targets) {
			if (target === token)
				continue;
			// check if target is burrowing
			if (configSettings.optionalRules.wallsBlockRange !== 'none'
				&& globalThis.MidiQOL.WallsBlockConditions.some(status => hasCondition(target, status))) {
				return {
					result: "fail",
					reason: `${actor.name}'s has one or more of ${globalThis.MidiQOL.WallsBlockConditions} so can't be targeted`,
					range,
					longRange
				};
			}
			// check the range
			const distance = getDistance(token, target, configSettings.optionalRules.wallsBlockRange && !foundry.utils.getProperty(item, "flags.midiProperties.ignoreTotalCover"));
			if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
				log(`${target.name} is too far ${distance} from your character you cannot hit`);
				if (checkMechanic("checkRange") === "longdisadv" && ["rwak", "rsak", "rpak"].includes(item.system.actionType)) {
					return {
						result: "dis",
						reason: `${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
						range,
						longRange
					};
				}
				else {
					return {
						result: "fail",
						reason: `${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
						range,
						longRange
					};
				}
			}
			if (distance > range)
				return {
					result: "dis",
					reason: `${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
					range,
					longRange
				};
			if (distance < 0) {
				log(`${target.name} is blocked by a wall`);
				return {
					result: "fail",
					reason: `${actor.name}'s target is blocked by a wall`,
					range,
					longRange
				};
			}
		}
		return {
			result: "normal",
			range,
			longRange
		};
	};
	const tokenIn = getToken(tokenRef);
	//@ts-expect-error .map
	const targetsIn = targetsRef?.map(t => getToken(t));
	if (!tokenIn || tokenIn === null || !targetsIn)
		return { result: "fail", attackingToken: undefined };
	let attackingToken = tokenIn;
	if (!canvas || !canvas.tokens || !tokenIn || !targetsIn)
		return {
			result: "fail",
			attackingToken: tokenIn,
		};
	const canOverride = foundry.utils.getProperty(tokenIn.actor ?? {}, "flags.midi-qol.rangeOverride.attack.all") || foundry.utils.getProperty(tokenIn.actor ?? {}, `flags.midi-qol.rangeOverride.attack.${itemIn.system.actionType}`);
	const { result, reason, range, longRange } = checkRangeFunction(itemIn, attackingToken, targetsIn);
	if (!canOverride) { // no overrides so just do the check
		if (result === "fail" && reason) {
			if (showWarning)
				ui.notifications?.warn(reason);
		}
		return { result, attackingToken, range, longRange };
	}
	const ownedTokens = canvas.tokens.ownedTokens;
	// Initial Check
	// Now we loop through all owned tokens
	let possibleAttackers = ownedTokens.filter(t => {
		const canOverride = foundry.utils.getProperty(t.actor ?? {}, "flags.midi-qol.rangeOverride.attack.all") || foundry.utils.getProperty(t.actor ?? {}, `flags.midi-qol.rangeOverride.attack.${itemIn.system.actionType}`);
		return canOverride;
	});
	const successToken = possibleAttackers.find(attacker => checkRangeFunction(itemIn, attacker, targetsIn).result === "normal");
	if (successToken)
		return { result: "normal", attackingToken: successToken, range, longRange };
	// TODO come back and fix this: const disToken = possibleAttackers.find(attacker => checkRangeFunction(itemIn, attacker, targetsIn).result === "dis");
	return { result: "fail", attackingToken, range, longRange };
}
function getLevelsAutoCoverOptions() {
	const options = {};
	options.tokensProvideCover = game.settings.get("levelsautocover", "tokensProvideCover");
	options.ignoreFriendly = game.settings.get("levelsautocover", "ignoreFriendly");
	options.copsesProvideCover = game.settings.get("levelsautocover", "copsesProvideCover");
	options.tokenCoverAA = game.settings.get("levelsautocover", "tokenCoverAA");
	// options.coverData ?? this.getCoverData();
	options.precision = game.settings.get("levelsautocover", "coverRestriction");
	return options;
}
export const FULL_COVER = 999;
export const THREE_QUARTERS_COVER = 5;
export const HALF_COVER = 2;
export function computeCoverBonus(attacker, target, item = undefined) {
	let existingCoverBonus = foundry.utils.getProperty(target, "actor.flags.midi-qol.acBonus") ?? 0;
	if (!attacker)
		return existingCoverBonus;
	let coverBonus = 0;
	//@ts-expect-error .Levels
	let levelsAPI = CONFIG.Levels?.API;
	switch (configSettings.optionalRules.coverCalculation) {
		case "levelsautocover":
			if (!installedModules.get("levelsautocover") || !game.settings.get("levelsautocover", "apiMode"))
				return 0;
			//@ts-expect-error
			const coverData = AutoCover.calculateCover(attacker.document ? attacker : attacker.object, target.document ? target : target.object);
			// const coverData = AutoCover.calculateCover(attacker, target, {DEBUG: true});
			//@ts-expect-error
			const coverDetail = AutoCover.getCoverData();
			if (coverData.rawCover === 0)
				coverBonus = FULL_COVER;
			else if (coverData.rawCover > coverDetail[1].percent)
				coverBonus = 0;
			else if (coverData.rawCover < coverDetail[0].percent)
				coverBonus = THREE_QUARTERS_COVER;
			else if (coverData.rawCover < coverDetail[1].percent)
				coverBonus = HALF_COVER;
			if (coverData.obstructingToken)
				coverBonus = Math.max(2, coverBonus);
			console.log("midi-qol | ComputerCoverBonus - For token ", attacker.name, " attacking ", target.name, " cover data is ", coverBonus, coverData, coverDetail);
			break;
		case "simbuls-cover-calculator":
			if (!installedModules.get("simbuls-cover-calculator"))
				return 0;
			if (globalThis.CoverCalculator) {
				//@ts-expect-error
				const coverData = globalThis.CoverCalculator.Cover(attacker.document ? attacker : attacker.object, target);
				if (attacker === target) {
					coverBonus = 0;
					break;
				}
				if (coverData?.data?.results.cover === 3)
					coverBonus = FULL_COVER;
				else
					coverBonus = -coverData?.data?.results.value ?? 0;
				console.log("midi-qol | ComputeCover Bonus - For token ", attacker.name, " attacking ", target.name, " cover data is ", coverBonus, coverData);
			}
			break;
		case "tokencover":
			if (!installedModules.get("tokencover"))
				coverBonus = 0;
			else if (safeGetGameSetting("tokencover", "midiqol-covercheck") === "midiqol-covercheck-none") {
				const coverValue = calcTokenCover(attacker, target);
				if (coverValue === 4 || coverValue === 3)
					coverBonus = FULL_COVER;
				else if (coverValue === 2)
					coverBonus = THREE_QUARTERS_COVER;
				else if (coverValue === 1)
					coverBonus = HALF_COVER;
				else
					coverBonus = 0;
			}
			break;
		case "none":
		default:
			coverBonus = 0;
			break;
	}
	if (item?.flags?.midiProperties?.ignoreTotalCover && item.type === "spell")
		coverBonus = 0;
	else if (item?.flags?.midiProperties?.ignoreTotalCover && coverBonus === FULL_COVER)
		coverBonus = THREE_QUARTERS_COVER;
	if (item?.system.actionType === "rwak" && attacker.actor && foundry.utils.getProperty(attacker.actor, "flags.midi-qol.sharpShooter") && coverBonus !== FULL_COVER)
		coverBonus = 0;
	if (["rsak" /*, rpak*/].includes(item?.system.actionType) && attacker.actor && foundry.utils.getProperty(attacker.actor, "flags.dnd5e.spellSniper") && coverBonus !== FULL_COVER)
		coverBonus = 0;
	if (target.actor && coverBonus > existingCoverBonus)
		foundry.utils.setProperty(target.actor, "flags.midi-qol.acBonus", coverBonus);
	else
		coverBonus = existingCoverBonus;
	return coverBonus;
}
export function isAutoFastAttack(workflow = undefined) {
	if (workflow?.workflowOptions?.autoFastAttack !== undefined)
		return workflow.workflowOptions.autoFastAttack;
	if (workflow && workflow.workflowType === "DummyWorkflow")
		return workflow.rollOptions.fastForward;
	return game.user?.isGM ? configSettings.gmAutoFastForwardAttack : ["all", "attack"].includes(configSettings.autoFastForward);
}
export function isAutoFastDamage(workflow = undefined) {
	if (workflow?.workflowOptions?.autoFastDamage !== undefined)
		return workflow.workflowOptions.autoFastDamage;
	if (workflow?.workflowType === "DummyWorkflow")
		return workflow.rollOptions.fastForwardDamage;
	return game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward);
}
export function isAutoConsumeResource(workflow = undefined) {
	if (workflow?.workflowOptions.autoConsumeResource !== undefined)
		return workflow?.workflowOptions.autoConsumeResource;
	return game.user?.isGM ? configSettings.gmConsumeResource : configSettings.consumeResource;
}
export function getAutoRollDamage(workflow = undefined) {
	if (configSettings.averageNPCDamage && workflow?.actor.type === "npc")
		return "onHit";
	if (workflow?.workflowOptions?.autoRollDamage) {
		const damageOptions = Object.keys(geti18nOptions("autoRollDamageOptions"));
		if (damageOptions.includes(workflow.workflowOptions.autoRollDamage))
			return workflow.workflowOptions.autoRollDamage;
		console.warn(`midi-qol | getAutoRollDamage | could not find ${workflow.workflowOptions.autoRollDamage} workflowOptions.autoRollDamage must be ond of ${damageOptions} defaulting to "onHit"`);
		return "onHit";
	}
	return game.user?.isGM ? configSettings.gmAutoDamage : configSettings.autoRollDamage;
}
export function getAutoRollAttack(workflow = undefined) {
	if (workflow?.workflowOptions?.autoRollAttack !== undefined) {
		return workflow.workflowOptions.autoRollAttack;
	}
	return game.user?.isGM ? configSettings.gmAutoAttack : configSettings.autoRollAttack;
}
export function getTargetConfirmation(workflow = undefined) {
	if (workflow?.workflowOptions?.targetConfirmation !== undefined)
		return workflow?.workflowOptions?.targetConfirmation;
	return targetConfirmation;
}
export function itemHasDamage(item) {
	return item?.system.actionType !== "" && item?.hasDamage;
}
export function itemIsVersatile(item) {
	return item?.system.actionType !== "" && item?.isVersatile;
}
export function getRemoveAttackButtons(item) {
	if (item) {
		const itemSetting = foundry.utils.getProperty(item, "flags.midi-qol.removeAttackDamageButtons");
		if (itemSetting) {
			if (["all", "attack"].includes(itemSetting))
				return true;
			if (itemSetting !== "default")
				return false;
		}
	}
	return game.user?.isGM ?
		["all", "attack"].includes(configSettings.gmRemoveButtons) :
		["all", "attack"].includes(configSettings.removeButtons);
}
export function getRemoveDamageButtons(item) {
	if (item) {
		const itemSetting = foundry.utils.getProperty(item, "flags.midi-qol.removeAttackDamageButtons");
		if (itemSetting) {
			if (["all", "damage"].includes(itemSetting))
				return true;
			if (itemSetting !== "default")
				return false;
		}
	}
	return game.user?.isGM ?
		["all", "damage"].includes(configSettings.gmRemoveButtons) :
		["all", "damage"].includes(configSettings.removeButtons);
}
export function getReactionSetting(player) {
	if (!player)
		return "none";
	return player.isGM ? configSettings.gmDoReactions : configSettings.doReactions;
}
export function getTokenPlayerName(token, checkGM = false) {
	if (!token)
		return game.user?.name;
	let name = getTokenName(token);
	if (checkGM && game.user?.isGM)
		return name;
	if (game.modules.get("anonymous")?.active) {
		//@ts-expect-error .api
		const api = game.modules.get("anonymous")?.api;
		if (api.playersSeeName(token.actor))
			return name;
		else
			return api.getName(token.actor);
	}
	return name;
}
export function getSpeaker(actor) {
	const speaker = ChatMessage.getSpeaker({ actor });
	if (!configSettings.useTokenNames)
		return speaker;
	let token = actor.token;
	if (!token)
		token = actor.getActiveTokens()[0];
	if (token)
		speaker.alias = token.name;
	return speaker;
}
export async function addConcentration(actorRef, concentrationData) {
	const actor = getActor(actorRef);
	if (!actor)
		return;
	if (debugEnabled > 0)
		warn("addConcentration", actor.name, concentrationData);
	await addConcentrationEffect(actor, concentrationData);
	await setConcentrationData(actor, concentrationData);
}
// Add the concentration marker to the character and update the duration if possible
export async function addConcentrationEffect(actor, concentrationData) {
	const item = concentrationData.item;
	let duration = {};
	let selfTarget = actor.token ? actor.token.object : getTokenForActor(actor);
	const inCombat = (game.combat?.turns.some(combatant => combatant.token?.id === selfTarget?.id));
	const convertedDuration = globalThis.DAE.convertDuration(item.system.duration, inCombat);
	if (convertedDuration?.type === "seconds") {
		duration = { seconds: convertedDuration.seconds, startTime: game.time.worldTime };
	}
	else if (convertedDuration?.type === "turns") {
		duration = {
			rounds: convertedDuration.rounds,
			turns: convertedDuration.turns,
			startRound: game.combat?.round,
			startTurn: game.combat?.turn
		};
	}
	//@ts-expect-error
	let statusEffect = await ActiveEffect.implementation.fromStatusEffect(systemConcentrationId, { parent: actor });
	if (!statusEffect) { // Try and see if there is another status effect we can use
		statusEffect = CONFIG.statusEffects.find(e => {
			//@ts-expect-error
			const statuses = e.statuses;
			switch (foundry.utils.getType(statuses)) {
				case "Array": return statuses.includes(systemConcentrationId) || statuses.includes("Concentrating");
				case "Set": return statuses.has(systemConcentrationId) || statuses.has("Concentrating");
				default: return false;
			}
		});
		if (statusEffect) {
			console.warn("midi-qol | addConcentrationEffect | matched concentration effect by statuses - this will fail in dnd5e 3.1");
			statusEffect = new ActiveEffect.implementation(foundry.utils.duplicate(statusEffect), { keepId: true });
		}
	}
	if (!statusEffect) {
		//@ts-expect-error
		statusEffect = CONFIG.statusEffects.find(e => e.name.toLowerCase() === i18n("EFFECT.DND5E.StatusConcentrating").toLowerCase());
		if (statusEffect) {
			console.warn("midi-qol | addConcentrationEffect | matched concentration effect by name - this will fail in dnd5e 3.1");
			statusEffect = new ActiveEffect.implementation(foundry.utils.duplicate(statusEffect), { keepId: true });
		}
	}
	if (!statusEffect) {
		const message = "No concentration effect found";
		TroubleShooter.recordError(new Error("message"), "Add concentration effect");
		console.error("midi-qol | addConcentrationEffect | ", message);
		return;
	}
	const effectUpdates = {
		origin: item.uuid,
		disabled: false,
		duration,
		transfer: false,
		flags: {
			"midi-qol": { isConcentration: item?.uuid },
		}
	};
	const existingEffect = actor.effects.get(statusEffect.id);
	if (existingEffect) {
		return existingEffect.update(effectUpdates);
	}
	statusEffect.updateSource(effectUpdates);
	if (debugEnabled > 1)
		debug("adding concentration", actor.name);
	//@ts-expect-error
	return await ActiveEffect.implementation.create(statusEffect, { parent: actor, keepId: true });
}
export async function setConcentrationData(actor, concentrationData) {
	if (actor && concentrationData.targets) {
		let targets = [];
		const selfTargetUuid = actor.uuid;
		let selfTargeted = false;
		for (let hit of concentrationData.targets) {
			const tokenUuid = hit.document?.uuid ?? hit.uuid;
			const actorUuid = hit.actor?.uuid ?? "";
			targets.push({ tokenUuid, actorUuid });
			if (selfTargetUuid === actorUuid)
				selfTargeted = true;
		}
		if (!selfTargeted) {
			let selfTarget = actor.token ? actor.token.object : getTokenForActor(actor);
			targets.push({ tokenUuid: selfTarget.uuid, actorUuid: actor.uuid });
		}
		let templates = concentrationData.templateUuid ? [concentrationData.templateUuid] : [];
		await actor.setFlag("midi-qol", "concentration-data", {
			uuid: concentrationData.item.uuid,
			targets,
			templates,
			removeUuids: concentrationData.removeUuids ?? []
		});
	}
}
/**
* Find tokens nearby
* @param {number|null} disposition. same(1), opposite(-1), neutral(0), ignore(null) token disposition
* @param {Token} token The token to search around
* @param {number} distance in game units to consider near
* @param {options} canSee Require that the potential target can sense the token
* @param {options} isSeen Require that the token can sense the potential target
* @param {options} includeIcapacitated: boolean count incapacitated tokens
*/
function mapTokenString(disposition) {
	if (typeof disposition === "number")
		return disposition;
	if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.FRIENDLY").toLocaleLowerCase())
		return 1;
	else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.HOSTILE").toLocaleLowerCase())
		return -1;
	else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.NEUTRAL").toLocaleLowerCase())
		return 0;
	else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.SECRET").toLocaleLowerCase())
		return -2;
	else if (disposition.toLocaleLowerCase().trim() === i18n("all").toLocaleLowerCase())
		return null;
	const validStrings = ["TOKEN.DISPOSITION.FRIENDLY", "TOKEN.DISPOSITION.HOSTILE", "TOKEN.DISPOSITION.NEUTRAL", "TOKEN.DISPOSITION.SECRET", "all"].map(s => i18n(s));
	throw new Error(`Midi-qol | findNearby ${disposition} is invalid. Disposition must be one of "${validStrings}"`);
}
/**
* findNearby
* @param {number} [disposition]          What disposition to match - one of CONST.TOKEN.DISPOSITIONS

* @param {string} [disposition]          What disposition to match - one of (localize) Friendly, Neutral, Hostile, Secret, all
* @param {null} [disposition]            Match any disposition
* @param {Array<string>} [disposition]   Match any of the dispostion strings
* @param {Array<number>} [disposition]   Match any of the disposition numbers
* @param {Token} [token]                 The token to use for the search
* @param {string} [token]                A token UUID
* @param {number} [distance]             The distance from token that will match
* @param {object} [options]
* @param {number} [options.MaxSize]      Only match tokens whose width * length < MaxSize
* @param {boolean} [includeIncapacitated]  Should incapacitated actors be include?
* @param {boolean} [canSee]              Must the potential target be able to see the token?
* @param {boolean} isSeen                Must the token token be able to see the potential target?
* @param {boolean} [includeToken]        Include token in the return array?
* @param {boolean} [relative]            If set, the specified disposition is compared with the token disposition.
*  A specified dispostion of HOSTILE and a token disposition of HOSTILE means find tokens whose disposition is FRIENDLY

*/
export function findNearby(disposition, token /*Token | uuuidString */, distance, options = { maxSize: undefined, includeIncapacitated: false, canSee: false, isSeen: false, includeToken: false, relative: true }) {
	token = getToken(token);
	if (!token)
		return [];
	if (!canvas || !canvas.scene)
		return [];
	try {
		if (!(token instanceof Token)) {
			throw new Error("find nearby token is not of type token or the token uuid is invalid");
		}
		;
		let relative = options.relative ?? true;
		let targetDisposition;
		if (typeof disposition === "string")
			disposition = mapTokenString(disposition);
		if (disposition instanceof Array) {
			if (disposition.some(s => s === "all"))
				disposition = [-1, 0, 1];
			else
				disposition = disposition.map(s => mapTokenString(s) ?? 0);
			targetDisposition = disposition.map(i => typeof i === "number" && [-1, 0, 1].includes(i) && relative ? token.document.disposition * i : i);
		}
		else if (typeof disposition === "number" && [-1, 0, 1].includes(disposition)) {
			//@ts-expect-error token.document.dispostion
			targetDisposition = relative ? [token.document.disposition * disposition] : [disposition];
		}
		else
			targetDisposition = [CONST.TOKEN_DISPOSITIONS.HOSTILE, CONST.TOKEN_DISPOSITIONS.NEUTRAL, CONST.TOKEN_DISPOSITIONS.FRIENDLY];
		let nearby = canvas.tokens?.placeables.filter(t => {
			if (!isTargetable(t))
				return false;
			//@ts-expect-error .height .width v10
			if (options.maxSize && t.document.height * t.document.width > options.maxSize)
				return false;
			if (!options.includeIncapacitated && checkIncapacitated(t, debugEnabled > 0))
				return false;
			let inRange = false;
			if (t.actor &&
				(t.id !== token.id || options?.includeToken) && // not the token
				//@ts-expect-error .disposition v10      
				(disposition === null || targetDisposition.includes(t.document.disposition))) {
				const tokenDistance = getDistance(t, token, true);
				inRange = 0 <= tokenDistance && tokenDistance <= distance;
			}
			else
				return false; // wrong disposition
			if (inRange && options.canSee && !canSense(t, token))
				return false; // Only do the canSee check if the token is inRange
			if (inRange && options.isSeen && !canSense(token, t))
				return false;
			return inRange;
		});
		return nearby ?? [];
	}
	catch (err) {
		TroubleShooter.recordError(err, "findnearby error");
		error(err);
		return [];
	}
}
export function checkNearby(disposition, tokenRef, distance, options = {}) {
	//@ts-expect-error .disposition
	const tokenDisposition = getTokenDocument(tokenRef)?.disposition;
	if (tokenDisposition === 0)
		options.relative = false;
	return findNearby(disposition, tokenRef, distance, options).length !== 0;
}
export function hasCondition(tokenRef, condition) {
	const td = getTokenDocument(tokenRef);
	if (!td)
		return 0;
	//@ts-expect-error
	if (td.actor.statuses.has(condition))
		return 1;
	//@ts-expect-error specialStatusEffects
	const specials = CONFIG.specialStatusEffects;
	switch (condition?.toLocaleLowerCase()) {
		case "blind":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.BLIND))
				return 1;
			break;
		case "burrow":
		case "burrowing":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.BURROW))
				return 1;
			break;
		case "dead":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.DEFEATED))
				return 1;
			break;
		case "deaf":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.DEAF))
				return 1;
			break;
		case "disease":
		case "disieased":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.DISEASE))
				return 1;
			break;
		case "fly":
		case "flying":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.FLY))
				return 1;
			break;
		case "inaudible":
		case "silent":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.INAUDIBLE))
				return 1;
			break;
		case "invisible":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.INVISIBLE))
				return 1;
			break;
		case "poison":
		case "poisoned":
			//@ts-expect-error hasStatusEffect
			if (td.hasStatusEffect(specials.POISON))
				return 1;
			break;
	}
	//@ts-expect-error hasStatusEffect
	if (td.hasStatusEffect(condition.toLocaleLowerCase()) || td.hasStatusEffect(condition))
		return 1;
	//@ts-expect-error
	const clt = game.clt;
	if (installedModules.get("condition-lab-triggler") && condition === "invisible" && clt.hasCondition("Invisible", [td.object], { warn: false }))
		return 1;
	if (installedModules.get("condition-lab-triggler") && condition === "hidden" && clt.hasCondition("Hidden", [td.object], { warn: false }))
		return 1;
	if (installedModules.get("dfreds-convenient-effects")) {
		// If we are looking for a status effect then we don't need to check dfreds since dfreds status effects include the system status effect id
		if (Object.keys(GameSystemConfig.statusEffects).includes(condition.toLocaleLowerCase()))
			return 0;
		//@ts-expect-error .dfreds
		const CEInt = game.dfreds?.effectInterface;
		const localCondition = i18n(`midi-qol.${condition}`);
		if (CEInt.hasEffectApplied(localCondition, td.actor?.uuid))
			return 1;
		if (CEInt.hasEffectApplied(condition, td.actor?.uuid))
			return 1;
	}
	return 0;
}
export async function removeInvisible() {
	if (!canvas || !canvas.scene)
		return;
	const token = canvas.tokens?.get(this.tokenId);
	if (!token)
		return;
	await removeTokenCondition(token, i18n(`midi-qol.invisible`));
	//@ts-expect-error
	if (game.release.generation < 12) {
		//@ts-expect-error
		await token.document.toggleActiveEffect({ id: CONFIG.specialStatusEffects.INVISIBLE }, { active: false });
	}
	else {
		//@ts-expect-error
		await token?.actor?.toggleStatusEffect(CONFIG.specialStatusEffects.INVISIBLE, { active: false });
	}
	log(`Hidden/Invisibility removed for ${this.actor.name}`);
}
export async function removeHidden() {
	if (!canvas || !canvas.scene)
		return;
	const token = canvas.tokens?.get(this.tokenId);
	if (!token)
		return;
	await removeTokenCondition(token, i18n(`midi-qol.hidden`));
	log(`Hidden removed for ${this.actor.name}`);
}
export async function removeTokenCondition(token, condition) {
	if (!token)
		return;
	//@ts-expect-error appliedEffects
	const hasEffect = token.actor?.appliedEffects.find(ef => ef.name === condition);
	if (hasEffect)
		await expireEffects(token.actor, [hasEffect], { "expiry-reason": `midi-qol:removeTokenCondition:${condition}` });
}
// this = {actoaddStatusEffectChangebonusDialog(r, item, myExpiredEffects}
export async function expireMyEffects(effectsToExpire) {
	const expireHit = effectsToExpire.includes("1Hit") && !this.effectsAlreadyExpired.includes("1Hit");
	const expireAction = effectsToExpire.includes("1Action") && !this.effectsAlreadyExpired.includes("1Action");
	const expireSpell = effectsToExpire.includes("1Spell") && !this.effectsAlreadyExpired.includes("1Spell");
	const expireAttack = effectsToExpire.includes("1Attack") && !this.effectsAlreadyExpired.includes("1Attack");
	const expireDamage = effectsToExpire.includes("DamageDealt") && !this.effectsAlreadyExpired.includes("DamageDealt");
	const expireInitiative = effectsToExpire.includes("Initiative") && !this.effectsAlreadyExpired.includes("Initiative");
	// expire any effects on the actor that require it
	if (debugEnabled && false) {
		const test = this.actor.effects.map(ef => {
			const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration");
			return [(expireAction && specialDuration?.includes("1Action")),
				(expireAttack && specialDuration?.includes("1Attack") && this.item?.hasAttack),
				(expireHit && this.item?.hasAttack && specialDuration?.includes("1Hit") && this.hitTargets.size > 0)];
		});
		if (debugEnabled > 1)
			debug("expiry map is ", test);
	}
	const myExpiredEffects = this.actor.appliedEffects?.filter(ef => {
		const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration");
		if (!specialDuration || !specialDuration?.length)
			return false;
		return (expireAction && specialDuration.includes("1Action")) ||
			(expireAttack && this.item?.hasAttack && specialDuration.includes("1Attack")) ||
			(expireSpell && this.item?.type === "spell" && specialDuration.includes("1Spell")) ||
			(expireAttack && this.item?.hasAttack && specialDuration.includes(`1Attack:${this.item?.system.actionType}`)) ||
			(expireHit && this.item?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.size > 0) ||
			(expireHit && this.item?.hasAttack && specialDuration.includes(`1Hit:${this.item?.system.actionType}`) && this.hitTargets.size > 0) ||
			(expireDamage && this.item?.hasDamage && specialDuration.includes("DamageDealt")) ||
			(expireInitiative && specialDuration.includes("Initiative"));
	});
	if (debugEnabled > 1)
		debug("expire my effects", myExpiredEffects, expireAction, expireAttack, expireHit);
	this.effectsAlreadyExpired = this.effectsAlreadyExpired.concat(effectsToExpire);
	if (myExpiredEffects?.length > 0)
		await expireEffects(this.actor, myExpiredEffects, { "expiry-reason": `midi-qol:${effectsToExpire}` });
}
export async function expireRollEffect(rolltype, abilityId, success) {
	const rollType = rolltype.charAt(0).toUpperCase() + rolltype.slice(1);
	const expiredEffects = this.appliedEffects?.filter(ef => {
		const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration");
		if (!specialDuration)
			return false;
		if (specialDuration.includes(`is${rollType}`))
			return true;
		if (specialDuration.includes(`is${rollType}.${abilityId}`))
			return true;
		if (success === true && specialDuration.includes(`is${rollType}Success`))
			return true;
		if (success === true && specialDuration.includes(`is${rollType}Success.${abilityId}`))
			return true;
		if (success === false && specialDuration.includes(`is${rollType}Failure`))
			return true;
		if (success === false && specialDuration.includes(`is${rollType}Failure.${abilityId}`))
			return true;
		return false;
	}).map(ef => ef.id);
	if (expiredEffects?.length > 0) {
		await timedAwaitExecuteAsGM("removeEffects", {
			actorUuid: this.uuid,
			effects: expiredEffects,
			options: { "midi-qol": `special-duration:${rollType}:${abilityId}` }
		});
	}
}
export function validTargetTokens(tokenSet) {
	return tokenSet?.filter(tk => tk.actor).filter(tk => isTargetable(tk)) ?? new Set();
}
export function MQfromUuid(uuid) {
	if (!uuid || uuid === "")
		return null;
	//@ts-expect-error foundry v10 types
	return fromUuidSync(uuid);
}
export function MQfromActorUuid(uuid) {
	let doc = MQfromUuid(uuid);
	if (doc instanceof Actor)
		return doc;
	if (doc instanceof Token)
		return doc.actor;
	if (doc instanceof TokenDocument)
		return doc.actor;
	return null;
}
class RollModifyDialog extends Application {
	constructor(data, options) {
		options.height = "auto";
		options.resizable = true;
		super(options);
		this.data = data;
		this.timeRemaining = this.data.timeout;
		this.rollExpanded = false;
		if (!data.rollMode)
			data.rollMode = game.settings.get("core", "rollMode");
		this.timeoutId = setTimeout(() => {
			if (this.secondTimeoutId)
				clearTimeout(this.secondTimeoutId);
			this.timeoutId = undefined;
			this.close();
		}, this.data.timeout * 1000);
	}
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			template: "modules/midi-qol/templates/dialog.html",
			classes: ["dialog"],
			width: 600,
			jQuery: true
		}, { overwrite: true });
	}
	get title() {
		let maxPad = 1;
		if (this.data.timeout < maxPad)
			maxPad = this.data.timeout;
		if (this.data.timeout) {
			const padCount = Math.ceil(this.timeRemaining / (this.data.timeout ?? defaultTimeout) * maxPad);
			const pad = "-".repeat(padCount);
			return `${this.data.title ?? "Dialog"} ${pad} ${this.timeRemaining}`;
		}
		else
			return this.data.title ?? "Dialog";
	}
	set1SecondTimeout() {
		this.secondTimeoutId = setTimeout(() => {
			clearTimeout(this.secondTimeoutId);
			if (!this.timeoutId)
				return;
			this.timeRemaining -= 1;
			this.render(false);
			if (this.timeRemaining > 0)
				this.set1SecondTimeout();
		}, 1000);
	}
	async render(force = false, options = {}) {
		const result = await super.render(force, options);
		const element = this.element;
		const title = element.find(".window-title")[0];
		if (!this.secondTimeoutId && this.timeoutId)
			this.set1SecondTimeout();
		if (!title)
			return result;
		let color = "red";
		if (this.timeRemaining >= this.data.timeout * 0.75)
			color = "chartreuse";
		else if (this.timeRemaining >= this.data.timeout * 0.50)
			color = "yellow";
		else if (this.timeRemaining >= this.data.timeout * 0.25)
			color = "orange";
		title.style.color = color;
		return result;
	}
	async getData(options) {
		this.data.flags = this.data.flags.filter(flagName => {
			if ((getOptionalCountRemaining(this.data.actor, `${flagName}.count`)) < 1)
				return false;
			return foundry.utils.getProperty(this.data.actor, flagName) !== undefined;
		});
		if (this.data.flags.length === 0)
			this.close();
		this.data.buttons = this.data.flags.reduce((obj, flag) => {
			let flagData = foundry.utils.getProperty(this.data.actor ?? {}, flag);
			let value = foundry.utils.getProperty(flagData ?? {}, this.data.flagSelector);
			let icon = "fas fa-dice-d20";
			if (value !== undefined) {
				let labelDetail;
				if (typeof value === "string") {
					labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData());
					if (value.startsWith("ItemMacro")) {
						icon = CONFIG.Macro.sidebarIcon;
						if (value === "ItemMacro")
							labelDetail = this.data.item?.name ?? "Macro";
						else {
							const uuid = value.split(".").slice(1).join(".");
							//@ts-expect-error
							const item = fromUuidSync(uuid);
							if (item)
								labelDetail = item.name;
							else
								labelDetail = uuid;
						}
					}
					else if (value.startsWith("function")) {
						icon = CONFIG.Macro.sidebarIcon;
						labelDetail = value.split(".").slice(-1);
					}
					else if (value.startsWith("Macro")) {
						icon = CONFIG.Macro.sidebarIcon;
						labelDetail = value.split(".").slice(1).join(".");
					}
				}
				else
					labelDetail = `${value}`;
				obj[foundry.utils.randomID()] = {
					icon: `<i class="${icon}"></i>`,
					//          label: (flagData.label ?? "Bonus") + `  (${foundry.utils.getProperty(flagData, this.data.flagSelector) ?? "0"})`,
					label: (flagData?.label ?? "Bonus") + `  (${labelDetail})`,
					value: `${value}`,
					key: flag,
					callback: this.data.callback
				};
			}
			let selector = this.data.flagSelector.split(".");
			if (selector[selector.length - 1] !== "all") {
				selector[selector.length - 1] = "all";
				const allSelector = selector.join(".");
				value = foundry.utils.getProperty(flagData ?? {}, allSelector);
				if (value !== undefined) {
					let labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData());
					labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData());
					if (value.startsWith("ItemMacro")) {
						icon = CONFIG.Macro.sidebarIcon;
						if (value === "ItemMacro")
							labelDetail = this.data.item?.name ?? "Macro";
						else {
							const uuid = value.split(".").slice(1).join(".");
							//@ts-expect-error
							const item = fromUuidSync(uuid);
							if (item)
								labelDetail = item.name;
							else
								labelDetail = uuid;
						}
					}
					else if (value.startsWith("function")) {
						icon = CONFIG.Macro.sidebarIcon;
						labelDetail = value.split(".").slice(-1);
					}
					else if (value.startsWith("Macro")) {
						icon = CONFIG.Macro.sidebarIcon;
						labelDetail = value.split(".").slice(1).join(".");
					}
					else
						labelDetail = `${value}`;
					obj[foundry.utils.randomID()] = {
						icon: `<i class="${icon}"></i>`,
						//          label: (flagData.label ?? "Bonus") + `  (${foundry.utils.getProperty(flagData, allSelector) ?? "0"})`,
						label: (flagData?.label ?? "Bonus") + (debugEnabled > 0 ? `: ${labelDetail}` : ""),
						value,
						key: flag,
						callback: this.data.callback
					};
				}
			}
			return obj;
		}, {});
		this.data.buttons.no = {
			icon: '<i class="fas fa-times"></i>',
			label: i18n("Cancel"),
			callback: () => {
				this.data.flags = [];
				this.close();
			}
		};
		// this.data.content = await midiRenderRoll(this.data.currentRoll);
		// this.data.content = await this.data.currentRoll.render();
		return {
			content: this.data.content,
			buttons: this.data.buttons
		};
	}
	activateListeners(html) {
		html.find(".dialog-button").click(this._onClickButton.bind(this));
		$(document).on('keydown.chooseDefault', this._onKeyDown.bind(this));
		html.on("click", ".dice-roll", this._onDiceRollClick.bind(this));
	}
	_onDiceRollClick(event) {
		event.preventDefault();
		// Toggle the message flag
		let roll = event.currentTarget;
		this.rollExpanded = !this.rollExpanded;
		// Expand or collapse tooltips
		const tooltips = roll.querySelectorAll(".dice-tooltip");
		for (let tip of tooltips) {
			if (this.rollExpanded)
				$(tip).slideDown(200);
			else
				$(tip).slideUp(200);
			tip.classList.toggle("expanded", this.rollExpanded);
		}
	}
	_onClickButton(event) {
		if (this.secondTimeoutId) {
			clearTimeout(this.secondTimeoutId);
			this.secondTimeoutId = 0;
		}
		const oneUse = true;
		const id = event.currentTarget.dataset.button;
		const button = this.data.buttons[id];
		this.submit(button);
	}
	_onKeyDown(event) {
		// Close dialog
		if (event.key === "Escape" || event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			this.close();
		}
	}
	async submit(button) {
		if (this.secondTimeoutId) {
			clearTimeout(this.secondTimeoutId);
		}
		try {
			if (button.callback) {
				await button.callback(this, button);
				// await this.getData({}; Render will do a get data, doing it twice breaks the button data?
				if (this.secondTimeoutId) {
					clearTimeout(this.secondTimeoutId);
					this.secondTimeoutId = 0;
				}
				this.render(true);
			}
			// this.close();
		}
		catch (err) {
			const message = "midi-qol | Optional flag roll error see console for details ";
			ui.notifications?.error(message);
			TroubleShooter.recordError(err, message);
			error(err);
		}
	}
	async close() {
		if (this.timeoutId)
			clearTimeout(this.timeoutId);
		this.timeoutId = undefined;
		if (this.secondTimeoutId)
			clearTimeout(this.secondTimeoutId);
		this.secondTimeoutId = 0;
		if (this.data.close)
			this.data.close();
		$(document).off('keydown.chooseDefault');
		return super.close();
	}
}
export async function processAttackRollBonusFlags() {
	let attackBonus = "attack.all";
	if (this.item && this.item.hasAttack)
		attackBonus = `attack.${this.item.system.actionType}`;
	const optionalFlags = foundry.utils.getProperty(this.actor ?? {}, "flags.midi-qol.optional") ?? {};
	// If the attack roll is a fumble only select flags that allow the roll to be rerolled.
	let bonusFlags = Object.keys(optionalFlags)
		.filter(flag => {
		const hasAttackFlag = foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.attack.all`) ||
			foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.${attackBonus}`);
		if (hasAttackFlag === undefined)
			return false;
		if (this.isFumble && !hasAttackFlag?.includes("roll"))
			return false;
		if (!this.actor.flags["midi-qol"].optional[flag].count)
			return true;
		return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
	})
		.map(flag => `flags.midi-qol.optional.${flag}`);
	if (bonusFlags.length > 0) {
		const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, checkMechanic("displayBonusRolls"), `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll, "attackRoll");
		this.setAttackRoll(newRoll);
	}
	if (this.targets.size === 1) {
		const targetAC = this.targets.first().actor.system.attributes.ac.value;
		this.processAttackRoll();
		const isMiss = this.isFumble || this.attackRoll.total < targetAC;
		if (isMiss) {
			attackBonus = "attack.fail.all";
			if (this.item && this.item.hasAttack)
				attackBonus = `attack.fail.${this.item.system.actionType}`;
			let bonusFlags = Object.keys(optionalFlags)
				.filter(flag => {
				const hasAttackFlag = foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.attack.fail.all`)
					|| foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.${attackBonus}`);
				if (hasAttackFlag === undefined)
					return false;
				if (this.isFumble && !hasAttackFlag?.includes("roll"))
					return false;
				if (!this.actor.flags["midi-qol"].optional[flag].count)
					return true;
				return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
			})
				.map(flag => `flags.midi-qol.optional.${flag}`);
			if (bonusFlags.length > 0) {
				const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, checkMechanic("displayBonusRolls"), `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll, "attackRoll");
				this.setAttackRoll(newRoll);
			}
		}
	}
	return this.attackRoll;
}
export async function processDamageRollBonusFlags() {
	let damageBonus = "damage.all";
	if (this.item)
		damageBonus = `damage.${this.item.system.actionType}`;
	const optionalFlags = foundry.utils.getProperty(this.actor ?? {}, "flags.midi-qol.optional") ?? {};
	const bonusFlags = Object.keys(optionalFlags)
		.filter(flag => {
		const hasDamageFlag = foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.damage.all`) !== undefined ||
			foundry.utils.getProperty(this.actor ?? {}, `flags.midi-qol.optional.${flag}.${damageBonus}`) !== undefined;
		if (!hasDamageFlag)
			return false;
		return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
	})
		.map(flag => `flags.midi-qol.optional.${flag}`);
	if (bonusFlags.length > 0) {
		// this.damageRollHTML = await midiRenderDamageRoll(this.damageRoll);
		// this.damamgeRollHTML = $(this.damageRolHTML).find(".dice-roll").remove();
		// TODO dnd3 work out what this means for multiple rolls
		let newRoll = await bonusDialog.bind(this)(bonusFlags, damageBonus, false, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, this.damageRolls[0], "damageRoll");
		if (newRoll)
			this.damageRolls[0] = newRoll;
	}
	return this.damageRolls;
}
export async function bonusDialog(bonusFlags, flagSelector, showRoll, title, roll, rollType, options = {}) {
	const showDiceSoNice = dice3dEnabled(); // && configSettings.mergeCard;
	let timeoutId;
	if (!roll)
		return undefined;
	let newRoll = roll;
	let originalRoll = roll;
	let rollHTML = await midiRenderRoll(roll);
	const player = playerForActor(this.actor);
	let timeout = options.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
	return new Promise((resolve, reject) => {
		async function onClose() {
			if (timeoutId)
				clearTimeout(timeoutId);
			//@ts-expect-error
			newRoll.options.rollMode = rollMode;
			// The original roll is dsn displayed before the bonus dialog is called so mark it as displayed
			DSNMarkDiceDisplayed(originalRoll);
			// The new roll has had dsn display done for each bonus term/reroll so mark it as displayed
			DSNMarkDiceDisplayed(newRoll);
			if (showRoll && newRoll !== originalRoll) {
				//TODO match the renderRoll to the roll type
				const newRollHTML = await midiRenderRoll(newRoll);
				const originalRollHTML = await midiRenderRoll(originalRoll);
				const chatData = mergeObject({
					flavor: `${title}`,
					speaker: ChatMessage.getSpeaker({ actor: this.actor }),
					content: `${originalRollHTML}<br>${newRollHTML}`,
					whisper: [player?.id ?? ""],
					rolls: [originalRoll, newRoll],
					sound: CONFIG.sounds.dice,
					flags: bonusFlags
				}, options.messageData);
				//@ts-expect-error
				if (game.release.generation < 12) {
					chatData.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
				}
				else {
					//@ts-expect-error
					chatData.style = CONST.CHAT_MESSAGE_STYLES.ROLL;
				}
				ChatMessage.applyRollMode(chatData, rollMode);
				ChatMessage.create(chatData);
				foundry.utils.setProperty(newRoll, "flags.midi-qol.chatMessageShown", true);
			}
			resolve(newRoll);
		}
		if (options.timeout) {
			timeoutId = setTimeout(() => {
				resolve(newRoll);
			}, timeout * 1000);
		}
		const callback = async (dialog, button) => {
			if (this.seconditimeoutId) {
				clearTimeout(this.seconditimeoutId);
			}
			let reRoll;
			let chatMessage;
			const undoId = foundry.utils.randomID();
			const undoData = {
				id: undoId,
				userId: player?.id ?? "",
				userName: player?.name ?? "Gamemaster",
				itemName: button.label,
				itemUuid: "",
				actorUuid: this.actor.uuid,
				actorName: this.actor.name,
				isReaction: true
			};
			await untimedExecuteAsGM("queueUndoDataDirect", undoData);
			const rollMode = foundry.utils.getProperty(this.actor ?? {}, button.key)?.rollMode ?? game.settings.get("core", "rollMode");
			if (!hasEffectGranting(this.actor, button.key, flagSelector))
				return;
			let resultApplied = false; // This is just for macro calls
			let macroToCall;
			const allFlagSelector = flagSelector.split(".").slice(0, -1).join(".") + ".all";
			let specificMacro = false;
			const possibleMacro = foundry.utils.getProperty(this.actor ?? {}, `${button.key}.${flagSelector}`) ||
				foundry.utils.getProperty(this.actor ?? {}, `${button.key}.${allFlagSelector}`);
			if (possibleMacro && (button.value.trim().startsWith("ItemMacro") || button.value.trim().startsWith("Macro") || button.value.trim().startsWith("function"))) {
				macroToCall = button.value;
				if (macroToCall.startsWith("Macro."))
					macroToCall = macroToCall.replace("Macro.", "");
				specificMacro = true;
			}
			else if (foundry.utils.getProperty(this.actor ?? {}, `${button.key}.macroToCall`)?.trim()) {
				macroToCall = foundry.utils.getProperty(this.actor ?? {}, `${button.key}.macroToCall`)?.trim();
			}
			if (macroToCall) {
				let result;
				let workflow;
				if (this instanceof Workflow || this.workflow) {
					workflow = this.workflow ?? this;
				}
				else {
					const itemUuidOrName = button.value.split(".").slice(1).join(".");
					//@ts-expect-error
					let item = fromUuidSync(itemUuidOrName);
					if (!item && this.actor)
						item = this.actor.items.getName(itemUuidOrName);
					if (!item && this instanceof Actor)
						item = this.items.getName(itemUuidOrName);
					workflow = new DummyWorkflow(this.actor ?? this, item, ChatMessage.getSpeaker({ actor: this.actor }), [], {});
				}
				const macroData = workflow.getMacroData();
				macroData.macroPass = `${button.key}.${flagSelector}`;
				macroData.tag = "optional";
				macroData.roll = roll;
				result = await workflow.callMacro(workflow?.item, macroToCall, macroData, { roll, bonus: (!specificMacro ? button.value : undefined) });
				if (typeof result === "string")
					button.value = result;
				else {
					if (result instanceof Roll) {
						newRoll = result;
						resultApplied = true;
					}
					if (specificMacro) {
						newRoll = roll;
						resultApplied = true;
					}
				}
				if (result === undefined && debugEnabled > 0)
					console.warn(`midi-qol | bonusDialog | macro ${button.value} return undefined`);
			}
			//@ts-expect-error
			const D20Roll = CONFIG.Dice.D20Roll;
			// do the roll modifications
			if (!resultApplied)
				switch (button.value) {
					case "reroll":
						reRoll = await roll.reroll();
						if (showDiceSoNice)
							await displayDSNForRoll(reRoll, rollType, rollMode);
						newRoll = reRoll;
						break;
					case "reroll-query":
						reRoll = reRoll = await roll.reroll();
						if (showDiceSoNice)
							await displayDSNForRoll(reRoll, rollType, rollMode);
						const newRollHTML = await midiRenderRoll(reRoll);
						if (await Dialog.confirm({ title: "Confirm reroll", content: `Replace ${rollHTML} with ${newRollHTML}`, defaultYes: true }))
							newRoll = reRoll;
						else
							newRoll = roll;
						break;
					case "reroll-kh":
						reRoll = await roll.reroll();
						if (showDiceSoNice)
							await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
						newRoll = reRoll;
						if (reRoll.total <= (roll.total ?? 0))
							newRoll = roll;
						break;
					case "reroll-kl":
						reRoll = await roll.reroll();
						newRoll = reRoll;
						if (reRoll.total > (roll.total ?? 0))
							newRoll = roll;
						if (showDiceSoNice)
							await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
						break;
					case "reroll-max":
						newRoll = await roll.reroll({ maximize: true });
						if (showDiceSoNice)
							await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
						break;
					case "reroll-min":
						newRoll = await roll.reroll({ minimize: true });
						if (showDiceSoNice)
							await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
						break;
					case "success":
						newRoll = newRoll = await roll.clone().evaluate();
						//@ts-expect-error
						newRoll.terms[0].results.forEach(res => res.result = 99);
						//@ts-expect-error
						newRoll._total = 99;
						setProperty(newRoll, "options", duplicate(roll.options));
						setProperty(newRoll, "options.success", true);
						break;
					case "fail":
						newRoll = newRoll = await roll.clone().evaluate();
						setProperty(newRoll, "options", duplicate(roll.options));
						setProperty(newRoll, "options.success", false);
						//@ts-expect-error
						newRoll.terms[0].results.forEach(res => res.result = -1);
						//@ts-expect-error
						newRoll._total = -1;
					default:
						if (typeof button.value === "string" && button.value.startsWith("replace ")) {
							const rollParts = button.value.split(" ");
							newRoll = new Roll(rollParts.slice(1).join(" "), (this.item ?? this.actor).getRollData());
							newRoll = await newRoll.evaluate();
							if (showDiceSoNice)
								await displayDSNForRoll(newRoll, rollType, rollMode);
						}
						else if (flagSelector.startsWith("damage.") && foundry.utils.getProperty(this.actor ?? this, `${button.key}.criticalDamage`)) {
							//@ts-expect-error .DamageRoll
							const DamageRoll = CONFIG.Dice.DamageRoll;
							let rollOptions = foundry.utils.duplicate(roll.options);
							//@ts-expect-error
							rollOptions.configured = false;
							// rollOptions = { critical: (this.isCritical || this.rollOptions.critical), configured: false };
							//@ts-expect-error D20Roll
							newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
							let rollData = {};
							if (this instanceof Workflow)
								rollData = this.item?.getRollData() ?? this.actor?.getRollData() ?? {};
							else
								rollData = this.actor?.getRollData() ?? {}; // 
							const tempRoll = new DamageRoll(`${button.value}`, rollData, rollOptions);
							await tempRoll.evaluate();
							if (showDiceSoNice)
								await displayDSNForRoll(tempRoll, rollType, rollMode);
							newRoll = addRollTo(roll, tempRoll);
						}
						else {
							//@ts-expect-error
							newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
							let rollData = {};
							if (this instanceof Workflow)
								rollData = this.item?.getRollData() ?? this.actor?.getRollData() ?? {};
							else
								rollData = this.actor?.getRollData() ?? this;
							const tempRoll = await (new Roll(button.value, rollData)).roll();
							if (showDiceSoNice)
								await displayDSNForRoll(tempRoll, rollType, rollMode);
							newRoll = addRollTo(newRoll, tempRoll);
						}
						break;
				}
			if (showRoll && this.category === "ac") { // TODO do a more general fix for displaying this stuff
				const newRollHTML = await midiRenderRoll(newRoll);
				const chatData = {
					flavor: game.i18n.localize("DND5E.ArmorClass"),
					content: `${newRollHTML}`,
					whisper: [player?.id ?? ""]
				};
				ChatMessage.applyRollMode(chatData, rollMode);
				chatMessage = await ChatMessage.create(chatData);
			}
			//@ ts-expect-error D20Roll
			// let originalRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
			// dialog.data.rollHTML = rollHTML;
			await removeEffectGranting(this.actor, button.key);
			bonusFlags = bonusFlags.filter(bf => bf !== button.key);
			if (bonusFlags.length === 0) {
				dialog.close();
				return;
			}
			const newRollHTML = /*reRoll ? await midiRenderRoll(reRoll) :*/ await midiRenderRoll(newRoll);
			dialog.data.flags = bonusFlags;
			dialog.data.currentRoll = newRoll;
			roll = newRoll;
			if (game.user?.isGM) {
				dialog.data.content = newRollHTML;
			}
			else {
				if (["publicroll", "gmroll", "selfroll"].includes(rollMode))
					dialog.data.content = newRollHTML;
				else
					dialog.data.content = "Hidden Roll";
			}
			dialog.render(true);
			// dialog.close();
			if (chatMessage)
				untimedExecuteAsGM("updateUndoChatCardUuidsById", { id: undoId, chatCardUuids: [(await chatMessage).uuid] });
		};
		let content;
		let rollMode = options?.rollMode ?? game.settings.get("core", "rollMode");
		if (game.user?.isGM) {
			content = rollHTML;
		}
		else {
			if (["publicroll", "gmroll", "selfroll"].includes(rollMode))
				content = rollHTML;
			else
				content = "Hidden Roll";
		}
		const dialog = new RollModifyDialog({
			actor: this.actor,
			flags: bonusFlags,
			flagSelector,
			targetObject: this,
			title,
			content,
			currentRoll: roll,
			rollHTML,
			rollMode: rollType,
			callback,
			close: onClose.bind(this),
			timeout,
			item: this.item
		}, {
			width: 400
		}).render(true);
	});
}
//@ts-expect-error dnd5e v10
export function getOptionalCountRemainingShortFlag(actor, flag) {
	const countValue = getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.count`);
	const altCountValue = getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.countAlt`);
	const countRemaining = getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.count`) && getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.countAlt`);
	return countRemaining;
}
//@ts-expect-error dnd5e v10
export function getOptionalCountRemaining(actor, flag) {
	const countValue = foundry.utils.getProperty(actor, flag);
	if (!countValue)
		return 1;
	if (["turn", "each-round", "each-turn"].includes(countValue) && game.combat) {
		let usedFlag = flag.replace(".countAlt", ".used");
		usedFlag = flag.replace(".count", ".used");
		// check for the flag
		if (foundry.utils.getProperty(actor, usedFlag))
			return 0;
	}
	else if (countValue === "reaction") {
		// return await hasUsedReaction(actor)
		return actor.getFlag("midi-qol", "actions.reactionCombatRound") && needsReactionCheck(actor) ? 0 : 1;
	}
	else if (countValue === "every")
		return 1;
	if (Number.isNumeric(countValue))
		return countValue;
	if (countValue.startsWith("ItemUses.")) {
		const itemName = countValue.split(".")[1];
		const item = actor.items.getName(itemName);
		return item?.system.uses.value;
	}
	if (countValue.startsWith("@")) {
		let result = foundry.utils.getProperty(actor?.system ?? {}, countValue.slice(1));
		return result;
	}
	return 1;
}
//@ts-expect-error dnd5e v10
export async function removeEffectGranting(actor, changeKey) {
	const effect = actor.appliedEffects.find(ef => ef.changes.some(c => c.key.includes(changeKey)));
	if (effect === undefined)
		return;
	const effectData = effect.toObject();
	const count = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".count"));
	const countAlt = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".countAlt"));
	if (!count) {
		return expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" });
	}
	if (Number.isNumeric(count.value) || Number.isNumeric(countAlt?.value)) {
		if (count.value <= 1 || countAlt?.value <= 1)
			return expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" });
		else if (Number.isNumeric(count.value)) {
			count.value = `${count.value - 1}`; // must be a string
		}
		else if (Number.isNumeric(countAlt?.value)) {
			countAlt.value = `${countAlt.value - 1}`; // must be a string
		}
		await effect.update({ changes: effectData.changes });
	}
	if (typeof count.value === "string" && count.value.startsWith("ItemUses.")) {
		const itemName = count.value.split(".")[1];
		const item = actor.items.getName(itemName);
		if (!item) {
			const message = `midi-qol | removeEffectGranting | could not decrement uses for ${itemName} on actor ${actor.name}`;
			error(message);
			TroubleShooter.recordError(new Error(message), message);
			return;
		}
		await item.update({ "system.uses.value": Math.max(0, item.system.uses.value - 1) });
	}
	if (typeof countAlt?.value === "string" && countAlt.value.startsWith("ItemUses.")) {
		const itemName = countAlt.value.split(".")[1];
		const item = actor.items.getName(itemName);
		if (!item) {
			const message = `midi-qol | removeEffectGranting | could not decrement uses for ${itemName} on actor ${actor.name}`;
			error(message);
			TroubleShooter.recordError(new Error(message), message);
			return;
		}
		await item.update({ "system.uses.value": Math.max(0, item.system.uses.value - 1) });
	}
	const actorUpdates = {};
	if (typeof count.value === "string" && count.value.startsWith("@")) {
		let key = count.value.slice(1);
		if (key.startsWith("system."))
			key = key.replace("system.", "");
		// we have an @field to consume
		let charges = foundry.utils.getProperty(actor?.system ?? {}, key);
		if (charges) {
			charges -= 1;
			actorUpdates[`system.${key}`] = charges;
		}
	}
	if (typeof countAlt?.value === "string" && countAlt.value.startsWith("@")) {
		let key = countAlt.value.slice(1);
		if (key.startsWith("system."))
			key = key.replace("system.", "");
		// we have an @field to consume
		let charges = foundry.utils.getProperty(actor?.system ?? {}, key);
		if (charges) {
			charges -= 1;
			actorUpdates[`system.${key}`] = charges;
		}
	}
	if (["turn", "each-round", "each-turn"].includes(count.value)) {
		const flagKey = `${changeKey}.used`.replace("flags.midi-qol.", "");
		actorUpdates[`${changeKey}.used`] = true;
		// await actor.setFlag("midi-qol", flagKey, true);
	}
	if (["turn", "each-round", "each-turn"].includes(countAlt?.value)) {
		const flagKey = `${changeKey}.used`.replace("flags.midi-qol.", "");
		actorUpdates[`${changeKey}.used`] = true;
		// await actor.setFlag("midi-qol", flagKey, true);
	}
	//@ts-expect-error v10 isEmpty
	if (!foundry.utils.isEmpty(actorUpdates))
		await actor.update(actorUpdates);
	if (count.value === "reaction" || countAlt?.value === "reaction") {
		await setReactionUsed(actor);
	}
}
//@ts-expect-error dnd5e v10
export function hasEffectGranting(actor, key, selector) {
	// Actually check for the flag being set...
	if (getOptionalCountRemainingShortFlag(actor, key) <= 0)
		return false;
	let changeKey = `${key}.${selector}`;
	let hasKey = foundry.utils.getProperty(actor ?? {}, changeKey);
	if (hasKey !== undefined)
		return true;
	let allKey = selector.split(".");
	allKey[allKey.length - 1] = "all";
	changeKey = `${key}.${allKey.join(".")}`;
	hasKey = foundry.utils.getProperty(actor ?? {}, changeKey);
	if (hasKey !== undefined)
		return hasKey;
	return false;
}
//@ts-expect-error dnd5e
export function isConcentrating(actor) {
	let concentrationLabel = getConcentrationLabel();
	return actor.effects.contents.find(e => e.name === concentrationLabel && !e.disabled && !e.isSuppressed);
}
function maxCastLevel(actor) {
	if (configSettings.ignoreSpellReactionRestriction)
		return 9;
	const spells = actor.system.spells;
	if (!spells)
		return 0;
	let pactLevel = spells.pact?.value ? spells.pact?.level : 0;
	for (let i = 9; i > pactLevel; i--) {
		if (spells[`spell${i}`]?.value > 0)
			return i;
	}
	return pactLevel;
}
async function getMagicItemReactions(actor, triggerType) {
	//@ts-expect-error .api
	const api = game.modules.get("magicitems")?.api ?? game.modules.get("magic-items-2")?.api;
	if (!api)
		return [];
	const items = [];
	try {
		const magicItemActor = await api.actor(actor);
		if (!magicItemActor)
			return [];
		for (let magicItem of magicItemActor.items) {
			try {
				if (!magicItem.active)
					continue;
				for (let spell of magicItem.spells) {
					const theSpell = await fromUuid(spell.uuid);
					if (theSpell.system.activation.type.includes("reaction")) {
						items.push({ "itemName": magicItem.name, itemId: magicItem.id, "actionName": spell.name, "img": spell.img, "id": spell.id, "uuid": spell.uuid, baseItem: theSpell });
					}
				}
				for (let feature of magicItem.feats) {
					const theFeat = await fromUuid(feature.uuid);
					if (theFeat.system.activation.type.includes("reaction")) {
						items.push({ "itemName": magicItem.name, itemId: magicItem.id, "actionName": feature.name, "img": feature.img, "id": feature.id, "uuid": feature.uuid, baseItem: theFeat });
					}
				}
			}
			catch (err) {
				const message = `midi-qol | err fetching magic item ${magicItem.name}`;
				console.error(message, err);
				TroubleShooter.recordError(err, message);
			}
		}
	}
	catch (err) {
		const message = `midi-qol | getMagicItemReactions | Fetching magic item spells/features on ${actor.name} failed - ignoring`;
		TroubleShooter.recordError(err, message);
		console.error(message, err);
	}
	return items;
}
function itemReaction(item, triggerType, maxLevel, onlyZeroCost) {
	if (!item.system.activation?.type?.includes("reaction"))
		return false;
	if (item.system.activation?.cost > 0 && onlyZeroCost)
		return false;
	if (item.type === "spell") {
		if (configSettings.ignoreSpellReactionRestriction)
			return true;
		if (item.system.preparation.mode === "atwill")
			return true;
		if (item.system.level === 0)
			return true;
		if (item.system.preparation?.prepared !== true && item.system.preparation?.mode === "prepared")
			return false;
		if (item.system.preparation.mode !== "innate")
			return item.system.level <= maxLevel;
	}
	if (item.system.attunement === GameSystemConfig.attunementTypes.REQUIRED)
		return false;
	if (!item._getUsageUpdates({ consumeUsage: item.hasLimitedUses, consumeResource: item.hasResource, slotLevel: false }))
		return false;
	return true;
}
export const reactionTypes = {
	"reaction": { prompt: "midi-qol.reactionFlavorHit", triggerLabel: "isHit" },
	"reactiontargeted": { prompt: "midi-qol.reactionFlavorTargeted", triggerLabel: "isTargeted" },
	"reactionhit": { prompt: "midi-qol.reactionFlavorHit", triggerLabel: "isHit" },
	"reactionmissed": { prompt: "midi-qol.reactionFlavorMiss", triggerLabel: "isMissed" },
	"reactioncritical": { prompt: "midi-qol.reactionFlavorCrit", triggerLabel: "isCrit" },
	"reactionfumble": { prompt: "midi-qol.reactionFlavorFumble", triggerLabel: "isFumble" },
	"reactionheal": { prompt: "midi-qol.reactionFlavorHeal", triggerLabel: "isHealed" },
	"reactiondamage": { prompt: "midi-qol.reactionFlavorDamage", triggerLabel: "isDamaged" },
	"reactionattacked": { prompt: "midi-qol.reactionFlavorAttacked", triggerLabel: "isAttacked" },
	"reactionpreattack": { prompt: "midi-qol.reactionFlavorPreAttack", triggerLabel: "preAttack" },
	"reactionsave": { prompt: "midi-qol.reactionFlavorSave", triggerLabel: "isSave" },
	"reactionsavefail": { prompt: "midi-qol.reactionFlavorSaveFail", triggerLabel: "isSaveFail" },
	"reactionsavesuccess": { prompt: "midi-qol.reactionFlavorSaveSuccess", triggerLabel: "isSaveSuccess" },
	"reactionmoved": { prompt: "midi-qol.reactionFlavorMoved", triggerLabel: "isMoved" }
};
export function reactionPromptFor(triggerType) {
	if (reactionTypes[triggerType])
		return reactionTypes[triggerType].prompt;
	return "midi-qol.reactionFlavorAttack";
}
export function reactionTriggerLabelFor(triggerType) {
	if (reactionTypes[triggerType])
		return reactionTypes[triggerType].triggerLabel;
	return "reactionHit";
}
export async function doReactions(targetRef, triggerTokenUuid, attackRoll, triggerType, options = {}) {
	const target = getToken(targetRef);
	try {
		const noResult = { name: undefined, uuid: undefined, ac: undefined };
		if (!target)
			return noResult;
		//@ts-expect-error attributes
		if (!target.actor || !target.actor.flags)
			return noResult;
		if (checkRule("incapacitated")) {
			try {
				enableNotifications(false);
				if (checkIncapacitated(target, debugEnabled > 0))
					return noResult;
			}
			finally {
				enableNotifications(true);
			}
		}
		let player = playerFor(getTokenDocument(target));
		const usedReaction = hasUsedReaction(target.actor);
		const reactionSetting = getReactionSetting(player);
		if (getReactionSetting(player) === "none")
			return noResult;
		if (!player || !player.active)
			player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
		if (!player)
			return noResult;
		const maxLevel = maxCastLevel(target.actor);
		enableNotifications(false);
		let reactions = [];
		let reactionCount = 0;
		let reactionItemList = [];
		try {
			let possibleReactions = target.actor.items.filter(item => itemReaction(item, triggerType, maxLevel, usedReaction));
			if (getReactionSetting(player) === "allMI" && !usedReaction) {
				possibleReactions = possibleReactions.concat(await getMagicItemReactions(target.actor, triggerType));
			}
			reactions = possibleReactions.filter(item => {
				const theItem = item instanceof Item ? item : item.baseItem;
				const reactionCondition = foundry.utils.getProperty(theItem ?? {}, "flags.midi-qol.reactionCondition");
				if (reactionCondition) {
					if (debugEnabled > 0)
						warn(`for ${target.actor?.name} ${theItem.name} using condition ${reactionCondition}`);
					const returnvalue = evalReactionActivationCondition(options.workflow, reactionCondition, target, { extraData: { reaction: reactionTriggerLabelFor(triggerType) } });
					return returnvalue;
				}
				else {
					if (debugEnabled > 0)
						warn(`for ${target.actor?.name} ${theItem.name} using ${triggerType} filter`);
					//@ts-expect-error .system
					return theItem.system.activation?.type === triggerType || (triggerType === "reactionhit" && theItem.system.activation?.type === "reaction");
				}
			});
			if (debugEnabled > 0)
				warn(`doReactions ${triggerType} for ${target.actor?.name} ${target.name}`, reactions, possibleReactions);
			reactionItemList = reactions.map(item => {
				if (item instanceof Item)
					return item.uuid;
				return { "itemName": item.itemName, itemId: item.itemId, "actionName": item.actionName, "img": item.img, "id": item.id, "uuid": item.uuid };
			});
		}
		catch (err) {
			const message = `midi-qol | fetching reactions`;
			TroubleShooter.recordError(err, message);
		}
		finally {
			enableNotifications(true);
		}
		// TODO Check this for magic items if that makes it to v10
		if (await asyncHooksCall("midi-qol.ReactionFilter", reactions, options, triggerType, reactionItemList) === false) {
			console.warn("midi-qol | Reaction processing cancelled by Hook");
			return { name: "Filter", ac: 0, uuid: undefined };
		}
		reactionCount = reactionItemList?.length ?? 0;
		if (!usedReaction) {
			//@ts-expect-error .flags
			const midiFlags = target.actor.flags["midi-qol"];
			reactionCount = reactionCount + Object.keys(midiFlags?.optional ?? [])
				.filter(flag => {
				if (triggerType !== "reaction" || !midiFlags?.optional[flag].ac)
					return false;
				if (!midiFlags?.optional[flag].count)
					return true;
				return getOptionalCountRemainingShortFlag(target.actor, flag) > 0;
			}).length;
		}
		if (reactionCount <= 0)
			return noResult;
		let chatMessage;
		const reactionFlavor = game.i18n.format(reactionPromptFor(triggerType), { itemName: (options.item?.name ?? "unknown"), actorName: target.name });
		const chatData = {
			content: reactionFlavor,
			whisper: [player]
		};
		const workflow = options.workflow ?? Workflow.getWorkflow(options?.item?.uuid);
		if (configSettings.showReactionChatMessage) {
			const player = playerFor(target.document)?.id ?? "";
			if (configSettings.enableddbGL && installedModules.get("ddb-game-log")) {
				if (workflow?.flagTags)
					chatData.flags = workflow.flagTags;
			}
			chatMessage = await ChatMessage.create(chatData);
		}
		const rollOptions = geti18nOptions("ShowReactionAttackRollOptions");
		// {"none": "Attack Hit", "d20": "d20 roll only", "d20Crit": "d20 + Critical", "all": "Whole Attack Roll"},
		let content = reactionFlavor;
		if (["isHit", "isMissed", "isCrit", "isFumble", "isDamaged", "isAttacked"].includes(reactionTriggerLabelFor(triggerType))) {
			switch (configSettings.showReactionAttackRoll) {
				case "all":
					content = `<h4>${reactionFlavor} - ${rollOptions.all} ${attackRoll?.total ?? ""}</h4>`;
					break;
				case "allCrit":
					//@ts-expect-error
					const criticalString = attackRoll?.isCritical ? `<span style="color: green">(${i18n("DND5E.Critical")})</span>` : "";
					content = `<h4>${reactionFlavor} - ${rollOptions.all} ${attackRoll?.total ?? ""} ${criticalString}</h4>`;
					break;
				case "d20":
					//@ts-expect-error
					const theRoll = attackRoll?.terms[0]?.results ? attackRoll.terms[0].results[0].result : attackRoll?.terms[0]?.total ? attackRoll.terms[0].total : "";
					content = `<h4>${reactionFlavor} ${rollOptions.d20} ${theRoll}</h4>`;
					break;
				default:
					content = reactionFlavor;
			}
		}
		let result = await new Promise((resolve) => {
			// set a timeout for taking over the roll
			const timeoutId = setTimeout(() => {
				resolve(noResult);
			}, (configSettings.reactionTimeout ?? defaultTimeout) * 1000 * 2);
			// Compiler does not realise player can't be undefined to get here
			player && requestReactions(target, player, triggerTokenUuid, content, triggerType, reactionItemList, resolve, chatMessage, options).then((result) => {
				clearTimeout(timeoutId);
			});
		});
		if (result?.name) {
			let count = 100;
			do {
				await busyWait(0.05); // allow pending transactions to complete
				count -= 1;
			} while (globalThis.DAE.actionQueue.remaining && count);
			//@ts-expect-error
			target.actor._initialize();
			workflow?.actor._initialize();
			// targetActor.prepareData(); // allow for any items applied to the actor - like shield spell
		}
		return result;
	}
	catch (err) {
		const message = `doReactions error ${triggerType} for ${target?.name} ${triggerTokenUuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
export async function requestReactions(target, player, triggerTokenUuid, reactionFlavor, triggerType, reactionItemList, resolve, chatPromptMessage, options = {}) {
	try {
		const startTime = Date.now();
		if (options.item && options.item instanceof CONFIG.Item.documentClass) {
			options.itemUuid = options.item.uuid;
			delete options.item;
		}
		;
		/* TODO come back and look at this - adds 80k to the message.
		if (options.workflow && options.workflow instanceof Workflow)
		options.workflow = options.workflow.macroDataToObject(options.workflow.getMacroDataObject());
		*/
		if (options.workflow)
			delete options.workflow;
		let result;
		if (player.isGM) {
			result = await untimedExecuteAsGM("chooseReactions", {
				tokenUuid: target.document?.uuid ?? target.uuid,
				reactionFlavor,
				triggerTokenUuid,
				triggerType,
				options,
				reactionItemList
			});
		}
		else {
			result = await socketlibSocket.executeAsUser("chooseReactions", player.id, {
				tokenUuid: target.document?.uuid ?? target.uuid,
				reactionFlavor,
				triggerTokenUuid,
				triggerType,
				options,
				reactionItemList
			});
		}
		const endTime = Date.now();
		if (debugEnabled > 0)
			warn("requestReactions | returned after ", endTime - startTime, result);
		resolve(result);
		if (chatPromptMessage)
			chatPromptMessage.delete();
	}
	catch (err) {
		const message = `requestReactions | error ${triggerType} for ${target?.name} ${triggerTokenUuid}`;
		TroubleShooter.recordError(err, message);
		error(message, err);
		throw err;
	}
}
export async function promptReactions(tokenUuid, reactionItemList, triggerTokenUuid, reactionFlavor, triggerType, options = {}) {
	try {
		const startTime = Date.now();
		const target = MQfromUuid(tokenUuid);
		const actor = target.actor;
		let player = playerFor(getTokenDocument(target));
		if (!actor)
			return;
		const usedReaction = hasUsedReaction(actor);
		// if ( usedReaction && needsReactionCheck(actor)) return false;
		const midiFlags = foundry.utils.getProperty(actor ?? {}, "flags.midi-qol");
		let result;
		let reactionItems = [];
		const maxLevel = maxCastLevel(target.actor);
		enableNotifications(false);
		let reactions;
		let reactionCount = 0;
		try {
			enableNotifications(false);
			for (let ref of reactionItemList) {
				if (typeof ref === "string")
					reactionItems.push(await fromUuid(ref));
				else
					reactionItems.push(ref);
			}
			;
		}
		finally {
			enableNotifications(true);
		}
		if (reactionItems.length > 0) {
			if (await asyncHooksCall("midi-qol.ReactionFilter", reactionItems, options, triggerType, reactionItemList) === false) {
				console.warn("midi-qol | Reaction processing cancelled by Hook");
				return { name: "Filter" };
			}
			result = await reactionDialog(actor, triggerTokenUuid, reactionItems, reactionFlavor, triggerType, options);
			const endTime = Date.now();
			if (debugEnabled > 0)
				warn("promptReactions | reaction processing returned after ", endTime - startTime, result);
			if (result.uuid)
				return result; //TODO look at multiple choices here
		}
		if (usedReaction)
			return { name: "None" };
		if (!midiFlags)
			return { name: "None" };
		const bonusFlags = Object.keys(midiFlags?.optional ?? {})
			.filter(flag => {
			if (!midiFlags.optional[flag].ac)
				return false;
			if (!midiFlags.optional[flag].count)
				return true;
			return getOptionalCountRemainingShortFlag(actor, flag) > 0;
		}).map(flag => `flags.midi-qol.optional.${flag}`);
		if (bonusFlags.length > 0 && triggerType === "reaction") {
			//@ts-expect-error attributes
			let acRoll = await new Roll(`${actor.system.attributes.ac.value}`).roll();
			const data = {
				actor,
				roll: acRoll,
				rollHTML: reactionFlavor,
				rollTotal: acRoll.total,
			};
			//@ts-expect-error attributes
			const newAC = await bonusDialog.bind(data)(bonusFlags, "ac", true, `${actor.name} - ${i18n("DND5E.AC")} ${actor.system.attributes.ac.value}`, acRoll, "roll");
			const endTime = Date.now();
			if (debugEnabled > 0)
				warn("promptReactions | returned via bonus dialog ", endTime - startTime);
			return { name: actor.name, uuid: actor.uuid, ac: newAC.total };
		}
		const endTime = Date.now();
		if (debugEnabled > 0)
			warn("promptReactions | returned no result ", endTime - startTime);
		return { name: "None" };
	}
	catch (err) {
		const message = `promptReactions ${tokenUuid} ${triggerType} ${reactionItemList}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
export function playerFor(target) {
	return playerForActor(target?.actor); // just here for syntax checker
}
export function playerForActor(actor) {
	if (!actor)
		return undefined;
	let user;
	//@ts-expect-error DOCUMENT_PERMISSION_LEVELS
	const OWNERSHIP_LEVELS = foundry.utils.isNewerVersion(game.data.version, "12.0") ? CONST.DOCUMENT_OWNERSHIP_LEVELS : CONST.DOCUMENT_PERMISSION_LEVELS;
	//@ts-expect-error ownership v10
	const ownwership = actor.ownership;
	// find an active user whose character is the actor
	if (actor.hasPlayerOwner)
		user = game.users?.find(u => u.character?.id === actor?.id && u.active);
	if (!user) // no controller - find the first owner who is active
		user = game.users?.players.find(p => p.active && ownwership[p.id ?? ""] === OWNERSHIP_LEVELS.OWNER);
	if (!user) // find a non-active owner
		user = game.users?.players.find(p => p.character?.id === actor?.id);
	if (!user) // no controlled - find an owner that is not active
		user = game.users?.players.find(p => ownwership[p.id ?? ""] === OWNERSHIP_LEVELS.OWNER);
	if (!user && ownwership.default === OWNERSHIP_LEVELS.OWNER) {
		// does anyone have default owner permission who is active
		user = game.users?.players.find(p => p.active && ownwership[p.id] === OWNERSHIP_LEVELS.INHERIT);
	}
	// if all else fails it's an active gm.
	//@ts-expect-error activeGM
	if (!user)
		user = game.users?.activeGM;
	return user;
}
//@ts-expect-error dnd5e v10
export async function reactionDialog(actor, triggerTokenUuid, reactionItems, rollFlavor, triggerType, options = { timeout }) {
	const noResult = { name: "None" };
	try {
		let timeout = (options.timeout ?? configSettings.reactionTimeout ?? defaultTimeout);
		return new Promise((resolve, reject) => {
			let timeoutId = setTimeout(() => {
				dialog.close();
				resolve({});
			}, timeout * 1000);
			const callback = async function (dialog, button) {
				clearTimeout(timeoutId);
				const item = reactionItems.find(i => i.id === button.key);
				if (item) {
					// await setReactionUsed(actor);
					// No need to set reaction effect since using item will do so.
					dialog.close();
					// options = foundry.utils.mergeObject(options.workflowOptions ?? {}, {triggerTokenUuid, checkGMStatus: false}, {overwrite: true});
					const itemRollOptions = foundry.utils.mergeObject(options, {
						systemCard: false,
						createWorkflow: true,
						versatile: false,
						configureDialog: true,
						checkGMStatus: false,
						targetUuids: [triggerTokenUuid],
						isReaction: true,
						workflowOptions: { targetConfirmation: "none" }
					});
					let useTimeoutId = setTimeout(() => {
						clearTimeout(useTimeoutId);
						resolve({});
					}, ((timeout) - 1) * 1000);
					let result = noResult;
					clearTimeout(useTimeoutId);
					if (item instanceof Item) { // a nomral item}
						result = await completeItemUse(item, {}, itemRollOptions);
						if (!result?.preItemUseComplete)
							resolve(noResult);
						else
							resolve({ name: item?.name, uuid: item?.uuid });
					}
					else { // assume it is a magic item item
						//@ts-expect-error
						const api = game.modules.get("magicitems")?.api ?? game.modules.get("magic-items-2")?.api;
						if (api) {
							const magicItemActor = await api?.actor(actor);
							if (magicItemActor) {
								// export type ReactionItemReference = { itemName: string, itemId: string, actionName: string, img: string, id: string, uuid: string } | string;
								const magicItem = magicItemActor.items.find(i => i.id === item.itemId);
								await completeItemUse({ magicItem, id: item.id }, {}, itemRollOptions);
								resolve({ name: item?.itemName, uuid: item?.uuid });
							}
							resolve({ name: item?.itemName, uuid: item?.uuid });
						}
						else
							resolve(noResult);
					}
				}
				// actor.reset();
				resolve(noResult);
			};
			const noReaction = async function (dialog, button) {
				clearTimeout(timeoutId);
				resolve(noResult);
			};
			const dialog = new ReactionDialog({
				actor,
				targetObject: this,
				title: `${actor.name}`,
				items: reactionItems,
				content: rollFlavor,
				callback,
				close: noReaction,
				timeout
			}, {
				width: 400
			});
			dialog.render(true);
		});
	}
	catch (err) {
		const message = `reaactionDialog error ${actor?.name} ${actor?.uuid} ${triggerTokenUuid}`;
		TroubleShooter.recordError(err, message);
		throw err;
	}
}
class ReactionDialog extends Application {
	constructor(data, options) {
		super(options);
		this.timeRemaining = data.timeout;
		this.startTime = Date.now();
		this.data = data;
		this.data.completed = false;
	}
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			template: "modules/midi-qol/templates/dialog.html",
			classes: ["dialog"],
			width: 150,
			height: "auto",
			jQuery: true
		});
	}
	get title() {
		let maxPad = 45;
		if (this.data.timeout) {
			if (this.data.timeout < maxPad)
				maxPad = this.data.timeout;
			const padCount = Math.ceil(this.timeRemaining / (this.data.timeout ?? defaultTimeout) * maxPad);
			const pad = "-".repeat(padCount);
			return `${this.data.title ?? "Dialog"} ${pad} ${this.timeRemaining}`;
		}
		else
			return this.data.title ?? "Dialog";
	}
	getData(options) {
		this.data.buttons = this.data.items.reduce((acc, item) => {
			acc[foundry.utils.randomID()] = {
				// icon: `<image src=${item.img} width="30" height="30">`,
				label: `<div style="display: flex; align-items: center; margin: 5px;"> <image src=${item.img} width="40" height="40"> &nbsp ${item.name ?? item.actionName} </div>`,
				value: item.name ?? item.actionName,
				key: item.id,
				callback: this.data.callback,
			};
			return acc;
		}, {});
		return {
			content: this.data.content,
			buttons: this.data.buttons,
			timeRemaining: this.timeRemaining
		};
	}
	set1Secondtimeout() {
		//@ts-expect-error typeof setTimeout
		this.timeoutId = setTimeout(() => {
			this.timeRemaining -= 1;
			this.render(false);
			if (this.timeRemaining > 0)
				this.set1Secondtimeout();
		}, 1000);
	}
	async render(force = false, options = {}) {
		if (!this.timeoutId)
			this.set1Secondtimeout();
		const result = await super.render(force, options);
		const element = this.element;
		const title = element.find(".window-title")[0];
		if (!title)
			return result;
		let color = "red";
		if (this.timeRemaining >= this.data.timeout * 0.75)
			color = "chartreuse";
		else if (this.timeRemaining >= this.data.timeout * 0.50)
			color = "yellow";
		else if (this.timeRemaining >= this.data.timeout * 0.25)
			color = "orange";
		title.style.color = color;
		return result;
	}
	activateListeners(html) {
		html.find(".dialog-button").click(this._onClickButton.bind(this));
		$(document).on('keydown.chooseDefault', this._onKeyDown.bind(this));
		// if ( this.data.render instanceof Function ) this.data.render(this.options.jQuery ? html : html[0]);
	}
	_onClickButton(event) {
		const id = event.currentTarget.dataset.button;
		const button = this.data.buttons[id];
		debug("Reaction dialog button clicked", id, button, Date.now() - this.startTime);
		this.submit(button);
	}
	_onKeyDown(event) {
		// Close dialog
		if (event.key === "Escape" || event.key === "Enter") {
			debug("Reaction Dialog onKeyDown esc/enter pressed", event.key, Date.now() - this.startTime);
			event.preventDefault();
			event.stopPropagation();
			this.data.completed = true;
			if (this.data.close)
				this.data.close({ name: "keydown", uuid: undefined });
			this.close();
		}
	}
	async submit(button) {
		try {
			clearTimeout(this.timeoutId);
			debug("ReactionDialog submit", Date.now() - this.startTime, button.callback);
			if (button.callback) {
				this.data.completed = true;
				await button.callback(this, button);
				this.close();
			}
		}
		catch (err) {
			const message = `Reaction dialog submit`;
			TroubleShooter.recordError(err, message);
			ui.notifications?.error(err);
			error(err);
			this.data.completed = false;
			this.close();
		}
	}
	async close() {
		clearTimeout(this.timeoutId);
		debug("Reaction Dialog close ", Date.now() - this.startTime, this.data.completed);
		if (!this.data.completed && this.data.close) {
			this.data.close({ name: "Close", uuid: undefined });
		}
		$(document).off('keydown.chooseDefault');
		return super.close();
	}
}
export function reportMidiCriticalFlags() {
	let report = [];
	if (game?.actors)
		for (let a of game.actors) {
			for (let item of a.items.contents) {
				if (!["", "20", 20].includes((foundry.utils.getProperty(item, "flags.midi-qol.criticalThreshold") || ""))) {
					report.push(`Actor ${a.name}'s Item ${item.name} has midi critical flag set ${foundry.utils.getProperty(item, "flags.midi-qol.criticalThreshold")}`);
				}
			}
		}
	if (game?.scenes)
		for (let scene of game.scenes) {
			for (let tokenDocument of scene.tokens) { // TODO check this v10
				if (tokenDocument.actor)
					for (let item of tokenDocument.actor.items.contents) {
						if (!tokenDocument.isLinked && !["", "20", 20].includes((foundry.utils.getProperty(item, "flags.midi-qol.criticalThreshold") || ""))) {
							report.push(`Scene ${scene.name}, Token Name ${tokenDocument.name}, Actor Name ${tokenDocument.actor.name}, Item ${item.name} has midi critical flag set ${foundry.utils.getProperty(item, "flags.midi-qol.criticalThreshold")}`);
						}
					}
			}
		}
	console.log("Items with midi critical flags set are\n", ...(report.map(s => s + "\n")));
}
export function getConcentrationLabel() {
	let concentrationLabel = i18n("midi-qol.Concentrating");
	//@ts-expect-error
	const concentrationId = CONFIG.specialStatusEffects.CONCENTRATION;
	const se = CONFIG.statusEffects.find(se => se.id === concentrationId);
	//@ts-expect-error
	if (se)
		concentrationLabel = se.name;
	// for condition-lab-trigger there is no module specific way to specify the concentration effect so just use the label
	return concentrationLabel;
}
/**
*
* @param actor the actor to check
* @returns the concentration effect if present and null otherwise
*/
export function getConcentrationEffect(actor) {
	// concentration should not be a passive effect so don't need to do applied effects
	return actor?.effects.find(ef => ef.statuses.has(systemConcentrationId));
}
async function asyncMySafeEval(expression, sandbox, onErrorReturn = undefined) {
	let result;
	try {
		const src = 'with (sandbox) { return ' + expression + '}';
		//@ts-expect-error
		let AsyncFunction = foundry.utils.AsyncFunction;
		if (!AsyncFunction)
			AsyncFunction = (async function () { }).constructor;
		const evl = AsyncFunction("sandbox", src);
		//@ts-expect-error
		sandbox = foundry.utils.mergeObject(sandbox, { Roll, findNearby, checkNearby, hasCondition, checkDefeated, checkIncapacitated, canSee, canSense, getDistance, computeDistance: getDistance, checkRange, checkDistance, fromUuidSync });
		const sandboxProxy = new Proxy(sandbox, {
			has: () => true,
			get: (t, k) => k === Symbol.unscopables ? undefined : (t[k] ?? Math[k]),
			//@ts-expect-error
			set: () => console.error("midi-qol | asnycMySafeEval | You may not set properties of the sandbox environment") // No-op
		});
		result = await evl.call(null, sandboxProxy);
	}
	catch (err) {
		const message = `midi-qol | asyncMySafeEval | expression evaluation failed ${expression}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
		result = onErrorReturn;
	}
	if (Number.isNumeric(result))
		return Number(result);
	return result;
}
;
function mySafeEval(expression, sandbox, onErrorReturn = undefined) {
	let result;
	try {
		const src = 'with (sandbox) { return ' + expression + '}';
		if (expression.includes("Roll(")) {
			//@ts-expect-error
			if (game.release.generation > 11) {
				error("safeEval | Roll expressions are not supported in v12", expression);
				expression.replaceAll(/evaluate\s*\({\s*async:\s* false\s*}\)/g, "evaluateSync({strict: false})");
				error("Expression replaced with ", expression);
			}
			else {
				const newExpression = expression.replaceAll(/evaluate\s*\({\s*async:\s* false\s*}\)/g, "evaluateSync({strict: false})");
				console.warn(`%c safeEval | Roll expressions ${expression} are not supported in v12 and will be replaced with ${newExpression}`, "color:red;");
			}
		}
		const evl = new Function('sandbox', src);
		//@ts-expect-error
		sandbox = foundry.utils.mergeObject(sandbox, { Roll, findNearby, checkNearby, hasCondition, checkDefeated, checkIncapacitated, canSee, canSense, getDistance, computeDistance: getDistance, checkRange, checkDistance, fromUuidSync });
		const sandboxProxy = new Proxy(sandbox, {
			has: () => true,
			get: (t, k) => k === Symbol.unscopables ? undefined : (t[k] ?? Math[k]),
			//@ts-expect-error
			set: () => console.error("midi-qol | mySafeEval | You may not set properties of the sandbox environment") // No-op
		});
		result = evl(sandboxProxy);
	}
	catch (err) {
		const message = `midi-qol | mySafeEval | expression evaluation failed ${expression}`;
		console.warn(message, err);
		TroubleShooter.recordError(err, message);
		result = onErrorReturn;
	}
	if (Number.isNumeric(result))
		return Number(result);
	return result;
}
;
export function evalReactionActivationCondition(workflow, condition, target, options = {}) {
	if (options.errorReturn === undefined)
		options.errorReturn = false;
	return evalActivationCondition(workflow, condition, target, options);
}
export function evalActivationCondition(workflow, condition, target, options = {}) {
	if (condition === undefined || condition === "" || condition === true)
		return true;
	if (condition === false)
		return false;
	createConditionData({ workflow, target, actor: workflow.actor, extraData: options?.extraData, item: options.item });
	options.errorReturn ?? (options.errorReturn = true);
	const returnValue = evalCondition(condition, workflow.conditionData, options);
	return returnValue;
}
export function typeOrRace(entity) {
	const actor = getActor(entity);
	//@ts-expect-error .system
	const systemData = actor?.system;
	if (!systemData)
		return "";
	if (systemData.details.type?.value)
		return systemData.details.type?.value?.toLocaleLowerCase() ?? "";
	// cater to dnd5e 2.4+ where race can be a string or an Item
	else
		return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? "";
}
export function raceOrType(entity) {
	const actor = getActor(entity);
	//@ts-expect-error .system
	const systemData = actor?.system;
	if (!systemData)
		return "";
	if (systemData.details.race)
		return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? "";
	return systemData.details.type?.value?.toLocaleLowerCase() ?? "";
}
export function effectActivationConditionToUse(workflow) {
	return foundry.utils.getProperty(this, "flags.midi-qol.effectCondition");
}
export function createConditionData(data) {
	const actor = data.workflow?.actor ?? data.actor;
	let item;
	if (data.item) {
		if (data.item instanceof Item)
			item = data.item;
		else if (typeof data.item === "string")
			//@ts-expect-error
			item = fromUuidSync(data.item);
	}
	if (!item)
		item = data.workflow?.item;
	let rollData = data.workflow?.otherDamageItem?.getRollData() ?? item?.getRollData() ?? actor?.getRollData() ?? {};
	rollData = foundry.utils.mergeObject(rollData, data.extraData ?? {});
	rollData.isAttuned = rollData.item?.attunement !== GameSystemConfig.attunementTypes.REQUIRED;
	try {
		if (data.target) {
			rollData.target = data.target.actor?.getRollData();
			if (data.target instanceof Token)
				rollData.targetUuid = data.target.document.uuid;
			else
				rollData.targetUuid = data.target.uuid;
			rollData.targetId = data.target.id;
			rollData.targetActorUuid = data.target.actor?.uuid;
			rollData.targetActorId = data.target.actor?.id;
			rollData.raceOrType = data.target.actor ? raceOrType(data.target.actor) : "";
			rollData.typeOrRace = data.target.actor ? typeOrRace(data.target.actor) : "";
			rollData.target.saved = data.workflow?.saves.has(data.target);
			rollData.target.failedSave = data.workflow?.failedSaves.has(data.target);
			rollData.target.superSaver = data.workflow?.superSavers.has(data.target);
			rollData.semiSuperSaver = data.workflow?.semiSuperSavers.has(data.target);
			rollData.target.isHit = data.workflow?.hitTargets.has(data.target);
			rollData.target.isHitEC = data.workflow?.hitTargets.has(data.target);
		}
		rollData.humanoid = globalThis.MidiQOL.humanoid;
		rollData.tokenUuid = data.workflow?.tokenUuid;
		rollData.tokenId = data.workflow?.tokenId;
		rollData.workflow = {};
		rollData.effects = actor?.appliedEffects; // not needed since this is set in getRollData
		if (data.workflow) {
			rollData.w = data.workflow;
			Object.assign(rollData.workflow, data.workflow);
			rollData.workflow.otherDamageItem = data.workflow.otherDamageItem?.getRollData().item;
			rollData.workflow.hasSave = data.workflow.hasSave;
			rollData.workflow.saveItem = data.workflow.saveItem?.getRollData().item;
			rollData.workflow.otherDamageFormula = data.workflow.otherDamageFormula;
			rollData.workflow.shouldRollDamage = data.workflow.shouldRollDamage;
			rollData.workflow.hasAttack = data.workflow.item.hasAttack;
			rollData.workflow.hasDamage = data.workflow.item.hasDamage;
			delete rollData.workflow.undoData;
			delete rollData.workflow.conditionData;
		}
		if (data.workflow?.actor)
			rollData.workflow.actor = data.workflow.actor.getRollData();
		if (data.workflow?.item)
			rollData.workflow.item = data.workflow.item.getRollData()?.item;
		rollData.CONFIG = CONFIG;
		rollData.CONST = CONST;
	}
	catch (err) {
		const message = `midi-qol | createConditionData`;
		TroubleShooter.recordError(err, message);
		console.warn(message, err);
	}
	finally {
		if (data.workflow)
			data.workflow.conditionData = rollData;
	}
	return rollData;
}
export async function evalAllConditionsAsync(actorRef, flag, conditionData, errorReturn = false) {
	if (!flag)
		return errorReturn;
	let actor = getActor(actorRef);
	if (!actor)
		return errorReturn;
	//@ts-expect-error .applyActiveEffects
	const effects = actor.appliedEffects.filter(ef => ef.changes.some(change => change.key === flag));
	let keyToUse = flag.replace("flags.midi-qol.", "flags.midi.evaluated.");
	keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
	let returnValue = errorReturn;
	foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
	foundry.utils.setProperty(actor, `${keyToUse}.effects`, []);
	for (let effect of effects) {
		for (let change of effect.changes) {
			if (change.key === flag) {
				const condValue = await evalCondition(change.value, conditionData, { errorReturn, async: true });
				if (debugEnabled > 0)
					warn("evalAllConditions Async", actor.name, flag, change.value, condValue, conditionData, errorReturn);
				if (condValue) {
					returnValue = condValue;
					foundry.utils.setProperty(actor, `${keyToUse}.value`, condValue);
					foundry.utils.getProperty(actor, `${keyToUse}.effects`).push(effect.name);
				}
			}
		}
	}
	if (effects.length === 0 && foundry.utils.getProperty(actor, flag)) {
		returnValue = await evalCondition(foundry.utils.getProperty(actor, flag), conditionData, { errorReturn, async: true });
		if (returnValue) {
			foundry.utils.setProperty(actor, `${keyToUse}.value`, returnValue);
			foundry.utils.getProperty(actor, `${keyToUse}.effects`).push("flag");
		}
	}
	return returnValue;
}
export function evalAllConditions(actorRef, flag, conditionData, errorReturn = false) {
	if (!flag)
		return errorReturn;
	let actor = getActor(actorRef);
	if (!actor)
		return errorReturn;
	//@ts-expect-error .applyActiveEffects
	const effects = actor.appliedEffects.filter(ef => ef.changes.some(change => change.key === flag));
	let keyToUse = flag.replace("flags.midi-qol.", "flags.midi.evaluated.");
	keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
	let returnValue = errorReturn;
	foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
	foundry.utils.setProperty(actor, `${keyToUse}.effects`, []);
	for (let effect of effects) {
		for (let change of effect.changes) {
			if (change.key === flag) {
				const condValue = evalCondition(change.value, conditionData, { errorReturn, async: false });
				if (debugEnabled > 0)
					warn("evalAllConditions ", actor.name, flag, change.value, condValue, conditionData, errorReturn);
				if (condValue) {
					returnValue = condValue;
					foundry.utils.setProperty(actor, `${keyToUse}.value`, condValue);
					foundry.utils.getProperty(actor, `${keyToUse}.effects`).push(effect.name);
				}
			}
		}
	}
	if (effects.length === 0 && foundry.utils.getProperty(actor, flag)) {
		returnValue = evalCondition(foundry.utils.getProperty(actor, flag), conditionData, { errorReturn, async: false });
		if (returnValue) {
			foundry.utils.setProperty(actor, `${keyToUse}.value`, returnValue);
			foundry.utils.getProperty(actor, `${keyToUse}.effects`).push("flag");
		}
	}
	return returnValue;
}
export function evalCondition(condition, conditionData, options = { errorReturn: false, async: false }) {
	if (typeof condition === "number" || typeof condition === "boolean")
		return condition;
	if (condition === undefined || condition === "" || typeof condition !== "string")
		return options.errorReturn ?? false;
	let returnValue;
	try {
		if (condition.includes("@")) {
			condition = Roll.replaceFormulaData(condition, conditionData, { missing: "0" });
		}
		if (options.async)
			returnValue = asyncMySafeEval(condition, conditionData, options.errorReturn);
		else
			returnValue = mySafeEval(condition, conditionData, options.errorReturn ?? false);
		if (debugEnabled > 0)
			warn("evalCondition ", returnValue, condition, conditionData);
	}
	catch (err) {
		returnValue = options.errorReturn ?? false;
		const message = `midi-qol | evalCondition | activation condition (${condition}) error `;
		TroubleShooter.recordError(err, message);
		console.warn(message, err, conditionData);
	}
	return returnValue;
}
export function computeTemplateShapeDistance(templateDocument) {
	//@ts-expect-error direction etc v10
	let { x, y, direction, distance } = templateDocument;
	// let { direction, distance, angle, width } = templateDocument;
	if (!canvas || !canvas.scene)
		return { shape: "none", distance: 0 };
	//@ts-expect-error distancePixels
	distance *= canvas.dimensions?.distancePixels;
	direction = Math.toRadians(direction);
	if (!templateDocument.object) {
		throw new Error("Template document has no object");
	}
	//@ts-expect-error
	templateDocument.object.ray = Ray.fromAngle(x, y, direction, distance);
	let shape;
	//@ts-expect-error ._computeShape
	templateDocument.object.shape = templateDocument.object._computeShape();
	//@ts-expect-error distance v10
	return { shape: templateDocument.object.shape, distance: templateDocument.distance };
}
var _enableNotifications = true;
export function notificationNotify(wrapped, ...args) {
	if (_enableNotifications)
		return wrapped(...args);
	return;
}
export function enableNotifications(enable) {
	_enableNotifications = enable;
}
export function getStatusName(statusId) {
	if (!statusId)
		return "undefined";
	const se = CONFIG.statusEffects.find(efData => efData.id === statusId);
	//@ts-expect-error se.name
	return i18n(se?.name ?? se?.label ?? statusId);
}
export function getWoundedStatus() {
	return CONFIG.statusEffects.find(efData => efData.id === configSettings.midiWoundedCondition);
}
export function getUnconsciousStatus() {
	return CONFIG.statusEffects.find(efData => efData.id === configSettings.midiUnconsciousCondition);
}
export function getDeadStatus() {
	return CONFIG.statusEffects.find(efData => efData.id === configSettings.midiDeadCondition);
}
export async function ConvenientEffectsHasEffect(effectName, actor, ignoreInactive = true) {
	if (ignoreInactive) {
		//@ts-expect-error .dfreds
		return game.dfreds?.effectInterface?.hasEffectApplied(effectName, actor.uuid);
	}
	else {
		//@ts-expect-error
		return actor.appliedEffects.find(ef => ef.name === effectName) !== undefined;
	}
}
export function isInCombat(actor) {
	const actorUuid = actor.uuid;
	let combats;
	if (actorUuid.startsWith("Scene")) { // actor is a token synthetic actor
		const tokenId = actorUuid.split(".")[3];
		combats = game.combats?.combats.filter(combat => 
		//@ts-expect-error .tokenId v10
		combat.combatants.filter(combatant => combatant?.tokenId === tokenId).length !== 0);
	}
	else { // actor is not a synthetic actor so can use actor Uuid 
		const actorId = actor.id;
		combats = game.combats?.combats.filter(combat => 
		//@ts-expect-error .actorID v10
		combat.combatants.filter(combatant => combatant?.actorId === actorId).length !== 0);
	}
	return (combats?.length ?? 0) > 0;
}
export async function setActionUsed(actor) {
	await actor.setFlag("midi-qol", "actions.action", true);
}
export async function setReactionUsed(actor) {
	if (!["all", "displayOnly"].includes(configSettings.enforceReactions) && configSettings.enforceReactions !== actor.type)
		return;
	let effect;
	await actor.setFlag("midi-qol", "actions.reactionCombatRound", game.combat?.round);
	await actor.setFlag("midi-qol", "actions.reaction", true);
	const reactionEffect = getReactionEffect();
	if (reactionEffect) {
		//@ts-expect-error .dfreds
		const effectInterface = game.dfreds?.effectInterface;
		await effectInterface?.addEffectWith({ effectData: reactionEffect.toObject(), uuid: actor.uuid });
		//@ts-expect-error se.name
	}
	else if (installedModules.get("condition-lab-triggler") && (effect = CONFIG.statusEffects.find(se => (se.name ?? se.label) === i18n("DND5E.Reaction")))) {
		await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
	}
}
export async function setBonusActionUsed(actor) {
	if (debugEnabled > 0)
		warn("setBonusActionUsed | starting");
	if (!["all", "displayOnly"].includes(configSettings.enforceBonusActions) && configSettings.enforceBonusActions !== actor.type)
		return;
	let effect;
	if (getBonusActionEffect()) {
		//@ts-expect-error
		await game.dfreds?.effectInterface?.addEffect({ effectName: getBonusActionEffect().name, uuid: actor.uuid });
	}
	else 
	//@ts-expect-error
	if (installedModules.get("condition-lab-triggler") && (effect = CONFIG.statusEffects.find(se => (se.name ?? se.label) === i18n("DND5E.BonusAction")))) {
		await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
	}
	await actor.setFlag("midi-qol", "actions.bonusActionCombatRound", game.combat?.round);
	const result = await actor.setFlag("midi-qol", "actions.bonus", true);
	if (debugEnabled > 0)
		warn("setBonusActionUsed | finishing");
	return result;
}
export async function removeActionUsed(actor) {
	if (game.user?.isGM)
		return await actor?.setFlag("midi-qol", "actions.action", false);
	else
		return await untimedExecuteAsGM("_gmSetFlag", { base: "midi-qol", key: "actions.action", value: false, actorUuid: actor.uuid });
}
export async function removeReactionUsed(actor, removeCEEffect = true) {
	let effectRemoved = false;
	const reactionEffect = getReactionEffect();
	if (removeCEEffect && reactionEffect && !effectRemoved) {
		//@ts-expect-error
		if (await game.dfreds?.effectInterface?.hasEffectApplied(reactionEffect.name, actor.uuid)) {
			const effect = actor.effects.getName(reactionEffect?.name ?? "Reaction");
			if (installedModules.get("times-up") && effect && foundry.utils.getProperty(effect, "flags.dae.specialDuration")?.includes("turnStart")) {
				// times up will handle removing this
			}
			//@ts-expect-error
			else
				await game.dfreds.effectInterface?.removeEffect({ effectName: reactionEffect.name, uuid: actor.uuid });
			effectRemoved = true;
		}
	}
	if (installedModules.get("condition-lab-triggler") && !effectRemoved) {
		const effect = actor.effects.find(ef => ef.name === i18n("DND5E.Reaction"));
		if (installedModules.get("times-up") && effect && foundry.utils.getProperty(effect, "flags.dae.specialDuration")?.includes("turnStart")) {
		}
		else
			await effect?.delete(); // reaction always non-transfer
		// times-up will handle removing this
		effectRemoved = true;
	}
	await actor?.unsetFlag("midi-qol", "actions.reactionCombatRound");
	return actor?.setFlag("midi-qol", "actions.reaction", false);
}
export function hasUsedAction(actor) {
	return actor?.getFlag("midi-qol", "actions.action");
}
export function hasUsedReaction(actor) {
	const reactionEffect = getReactionEffect();
	if (reactionEffect) {
		//@ts-expect-error .dfreds
		if (game.dfreds?.effectInterface?.hasEffectApplied(reactionEffect.name, actor.uuid)) {
			return true;
		}
	}
	if (installedModules.get("condition-lab-triggler") && actor.effects.some(ef => ef.name === i18n("DND5E.Reaction"))) {
		return true;
	}
	if (actor.getFlag("midi-qol", "actions.reaction"))
		return true;
	return false;
}
export async function expirePerTurnBonusActions(combat, data, options) {
	const optionalFlagRe = /flags.midi-qol.optional.[^.]+.(count|countAlt)$/;
	for (let combatant of combat.turns) {
		const actor = combatant.actor;
		if (!actor)
			continue;
		//@ts-expect-error .appledEffects
		for (let effect of actor.appliedEffects) {
			for (let change of effect.changes) {
				if (change.key.match(optionalFlagRe)
					&& ((change.value === "each-turn") || (change.value = "each-round" && data.round !== combat.round))) {
					const usedKey = change.key.replace(/.(count|countAlt)$/, ".used");
					const isUsed = foundry.utils.getProperty(actor, usedKey);
					if (isUsed) {
						const key = usedKey.replace("flags.midi-qol.", "");
						//TODO turn this into actor updates instead of each flag
						await untimedExecuteAsGM("_gmUnsetFlag", { actorUuid: actor.uuid, base: "midi-qol", key });
					}
				}
			}
		}
	}
}
export function hasUsedBonusAction(actor) {
	if (getBonusActionEffect()) {
		//@ts-expect-error
		if (game.dfreds?.effectInterface?.hasEffectApplied(getBonusActionEffect().name, actor.uuid)) {
			return true;
		}
	}
	if (installedModules.get("condition-lab-triggler") && actor.effects.some(ef => ef.name === i18n("DND5E.BonusAction"))) {
		return true;
	}
	if (actor.getFlag("midi-qol", "actions.bonus"))
		return true;
	return false;
}
export async function removeBonusActionUsed(actor, removeCEEffect = false) {
	if (removeCEEffect && getBonusActionEffect()) {
		//@ts-expect-error
		if (await game.dfreds?.effectInterface?.hasEffectApplied((getBonusActionEffect().name), actor.uuid)) {
			//@ts-expect-error
			await game.dfreds.effectInterface?.removeEffect({ effectName: (getBonusActionEffect().name), uuid: actor.uuid });
		}
	}
	if (installedModules.get("condition-lab-triggler")) {
		const effect = actor.effects.find(ef => ef.name === i18n("DND5E.BonusAction"));
		await effect?.delete(); // bonus action alays non-transfer
	}
	await actor.setFlag("midi-qol", "actions.bonus", false);
	return actor?.unsetFlag("midi-qol", "actions.bonusActionCombatRound");
}
export function needsReactionCheck(actor) {
	return (configSettings.enforceReactions === "all" || configSettings.enforceReactions === actor.type);
}
export function needsBonusActionCheck(actor) {
	return (configSettings.enforceBonusActions === "all" || configSettings.enforceBonusActions === actor.type);
}
export function mergeKeyboardOptions(options, pressedKeys) {
	if (!pressedKeys)
		return;
	options.advantage = options.advantage || pressedKeys.advantage;
	options.disadvantage = options.disadvantage || pressedKeys.disadvantage;
	options.versatile = options.versatile || pressedKeys.versatile;
	options.other = options.other || pressedKeys.other;
	options.rollToggle = options.rollToggle || pressedKeys.rollToggle;
	options.fastForward = options.fastForward || pressedKeys.fastForward;
	options.fastForwardAbility = options.fastForwardAbility || pressedKeys.fastForwardAbility;
	options.fastForwardDamage = options.fastForwardDamage || pressedKeys.fastForwardDamage;
	options.fastForwardAttack = options.fastForwardAttack || pressedKeys.fastForwardAttack;
	options.parts = options.parts || pressedKeys.parts;
	options.critical = options.critical || pressedKeys.critical;
}
export async function asyncHooksCallAll(hook, ...args) {
	if (CONFIG.debug.hooks) {
		console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
		console.log(args);
	}
	//@ts-expect-error
	const hookEvents = Hooks.events[hook];
	if (debugEnabled > 1)
		debug("asyncHooksCall", hook, "hookEvents:", hookEvents, args);
	if (!hookEvents)
		return undefined;
	if (debugEnabled > 0) {
		warn(`asyncHooksCall calling ${hook}`, hookEvents, args);
	}
	for (let entry of Array.from(hookEvents)) {
		//TODO see if this might be better as a Promises.all - disadvantage is that order is not guaranteed.
		try {
			if (debugEnabled > 1) {
				log(`asyncHooksCall for Hook ${hook} calling`, entry, args);
			}
			await hookCall(entry, args);
		}
		catch (err) {
			const message = `hooked function for hook ${hook}`;
			error(message, err);
			TroubleShooter.recordError(err, message);
		}
	}
	return true;
}
export async function asyncHooksCall(hook, ...args) {
	if (CONFIG.debug.hooks) {
		console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
		console.log(args);
	}
	//@ts-expect-error events
	const hookEvents = Hooks.events[hook];
	if (debugEnabled > 1)
		log("asyncHooksCall", hook, "hookEvents:", hookEvents, args);
	if (!hookEvents)
		return undefined;
	if (debugEnabled > 0) {
		warn(`asyncHooksCall calling ${hook}`, args, hookEvents);
	}
	for (let entry of Array.from(hookEvents)) {
		let callAdditional;
		try {
			if (debugEnabled > 1) {
				log(`asyncHooksCall for Hook ${hook} calling`, entry, args);
			}
			callAdditional = await hookCall(entry, args);
		}
		catch (err) {
			const message = `midi-qol | hooked function for hook ${hook} error`;
			error(message, err, entry);
			TroubleShooter.recordError(err, message);
			callAdditional = true;
		}
		if (callAdditional === false)
			return false;
	}
	return true;
}
function hookCall(entry, args) {
	const { hook, id, fn, once } = entry;
	if (once)
		Hooks.off(hook, id);
	try {
		return entry.fn(...args);
	}
	catch (err) {
		const message = `Error thrown in hooked function '${fn?.name}' for hook '${hook}'`;
		TroubleShooter.recordError(err, message);
		error(`midi | ${message}`);
		//@ts-expect-error Hooks.onError v10
		if (hook !== "error")
			Hooks.onError("Hooks.#call", err, { message, hook, fn, log: "error" });
	}
}
export function addAdvAttribution(roll, advAttribution) {
	// <section class="tooltip-part">
	let advHtml = "";
	if (advAttribution && advAttribution.size > 0) {
		advHtml = Array.from(advAttribution).reduce((prev, s) => prev += `${s}<br>`, "");
		foundry.utils.setProperty(roll, "options.advTooltip", advHtml);
	}
}
function getTooltip(roll, options = {}) {
	const parts = roll.dice?.map(d => d.getTooltipData()) ?? [];
	// parts.tooltipFormula = options?.tooltipFormula ?? false;
	// parts.formula = roll.formula;
	const templateData = {
		advTooltip: roll.options?.advTooltip,
		tooltipFormula: options?.tooltipFormula ?? false,
		formula: roll.formula,
		parts
	};
	return renderTemplate("modules/midi-qol/templates/tooltip.html", templateData);
}
export async function midiRenderRoll(roll) {
	return roll.render();
}
export async function midiRenderAttackRoll(roll, options) {
	options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
	return midiRenderTemplateRoll(roll, "modules/midi-qol/templates/attack-roll.html", options);
}
export async function midiRenderDamageRoll(roll, options) {
	options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
	let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/damage-roll.html", options);
	return html;
}
export function midiRenderOtherDamageRoll(roll, options) {
	options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
	let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/other-damage-roll.html", options);
	return html;
}
export function midiRenderBonusDamageRoll(roll, options) {
	options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
	let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/bonus-damage-roll.html", options);
	return html;
}
export async function midiRenderTemplateRoll(roll, template, options) {
	if (!roll)
		return "";
	const chatData = {
		formula: roll.formula,
		user: game.user?.id,
		tooltip: await getTooltip(roll, options),
		tooltipFormula: options?.tooltipFormula ?? false,
		//@ts-expect-error
		flavor: options?.flavor ?? roll.options?.flavor,
		total: (roll.total !== undefined) ? Math.round((roll.total) * 100) / 100 : "???"
	};
	return renderTemplate(template, chatData);
}
export function heightIntersects(targetDocument /*TokenDocument*/, flankerDocument /*TokenDocument*/) {
	const targetElevation = targetDocument.elevation ?? 0;
	const flankerElevation = flankerDocument.elevation ?? 0;
	const targetTopElevation = targetElevation + Math.max(targetDocument.height, targetDocument.width) * (canvas?.dimensions?.distance ?? 5);
	const flankerTopElevation = flankerElevation + Math.min(flankerDocument.height, flankerDocument.width) * (canvas?.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
	/* This is for requiring the centers to intersect the height range
	Which is an alternative rule possiblity
	const flankerCenter = (flankerElevation + flankerTopElevation) / 2;
	if (flankerCenter >= targetElevation || flankerCenter <= targetTopElevation) return true;
	return false;
	*/
	if (flankerTopElevation < targetElevation || flankerElevation > targetTopElevation)
		return false;
	return true;
}
export function findPotentialFlankers(target) {
	const allies = findNearby(-1, target, (canvas?.dimensions?.distance ?? 5));
	const reachAllies = findNearby(-1, target, 2 * (canvas?.dimensions?.distance ?? 5)).filter(ally => !(allies.some(tk => tk === ally)) &&
		//@ts-expect-error .system
		ally.actor?.items.contents.some(item => item.system?.properties?.rch && item.system.equipped));
	return allies.concat(reachAllies);
}
export async function computeFlankedStatus(target) {
	if (!checkRule("checkFlanking") || !["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking")))
		return false;
	if (!canvas || !target)
		return false;
	const allies = findPotentialFlankers(target);
	if (allies.length <= 1)
		return false; // length 1 means no other allies nearby
	let gridW = canvas?.grid?.w ?? 100;
	let gridH = canvas?.grid?.h ?? 100;
	const tl = { x: target.x, y: target.y };
	const tr = { x: target.x + target.document.width * gridW, y: target.y };
	const bl = { x: target.x, y: target.y + target.document.height * gridH };
	const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
	const top = [tl.x, tl.y, tr.x, tr.y];
	const bottom = [bl.x, bl.y, br.x, br.y];
	const left = [tl.x, tl.y, bl.x, bl.y];
	const right = [tr.x, tr.y, br.x, br.y];
	while (allies.length > 1) {
		const token = allies.pop();
		if (!token)
			break;
		if (!heightIntersects(target.document, token.document))
			continue;
		if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
			const CEFlanked = getFlankedEffect();
			//@ts-expect-error
			const hasFlanked = token.actor && CEFlanked && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, token.actor.uuid);
			if (hasFlanked)
				continue;
		}
		// Loop through each square covered by attacker and ally
		const tokenStartX = token.document.width >= 1 ? 0.5 : token.document.width / 2;
		const tokenStartY = token.document.height >= 1 ? 0.5 : token.document.height / 2;
		for (let ally of allies) {
			if (ally.document.uuid === token.document.uuid)
				continue;
			const actor = ally.actor;
			if (actor?.system.attributes?.hp?.value <= 0)
				continue;
			if (!heightIntersects(target.document, ally.document))
				continue;
			if (hasCondition(ally, "incapacitated"))
				continue;
			if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
				const CEFlanked = getFlankedEffect();
				//@ts-expect-error
				const hasFlanked = CEFlanked && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, ally.actor.uuid);
				if (hasFlanked)
					continue;
			}
			const allyStartX = ally.document.width >= 1 ? 0.5 : ally.document.width / 2;
			const allyStartY = ally.document.height >= 1 ? 0.5 : ally.document.height / 2;
			var x, x1, y, y1, d, r;
			for (x = tokenStartX; x < token.document.width; x++) {
				for (y = tokenStartY; y < token.document.height; y++) {
					for (x1 = allyStartX; x1 < ally.document.width; x1++) {
						for (y1 = allyStartY; y1 < ally.document.height; y1++) {
							let tx = token.x + x * gridW;
							let ty = token.y + y * gridH;
							let ax = ally.x + x1 * gridW;
							let ay = ally.y + y1 * gridH;
							const rayToCheck = new Ray({ x: tx, y: ty }, { x: ax, y: ay });
							// console.error("Checking ", tx, ty, ax, ay, token.center, ally.center, target.center)
							const flankedTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
							const flankedLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
							if (flankedLeft || flankedTop) {
								return true;
							}
						}
					}
				}
			}
		}
	}
	return false;
}
export function computeFlankingStatus(token, target) {
	if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off")
		return false;
	if (!canvas)
		return false;
	if (!token)
		return false;
	// For the target see how many square between this token and any friendly targets
	// Find all tokens hostile to the target
	if (!target)
		return false;
	if (!heightIntersects(target.document, token.document))
		return false;
	let range = 1;
	if (token.actor?.items.contents.some(item => item.system?.properties?.rch && item.system.equipped)) {
		range = 2;
	}
	if (getDistance(token, target, true) > range * (canvas?.dimensions?.distance ?? 5))
		return false;
	// an enemy's enemies are my friends.
	const allies = findPotentialFlankers(target);
	if (!token.document.disposition)
		return false; // Neutral tokens can't get flanking
	if (allies.length <= 1)
		return false; // length 1 means no other allies nearby
	let gridW = canvas?.grid?.w ?? 100;
	let gridH = canvas?.grid?.h ?? 100;
	const tl = { x: target.x, y: target.y };
	const tr = { x: target.x + target.document.width * gridW, y: target.y };
	const bl = { x: target.x, y: target.y + target.document.height * gridH };
	const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
	const top = [tl.x, tl.y, tr.x, tr.y];
	const bottom = [bl.x, bl.y, br.x, br.y];
	const left = [tl.x, tl.y, bl.x, bl.y];
	const right = [tr.x, tr.y, br.x, br.y];
	// Loop through each square covered by attacker and ally
	const tokenStartX = token.document.width >= 1 ? 0.5 : token.document.width / 2;
	const tokenStartY = token.document.height >= 1 ? 0.5 : token.document.height / 2;
	for (let ally of allies) {
		if (ally.document.uuid === token.document.uuid)
			continue;
		if (!heightIntersects(ally.document, target.document))
			continue;
		const actor = ally.actor;
		if (checkIncapacitated(ally, debugEnabled > 0))
			continue;
		if (hasCondition(ally, "incapacitated"))
			continue;
		const allyStartX = ally.document.width >= 1 ? 0.5 : ally.document.width / 2;
		const allyStartY = ally.document.height >= 1 ? 0.5 : ally.document.height / 2;
		var x, x1, y, y1, d, r;
		for (x = tokenStartX; x < token.document.width; x++) {
			for (y = tokenStartY; y < token.document.height; y++) {
				for (x1 = allyStartX; x1 < ally.document.width; x1++) {
					for (y1 = allyStartY; y1 < ally.document.height; y1++) {
						let tx = token.x + x * gridW;
						let ty = token.y + y * gridH;
						let ax = ally.x + x1 * gridW;
						let ay = ally.y + y1 * gridH;
						const rayToCheck = new Ray({ x: tx, y: ty }, { x: ax, y: ay });
						// console.error("Checking ", tx, ty, ax, ay, token.center, ally.center, target.center)
						const flankedTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
						const flankedLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
						if (flankedLeft || flankedTop) {
							return true;
						}
					}
				}
			}
		}
	}
	return false;
}
export function getFlankingEffect() {
	if (installedModules.get("dfreds-convenient-effects")) {
		//@ts-expect-error
		const dfreds = game.dfreds;
		let CEFlanking = dfreds.effects._flanking;
		if (!CEFlanking)
			CEFlanking = dfreds.effectInterface.findEffectByName("Flanking");
		return CEFlanking;
	}
	return undefined;
}
export function getFlankedEffect() {
	if (installedModules.get("dfreds-convenient-effects")) {
		//@ts-expect-error
		const dfreds = game.dfreds;
		let CEFlanked = dfreds.effects._flanked;
		if (!CEFlanked)
			CEFlanked = dfreds.effectInterface.findEffectByName("Flanked");
		return CEFlanked;
	}
	return undefined;
}
export function getReactionEffect() {
	//@ts-expect-error
	const dfreds = game.dfreds;
	if (!dfreds?.effectInterface)
		return undefined;
	let reactionEffect = dfreds.effectInterface.findEffectByName("Reaction");
	if (!reactionEffect)
		reactionEffect = dfreds.effectInterface.findEffectByName(`${SystemString}.Reaction`);
	return reactionEffect;
}
export function getBonusActionEffect() {
	//@ts-expect-error
	const dfreds = game.dfreds;
	if (!dfreds?.effectInterface)
		return undefined;
	let bonusActionEffect = dfreds.effectInterface.findEffectByName("Bonus Action");
	if (!bonusActionEffect)
		bonusActionEffect = dfreds.effectInterface.findEffectByName(`${SystemString}.BonusAction`);
	return bonusActionEffect;
}
export function getIncapacitatedStatusEffect() {
	let incapEffect = CONFIG.statusEffects.find(se => se.id === "incapacitated");
	//@ts-expect-error
	if (!incapEffect)
		incapEffect = CONFIG.statusEffects.find(se => se.statuses?.has("incapacitated"));
	//@ts-expect-error
	if (!incapEffect)
		incapEffect = CONFIG.statusEffects.find(se => se.name === i18n(`${SystemString}.ConIncapacitated`));
	return incapEffect;
}
export async function markFlanking(token, target) {
	// checkFlankingStatus requires a flanking token (token) and a target
	// checkFlankedStatus requires only a target token
	if (!canvas)
		return false;
	let needsFlanking = false;
	if (!target || !checkRule("checkFlanking") || checkRule["checkFlanking"] === "off")
		return false;
	if (["ceonly", "ceadv"].includes(checkRule("checkFlanking"))) {
		//@ts-expect-error
		const dfreds = game.dfreds;
		if (!token)
			return false;
		needsFlanking = computeFlankingStatus(token, target);
		if (installedModules.get("dfreds-convenient-effects")) {
			let CEFlanking = getFlankingEffect();
			if (!CEFlanking)
				return needsFlanking;
			//@ts-expect-error
			const hasFlanking = token.actor && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanking.name, token.actor.uuid);
			if (needsFlanking && !hasFlanking && token.actor) {
				//@ts-expect-error
				await game.dfreds.effectInterface?.addEffect({ effectName: CEFlanking.name, uuid: token.actor.uuid });
			}
			else if (!needsFlanking && hasFlanking && token.actor) {
				//@ts-expect-error
				await game.dfreds.effectInterface?.removeEffect({ effectName: CEFlanking.name, uuid: token.actor.uuid });
			}
		}
	}
	else if (checkRule("checkFlanking") === "advonly") {
		if (!token)
			return false;
		needsFlanking = computeFlankingStatus(token, target);
	}
	else if (["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking"))) {
		if (!target.actor)
			return false;
		if (installedModules.get("dfreds-convenient-effects")) {
			let CEFlanked = getFlankedEffect();
			if (!CEFlanked)
				return false;
			const needsFlanked = await computeFlankedStatus(target);
			//@ts-expect-error
			const hasFlanked = target.actor && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, target.actor.uuid);
			if (needsFlanked && !hasFlanked && target.actor) {
				//@ts-expect-error
				await game.dfreds.effectInterface?.addEffect({ effectName: CEFlanked.name, uuid: target.actor.uuid });
			}
			else if (!needsFlanked && hasFlanked && token.actor) {
				//@ts-expect-error
				await game.dfreds.effectInterface?.removeEffect({ effectName: CEFlanked.name, uuid: target.actor.uuid });
			}
			return false;
		}
	}
	return needsFlanking;
}
export async function checkflanking(user, target, targeted) {
	if (user !== game.user)
		return false;
	let token = canvas?.tokens?.controlled[0];
	if (user.targets.size === 1)
		return markFlanking(token, target);
	return false;
}
export function getChanges(actorOrItem, key) {
	let contents = actorOrItem.effects.contents;
	//@ts-expect-error .appliedEffects
	if (actorOrItem instanceof Actor)
		contents = actorOrItem.appliedEffects.contents;
	return actorOrItem.effects.contents
		.flat()
		.map(e => {
		let c = foundry.utils.duplicate(e.changes);
		c = c.map(change => { change.effect = e; return change; });
		return c;
	})
		.flat()
		.filter(c => c.key.includes(key))
		.sort((a, b) => a.key < b.key ? -1 : 1);
}
/**
*
* @param token
* @param target
*
* @returns {boolean}
*/
export function canSense(tokenEntity, targetEntity, validModes = ["all"]) {
	return canSenseModes(tokenEntity, targetEntity, validModes).length > 0;
}
export function canSenseModes(tokenEntity, targetEntity, validModes = ["all"]) {
	const token = getToken(tokenEntity);
	const target = getToken(targetEntity);
	if (!token || !target)
		return [];
	return _canSenseModes(token, target, validModes);
}
export function _canSenseModes(tokenEntity, targetEntity, validModesParam = ["all"]) {
	//@ts-expect-error
	let target = targetEntity instanceof TokenDocument ? targetEntity.object : targetEntity;
	//@ts-expect-error detectionModes
	const detectionModes = CONFIG.Canvas.detectionModes;
	//@ts-expect-error DetectionMode
	const DetectionModeCONST = DetectionMode;
	//@ts-expect-error
	let token = getToken(tokenEntity);
	if (!token || !target)
		return ["noToken"];
	//@ts-expect-error .hidden
	if (target.document?.hidden || token.document?.hidden)
		return [];
	if (!token.hasSight && !configSettings.optionalRules.invisVision)
		return ["senseAll"];
	if (!token.hasSight && !configSettings.optionalRules.invisVision)
		return ["senseAll"];
	for (let tk of [token]) {
		//@ts-expect-error
		if (!tk.document.sight.enabled || !token.vision?.active) {
			//@ts-expect-error
			console.warn("initialising vision for ", tk.name, tk.document.sight.enabled, token.vision?.active);
			//@ts-expect-error
			const sightEnabled = tk.document.sight.enabled;
			//@ts-expect-error
			tk.document.sight.enabled = true;
			//@ts-expect-error
			tk.document._prepareDetectionModes();
			const sourceId = tk.sourceId;
			//@ts-expect-error
			if (game.release.generation >= 12) {
				//@ts-expect-error
				token.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: tk });
			}
			tk.vision.initialize({
				x: tk.center.x,
				y: tk.center.y,
				//@ts-expect-error
				elevation: tk.document.elevation,
				//@ts-expect-error
				radius: Math.clamped(tk.sightRange, 0, canvas?.dimensions?.maxR ?? 0),
				//@ts-expect-error
				externalRadius: tk.externalRadius,
				//@ts-expect-error
				angle: tk.document.sight.angle,
				//@ts-expect-error
				contrast: tk.document.sight.contrast,
				//@ts-expect-error
				saturation: tk.document.sight.saturation,
				//@ts-expect-error
				brightness: tk.document.sight.brightness,
				//@ts-expect-error
				attenuation: tk.document.sight.attenuation,
				//@ts-expect-error
				rotation: tk.document.rotation,
				//@ts-expect-error
				visionMode: tk.document.sight.visionMode,
				//@ts-expect-error
				color: globalThis.Color.from(tk.document.sight.color),
				//@ts-expect-error
				isPreview: !!tk._original,
				//@ts-expect-error specialStatusEffects
				blinded: tk.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
			});
			if (!tk.vision.los && game.modules.get("perfect-vision")?.active) {
				error(`canSense los not calcluated. Can't check if ${token.name} can see ${target.name}`, token.vision);
				return ["noSight"];
			}
			else if (!tk.vision.los) {
				//@ts-expect-error
				tk.vision.shape = token.vision._createRestrictedPolygon();
				//@ts-expect-error
				tk.vision.los = token.vision.shape;
			}
			//@ts-expect-error
			tk.vision.anmimated = false;
			//@ts-expect-error
			canvas?.effects?.visionSources.set(sourceId, tk.vision);
			//@ts-expect-error
			tk.document.sight.enabled = sightEnabled;
		}
	}
	const matchedModes = new Set();
	// Determine the array of offset points to test
	const t = Math.min(target.w, target.h) / 4;
	const targetPoint = target.center;
	const offsets = t > 0 ? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t]] : [[0, 0]];
	const tests = offsets.map(o => ({
		point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
		los: new Map()
	}));
	const config = { tests, object: targetEntity };
	//@ts-expect-error
	const tokenDetectionModes = token.detectionModes;
	//@ts-expect-error
	const modes = CONFIG.Canvas.detectionModes;
	let validModes = new Set(validModesParam);
	// First test basic detection for light sources which specifically provide vision
	//@ts-expect-error
	const lightSources = foundry.utils.isNewerVersion(game.system.version, "12.0") ? canvas?.effects?.lightSources : canvas?.effects?.lightSources.values();
	for (const lightSource of (lightSources ?? [])) {
		if ( /*!lightSource.data.vision ||*/!lightSource.active || lightSource.disabled)
			continue;
		if (!validModes.has(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID) && !validModes.has("all"))
			continue;
		if (!lightSource.data.visibility)
			continue;
		const result = lightSource.testVisibility(config);
		if (result === true)
			matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
	}
	const basic = tokenDetectionModes.find(m => m.id === DetectionModeCONST.BASIC_MODE_ID);
	if (basic /*&& token.vision.active*/) {
		if (["basicSight", "lightPerception", "all"].some(mode => validModes.has(mode))) {
			const result = modes.basicSight.testVisibility(token.vision, basic, config);
			if (result === true)
				matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
		}
	}
	for (const detectionMode of tokenDetectionModes) {
		if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID)
			continue;
		if (!detectionMode.enabled)
			continue;
		const dm = modes[detectionMode.id];
		if (validModes.has("all") || validModes.has(detectionMode.id)) {
			const result = dm?.testVisibility(token.vision, detectionMode, config);
			if (result === true) {
				matchedModes.add(detectionMode.id);
			}
		}
	}
	for (let tk of [token]) {
		//@ts-expect-error
		if (!tk.document.sight.enabled) {
			const sourceId = tk.sourceId;
			//@ts-expect-error
			canvas?.effects?.visionSources.delete(sourceId);
		}
	}
	return Array.from(matchedModes);
}
export function tokenForActor(actorRef) {
	let actor;
	if (!actorRef)
		return undefined;
	// if (actor.token) return actor.token;
	if (typeof actorRef === "string")
		actor = MQfromActorUuid(actorRef);
	else
		actor = actorRef;
	//@ts-expect-error getActiveTokens returns an array of tokens not tokenDocuments
	const tokens = actor.getActiveTokens();
	if (!tokens.length)
		return undefined;
	//@ts-expect-error .controlled
	const controlled = tokens.filter(t => t.controlled);
	return controlled.length ? controlled.shift() : tokens.shift();
}
export async function doConcentrationCheck(actor, saveDC) {
	const itemData = foundry.utils.duplicate(itemJSONData);
	foundry.utils.setProperty(itemData, "system.save.dc", saveDC);
	foundry.utils.setProperty(itemData, "system.save.ability", "con");
	foundry.utils.setProperty(itemData, "system.save.scaling", "flat");
	foundry.utils.setProperty(itemData, "name", concentrationCheckItemDisplayName);
	foundry.utils.setProperty(itemData, "system.target.type", "self");
	foundry.utils.setProperty(itemData, "flags.midi-qol.noProvokeReaction", true);
	return await _doConcentrationCheck(actor, itemData);
}
async function _doConcentrationCheck(actor, itemData) {
	let result;
	// actor took damage and is concentrating....
	const saveTargets = game.user?.targets;
	const theTargetToken = getTokenForActor(actor);
	const theTarget = theTargetToken?.document.id;
	if (game.user && theTarget)
		game.user.updateTokenTargets([theTarget]);
	let ownedItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
	if (configSettings.displaySaveDC) {
		//@ts-expect-error 
		ownedItem.getSaveDC();
	}
	try {
		result = await completeItemUse(ownedItem, {}, { checkGMStatus: true, systemCard: false, createWorkflow: true, versatile: false, configureDialog: false, workflowOptions: { targetConfirmation: "none" } });
	}
	catch (err) {
		const message = "midi-qol | doConcentrationCheck";
		TroubleShooter.recordError(err, message);
		console.warn(message, err);
	}
	finally {
		if (saveTargets && game.user)
			game.user.targets = saveTargets;
		return result;
	}
}
export function hasDAE(workflow) {
	return installedModules.get("dae") && (workflow.item?.effects?.some(ef => ef?.transfer === false)
		|| workflow.ammo?.effects?.some(ef => ef?.transfer === false));
}
export function procActorSaveBonus(actor, rollType, item) {
	if (!item)
		return 0;
	//@ts-expect-error
	const bonusFlags = actor.system.bonuses?.save;
	if (!bonusFlags)
		return 0;
	let saveBonus = 0;
	if (bonusFlags.magic) {
		return 0;
	}
	if (bonusFlags.spell) {
		return 0;
	}
	if (bonusFlags.weapon) {
		return 0;
	}
	return 0;
}
export async function displayDSNForRoll(rolls, rollType, defaultRollMode = undefined) {
	if (!rolls)
		return;
	if (!(rolls instanceof Array))
		rolls = [rolls];
	/*
	"midi-qol.hideRollDetailsOptions": {
	"none": "None",
	"detailsDSN": "Roll Formula but show DSN roll",
	"details": "Roll Formula",
	"d20Only": "Show attack D20 + Damage total",
	"hitDamage": "Show Hit/Miss + damage total",
	"hitCriticalDamage": "Show Hit/Miss/Critical/Fumble + damage total",
	"d20AttackOnly": "Show attack D20 Only",
	"all": "Entire Roll"
	},*/
	for (let roll of rolls) {
		if (dice3dEnabled()) {
			//@ts-expect-error game.dice3d
			const dice3d = game.dice3d;
			const hideRollOption = configSettings.hideRollDetails;
			let ghostRoll = false;
			let whisperIds = null;
			const rollMode = defaultRollMode || game.settings.get("core", "rollMode");
			let hideRoll = (["all"].includes(hideRollOption) && game.user?.isGM) ? true : false;
			if (!game.user?.isGM)
				hideRoll = false;
			else if (hideRollOption !== "none") {
				if (configSettings.gmHide3dDice && game.user?.isGM)
					hideRoll = true;
				if (game.user?.isGM && !hideRoll) {
					switch (rollType) {
						case "attackRollD20":
							if (["d20Only", "d20AttackOnly", "detailsDSN"].includes(hideRollOption)) {
								for (let i = 1; i < roll.dice.length; i++) { // hide everything except the d20
									roll.dice[i].results.forEach(r => foundry.utils.setProperty(r, "hidden", true));
								}
								hideRoll = false;
							}
							else if ((["hitDamage", "all", "hitCriticalDamage", "details"].includes(hideRollOption) && game.user?.isGM))
								hideRoll = true;
							break;
						case "attackRoll":
							hideRoll = hideRollOption !== "detailsDSN";
							break;
						case "damageRoll":
							hideRoll = hideRollOption !== "detailsDSN";
							break;
						default:
							hideRoll = false;
							break;
					}
				}
			}
			if (hideRoll && configSettings.ghostRolls && game.user?.isGM && !configSettings.gmHide3dDice) {
				ghostRoll = true;
				hideRoll = false;
			}
			else {
				ghostRoll = rollMode === "blindroll";
			}
			if (rollMode === "selfroll" || rollMode === "gmroll" || rollMode === "blindroll") {
				whisperIds = ChatMessage.getWhisperRecipients("GM");
				if (rollMode !== "blindroll" && game.user)
					whisperIds.concat(game.user);
			}
			if (!hideRoll) {
				let displayRoll = Roll.fromData(JSON.parse(JSON.stringify(roll))); // make a copy of the roll
				if (game.user?.isGM && configSettings.addFakeDice) {
					for (let term of displayRoll.terms) {
						if (term instanceof Die) {
							// for attack rolls only add a d20 if only one was rolled - else it becomes clear what is happening
							if (["attackRoll", "attackRollD20"].includes(rollType ?? "") && term.faces === 20 && term.number !== 1)
								continue;
							let numExtra = Math.ceil(term.number * Math.random());
							let extraDice = new Die({ faces: term.faces, number: numExtra }).evaluate();
							term.number += numExtra;
							term.results = term.results.concat(extraDice.results);
						}
					}
				}
				displayRoll.terms.forEach(term => {
					if (term.options?.flavor)
						term.options.flavor = term.options.flavor.toLocaleLowerCase();
					//@ts-expect-error
					else
						term.options.flavor = displayRoll.options.type;
				});
				if (ghostRoll) {
					const promises = [];
					promises.push(dice3d?.showForRoll(displayRoll, game.user, true, ChatMessage.getWhisperRecipients("GM"), !game.user?.isGM));
					if (game.settings.get("dice-so-nice", "showGhostDice")) {
						//@ts-expect-error
						displayRoll.ghost = true;
						promises.push(dice3d?.showForRoll(displayRoll, game.user, true, game.users?.players.map(u => u.id), game.user?.isGM));
					}
					await Promise.allSettled(promises);
				}
				else
					await dice3d?.showForRoll(displayRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user?.isGM);
			}
		}
		//mark all dice as shown - so that toMessage does not trigger additional display on other clients
		DSNMarkDiceDisplayed(roll);
	}
}
export function DSNMarkDiceDisplayed(roll) {
	roll.dice.forEach(d => d.results.forEach(r => foundry.utils.setProperty(r, "hidden", true)));
}
export function isReactionItem(item) {
	if (!item)
		return false;
	return item.system.activation?.type?.includes("reaction");
}
export function getCriticalDamage() {
	return game.user?.isGM ? criticalDamageGM : criticalDamage;
}
export function isTargetable(target /*Token*/) {
	if (!target.actor)
		return false;
	if (foundry.utils.getProperty(target.actor, "flags.midi-qol.neverTarget"))
		return false;
	const targetDocument = getTokenDocument(target);
	//@ts-expect-error hiddien
	if (targetDocument?.hidden)
		return false;
	if (foundry.utils.getProperty(target.actor, "system.details.type.custom")?.toLocaleLowerCase().includes("notarget")) {
		console.warn("midi-qol | system.type.custom === 'notarget' is deprecated in favour or flags.midi-qol.neverTarget = true");
		return false;
	}
	if (foundry.utils.getProperty(target.actor, "actor.system.details.race")?.toLocaleLowerCase().includes("notarget")) {
		console.warn("midi-qol | system.details.race === 'notarget' is deprecated in favour or flags.midi-qol.neverTarget = true");
		return false;
	}
	if (foundry.utils.getProperty(target.actor, "actor.system.details.race")?.toLocaleLowerCase().includes("trigger")) {
		console.warn("midi-qol | system.details.race === 'trigger' is deprecated in favour or flags.midi-qol.neverTarget = true");
		return false;
	}
	return true;
}
export function hasWallBlockingCondition(target /*Token*/) {
	return globalThis.MidiQOL.WallsBlockConditions.some(cond => hasCondition(target, cond));
}
function contestedRollFlavor(baseFlavor, rollType, ability) {
	let flavor;
	let title;
	if (rollType === "test" || rollType === "abil") {
		const label = GameSystemConfig.abilities[ability]?.label ?? ability;
		flavor = game.i18n.format("DND5E.AbilityPromptTitle", { ability: label });
	}
	else if (rollType === "save") {
		const label = GameSystemConfig.abilities[ability].label;
		flavor = game.i18n.format("DND5E.SavePromptTitle", { ability: label });
	}
	else if (rollType === "skill") {
		flavor = game.i18n.format("DND5E.SkillPromptTitle", { skill: GameSystemConfig.skills[ability]?.label ?? "" });
	}
	return `${baseFlavor ?? i18n("midi-qol.ContestedRoll")} ${flavor}`;
}
export function validRollAbility(rollType, ability) {
	if (typeof ability !== "string")
		return undefined;
	ability = ability.toLocaleLowerCase().trim();
	switch (rollType) {
		case "test":
		case "abil":
		case "save":
			if (GameSystemConfig.abilities[ability])
				return ability;
			return Object.keys(GameSystemConfig.abilities).find(abl => GameSystemConfig.abilities[abl].label.toLocaleLowerCase() === ability.trim().toLocaleLowerCase());
		case "skill":
			if (GameSystemConfig.skills[ability])
				return ability;
			return Object.keys(GameSystemConfig.skills).find(skl => GameSystemConfig.skills[skl].label.toLocaleLowerCase() === ability.trim().toLocaleLowerCase());
		default: return undefined;
	}
}
export async function contestedRoll(data) {
	const source = data.source;
	const target = data.target;
	const sourceToken = getToken(source?.token);
	const targetToken = getToken(target?.token);
	const { rollOptions, success, failure, drawn, displayResults, itemCardId, itemCardUuid, flavor } = data;
	let canProceed = true;
	if (!source || !target || !sourceToken || !targetToken || !source.rollType || !target.rollType || !source.ability || !target.ability || !validRollAbility(source.rollType, source.ability) || !validRollAbility(target.rollType, target.ability)) {
		error(`contestRoll | source[${sourceToken?.name}], target[${targetToken?.name}], source.rollType[${source.rollType}], target.rollType[${target?.rollType}], source.ability[${source.ability}], target.ability[${target?.ability}] must all be defined`);
		canProceed = false;
	}
	if (!["test", "abil", "save", "skill"].includes(source?.rollType ?? "")) {
		error(`contestedRoll | sourceRollType must be one of test/abil/skill/save not ${source.rollType}`);
		canProceed = false;
	}
	if (!["test", "abil", "save", "skill"].includes(target?.rollType ?? "")) {
		error(`contestedRoll | target.rollType must be one of test/abil/skill/save not ${target.rollType}`);
		canProceed = false;
	}
	const sourceDocument = getTokenDocument(source?.token);
	const targetDocument = getTokenDocument(target?.token);
	if (!sourceDocument || !targetDocument)
		canProceed = false;
	if (!canProceed)
		return { result: undefined, rolls: [] };
	source.ability = validRollAbility(source.rollType, source.ability) ?? "";
	target.ability = validRollAbility(target.rollType, target.ability) ?? "";
	let player1 = playerFor(sourceToken);
	//@ts-expect-error activeGM
	if (!player1?.active)
		player1 = game.users?.activeGM;
	let player2 = playerFor(targetToken);
	//@ts-expect-error activeGM
	if (!player2?.active)
		player2 = game.users?.activeGM;
	if (!player1 || !player2)
		return { result: undefined, rolls: [] };
	const sourceFlavor = contestedRollFlavor(flavor, source.rollType, source.ability);
	const sourceOptions = foundry.utils.mergeObject(foundry.utils.duplicate(source.rollOptions ?? rollOptions ?? {}), {
		mapKeys: false,
		flavor: sourceFlavor,
		title: `${sourceFlavor}: ${sourceToken?.name} vs ${targetToken?.name}`
	});
	const targetFlavor = contestedRollFlavor(flavor, target.rollType, target.ability);
	const targetOptions = foundry.utils.mergeObject(foundry.utils.duplicate(target.rollOptions ?? rollOptions ?? {}), {
		mapKeys: false,
		flavor: targetFlavor,
		title: `${targetFlavor}: ${targetToken?.name} vs ${sourceToken?.name}`
	});
	const resultPromises = [
		socketlibSocket.executeAsUser("rollAbility", player1.id, { request: source.rollType.trim(), targetUuid: sourceDocument?.uuid, ability: source.ability.trim(), options: sourceOptions }),
		socketlibSocket.executeAsUser("rollAbility", player2.id, { request: target.rollType.trim(), targetUuid: targetDocument?.uuid, ability: target.ability.trim(), options: targetOptions }),
	];
	let results = await Promise.all(resultPromises);
	let result = results[0].total - results[1].total;
	if (isNaN(result))
		result = undefined;
	if (displayResults !== false) {
		let resultString;
		if (result === undefined)
			resultString = "";
		else
			resultString = result > 0 ? i18n("midi-qol.save-success") : result < 0 ? i18n("midi-qol.save-failure") : result === 0 ? i18n("midi-qol.save-drawn") : "no result";
		const skippedString = i18n("midi-qol.Skipped");
		const content = `${flavor ?? i18n("midi-qol.ContestedRoll")} ${resultString} ${results[0].total ?? skippedString} ${i18n("midi-qol.versus")} ${results[1].total ?? skippedString}`;
		displayContestedResults(itemCardUuid, content, ChatMessage.getSpeaker({ token: sourceToken }), flavor);
	}
	if (result === undefined)
		return { result, rolls: results };
	if (result > 0 && success)
		success(results);
	else if (result < 0 && failure)
		failure(results);
	else if (result === 0 && drawn)
		drawn(results);
	return { result, rolls: results };
}
function displayContestedResults(chatCardUuid, resultContent, speaker, flavor) {
	//@ts-expect-error
	let itemCard = getCachedDocument(chatCardUuid) ?? fromUuidSync(chatCardUuid);
	if (itemCard && configSettings.mergeCard) {
		let content = foundry.utils.duplicate(itemCard.content ?? "");
		const searchRE = /<div class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
		const replaceString = `<div class="midi-qol-saves-display">${resultContent}<div class="end-midi-qol-saves-display">`;
		content = content.replace(searchRE, replaceString);
		itemCard.update({ "content": content });
	}
	else {
		// const title = `${flavor ?? i18n("miidi-qol:ContestedRoll")} results`;
		ChatMessage.create({ content: `<p>${resultContent}</p>`, speaker });
	}
}
export function getActor(actorRef) {
	if (actorRef instanceof Actor)
		return actorRef;
	if (actorRef instanceof Token)
		return actorRef.actor;
	if (actorRef instanceof TokenDocument)
		return actorRef.actor;
	if (typeof actorRef === "string")
		return MQfromActorUuid(actorRef);
	return null;
}
export function getTokenDocument(tokenRef) {
	if (!tokenRef)
		return undefined;
	if (tokenRef instanceof TokenDocument)
		return tokenRef;
	if (typeof tokenRef === "string") {
		const document = MQfromUuid(tokenRef);
		if (document instanceof TokenDocument)
			return document;
		if (document instanceof Actor)
			return tokenForActor(document)?.document;
	}
	if (tokenRef instanceof Token)
		return tokenRef.document;
	if (tokenRef instanceof Actor)
		return tokenForActor(tokenRef)?.document;
	return undefined;
}
export function getToken(tokenRef) {
	if (!tokenRef)
		return undefined;
	if (tokenRef instanceof Token)
		return tokenRef;
	//@ts-expect-error return cast
	if (tokenRef instanceof TokenDocument)
		return tokenRef.object;
	if (typeof tokenRef === "string") {
		const entity = MQfromUuid(tokenRef);
		//@ts-expect-error return cast
		if (entity instanceof TokenDocument)
			return entity.object;
		if (entity instanceof Actor)
			return tokenForActor(entity);
		return undefined;
	}
	if (tokenRef instanceof Actor)
		return tokenForActor(tokenRef);
	return undefined;
}
export function calcTokenCover(attacker, target) {
	const attackerToken = getToken(attacker);
	const targetToken = getToken(target);
	//@ts-expect-error .coverCalc
	const coverCalc = attackerToken.coverCalculator;
	if (!attackerToken || !targetToken || !coverCalc) {
		let message = "midi-qol | calcTokenCover | failed";
		if (!coverCalc)
			message += " tokencover not installed or cover calculator not found";
		if (!attackerToken)
			message += " atacker token not valid";
		if (!targetToken)
			message += " target token not valid";
		const err = new Error("calcTokenCover failed");
		TroubleShooter.recordError(err, message);
		console.warn(message, err);
		return 0;
	}
	let targetCover = coverCalc.targetCover(target);
	return targetCover;
}
export function itemRequiresConcentration(item) {
	if (!item)
		return false;
	return item.system.properties.has("concentration")
		|| item.flags.midiProperties?.concentration;
}
const MaxNameLength = 20;
export function getLinkText(entity) {
	if (!entity)
		return "<unknown>";
	let name = entity.name ?? "unknown";
	if (entity instanceof Token && !configSettings.useTokenNames)
		name = entity.actor?.name ?? name;
	if (entity instanceof Token)
		return `@UUID[${entity.document.uuid}]{${name.slice(0, MaxNameLength - 5)}}`;
	return `@UUID[${entity.uuid}]{${entity.name?.slice(0, MaxNameLength - 5)}}`;
}
export function getTokenName(entity) {
	if (!entity)
		return "<unknown>";
	entity = getToken(entity);
	if (!(entity instanceof Token))
		return "<unknown>";
	if (configSettings.useTokenNames)
		return entity.name ?? entity.actor?.name ?? "<unknown>";
	else
		return entity.actor?.name ?? entity.name ?? "<unknown>";
}
export function getIconFreeLink(entity) {
	if (!entity)
		return "<unknown>";
	let name = entity.name ?? "unknown";
	if (entity instanceof Token && !configSettings.useTokenNames)
		name = entity.actor?.name ?? name;
	if (entity instanceof Token) {
		return name;
		// return `<a class="content-link midi-qol" data-uuid="${entity.actor?.uuid}">${name?.slice(0, MaxNameLength)}</a>`;
	}
	else {
		return name;
		// return `<a class="content-link midi-qol" data-uuid="${entity.uuid}">${name?.slice(0, MaxNameLength)}</a>`
	}
}
export function midiMeasureDistances(segments, options = {}) {
	let isGridless = safeGetGameSetting("dnd5e", "diagonalMovement") === "5105"; // V12
	//@ts-expect-error .release
	if (game.release.generation > 11) {
		isGridless = canvas?.grid?.constructor.name === "GridlessGrid";
	}
	else {
		isGridless = canvas?.grid?.grid?.constructor.name === "BaseGrid";
	}
	if (!isGridless || !options.gridSpaces || !configSettings.griddedGridless) {
		const distances = canvas?.grid?.measureDistances(segments, options);
		if (!configSettings.gridlessFudge)
			return distances; // TODO consider other impacts of doing this
		return distances;
		return distances?.map(d => Math.max(0, d - configSettings.gridlessFudge));
	}
	const rule = safeGetGameSetting("dnd5e", "diagonalMovement") ?? "EUCL"; // V12
	if (!configSettings.gridlessFudge || !options.gridSpaces || !["555", "5105", "EUCL"].includes(rule))
		return canvas?.grid?.measureDistances(segments, options);
	// Track the total number of diagonals
	let nDiagonal = 0;
	const d = canvas?.dimensions;
	//@ts-expect-error .grid
	const grid = canvas?.scene?.grid;
	if (!d || !d.size)
		return 0;
	const fudgeFactor = configSettings.gridlessFudge / d.distance;
	// Iterate over measured segments
	return segments.map(s => {
		let r = s.ray;
		// Determine the total distance traveled
		let nx = Math.ceil(Math.max(0, Math.abs(r.dx / d.size) - fudgeFactor));
		let ny = Math.ceil(Math.max(0, Math.abs(r.dy / d.size) - fudgeFactor));
		// Determine the number of straight and diagonal moves
		let nd = Math.min(nx, ny);
		let ns = Math.abs(ny - nx);
		nDiagonal += nd;
		// Alternative DMG Movement
		if (rule === "5105") {
			let nd10 = Math.floor(nDiagonal / 2) - Math.floor((nDiagonal - nd) / 2);
			let spaces = (nd10 * 2) + (nd - nd10) + ns;
			return spaces * d.distance;
		}
		// Euclidean Measurement
		else if (rule === "EUCL") {
			let nx = Math.max(0, Math.abs(r.dx / d.size) - fudgeFactor);
			let ny = Math.max(0, Math.abs(r.dy / d.size) - fudgeFactor);
			return Math.ceil(Math.hypot(nx, ny) * grid?.distance);
		}
		// Standard PHB Movement
		else
			return Math.max(nx, ny) * grid.distance;
	});
}
export function getAutoTarget(item) {
	if (!item)
		return configSettings.autoTarget;
	const midiFlags = foundry.utils.getProperty(item, "flags.midi-qol");
	const autoTarget = midiFlags.autoTarget;
	if (!autoTarget || autoTarget === "default")
		return configSettings.autoTarget;
	return autoTarget;
}
export function hasAutoPlaceTemplate(item) {
	return item && item.hasAreaTarget && ["self"].includes(item.system.range?.units) && ["radius", "squareRadius"].includes(item.system.target.type);
}
export function itemOtherFormula(item) {
	const isVersatle = item?.isVersatile && item?.system.properties?.has("ver");
	if ((item?.system.formula ?? "") !== "")
		return item.system.formula;
	if (item?.type === "weapon" && !isVersatle)
		return item.system.damage.versatile ?? "";
	return "";
}
export function addRollTo(roll, bonusRoll) {
	if (!bonusRoll)
		return roll;
	if (!roll)
		return bonusRoll;
	//@ts-expect-error _evaluated
	if (!roll._evaluated)
		roll = roll.clone().evaluate({ async: false }); // V12
	//@ts-expect-error _evaluate
	if (!bonusRoll._evaluated)
		bonusRoll = bonusRoll.clone().evaluate({ async: false }); // V12
	let terms;
	if (bonusRoll.terms[0] instanceof OperatorTerm) {
		terms = roll.terms.concat(bonusRoll.terms);
	}
	else {
		const operatorTerm = new OperatorTerm({ operator: "+" });
		operatorTerm.evaluate();
		terms = roll.terms.concat([operatorTerm]);
		terms = terms.concat(bonusRoll.terms);
	}
	let newRoll = Roll.fromTerms(terms);
	return newRoll;
}
export async function chooseEffect({ speaker, actor, token, character, item, args, scope, workflow, options }) {
	let second1TimeoutId;
	let timeRemaining;
	if (!item)
		return false;
	const effects = item.effects.filter((e) => !e.transfer && foundry.utils.getProperty(e, 'flags.dae.dontApply') === true);
	if (effects.length === 0) {
		if (debugEnabled > 0)
			warn(`chooseEffect | no effects found for ${item.name}`);
		return false;
	}
	let targets = workflow.applicationTargets;
	if (!targets || targets.size === 0)
		return;
	let returnValue = new Promise((resolve, reject) => {
		const callback = async function (dialog, html, event) {
			clearTimeout(timeoutId);
			const effectData = this.toObject();
			effectData.origin = item.uuid;
			effectData.flags.dae.dontApply = false;
			const applyItem = item.clone({ effects: [effectData] }, { keepId: true });
			await globalThis.DAE.doEffects(applyItem, true, targets, {
				damageTotal: 0,
				critical: false,
				fumble: false,
				itemCardId: "",
				itemCardUuid: "",
				metaData: {},
				selfEffects: "none",
				spellLevel: (applyItem.level ?? 0),
				toggleEffect: applyItem?.flags.midiProperties?.toggleEffect,
				tokenId: token.id,
				tokenUuid: token.document.uuid,
				actorUuid: actor.uuid,
				whisper: false,
				workflowOptions: this.workflowOptions,
				context: {}
			});
			if (this.toObject()) {
				if (this.debugEnabled)
					warn(`chooseEffect | applying effect ${this.name} to ${targets.size} targets`, targets); /*
			for (let target of targets) {
				await target.actor.createEmbeddedDocuments('ActiveEffect', [
				effectData,
				]);
			}*/
			}
			resolve(this);
		};
		const style = `
			<style>
			.dnd5e2.effectNoTarget.dialog .dialog-buttons button.dialog-button {
				border: 5px;
				background: var(--dnd5e-color-grey);
				margin: 0;
				display: grid;			
				grid-template-columns: 40px 150px;
				grid-gap: 5px
			}
			.dnd5e2.effectNoTarget.dialog .dialog-buttons button.dialog-button span {
				overflow: hidden;
				text-overflow: ellipsis;
			}
		.dnd5e2.effectNoTarget.dialog .window-header .window-title {
				visibility: visible;
				color: initial;
				text-align: center;
				font-weight: bold;
			}
			</style>`;
		function render([html]) {
			html.parentElement.querySelectorAll('.dialog-button').forEach((n) => {
				const img = document.createElement('IMG');
				//@ts-expect-error
				const eff = fromUuidSync(n.dataset.button);
				//@ts-expect-error
				img.src = eff.icon;
				const effNameSpan = document.createElement('span');
				effNameSpan.textContent = eff.name;
				n.innerHTML = '';
				n.appendChild(img);
				n.appendChild(effNameSpan);
				n.dataset.tooltip = eff.name;
			});
		}
		let buttons = {};
		for (let effect of effects) {
			buttons[effect.uuid] = {
				label: effect.name,
				callback: callback.bind(effect),
			};
		}
		let timeout = options?.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
		timeRemaining = timeout;
		//@ts-expect-error
		const Mixin = game.system.applications.DialogMixin(Dialog);
		const dialogOptions = {
			classes: ['dnd5e2', 'effectNoTarget', 'dialog'],
			width: 220,
			height: 'auto',
		};
		const data = {
			title: `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}: ${timeRemaining}s`,
			content: `<center><b>${i18n('EFFECT.StatusTarget')}: [</b>${[
				...targets,
			].map((t) => t.name)}<b>]</b></center> ${style}`,
			buttons,
			render,
		};
		let dialog = new Mixin(data, dialogOptions);
		dialog.render(true);
		const set1SecondTimeout = function () {
			second1TimeoutId = setTimeout(() => {
				if (!timeoutId)
					return;
				timeRemaining -= 1;
				dialog.data.title = `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}: ${timeRemaining}s`;
				dialog.render(false);
				if (timeRemaining > 0)
					set1SecondTimeout();
			}, 1000);
		};
		let timeoutId = setTimeout(() => {
			if (debugEnabled > 0)
				warn(`chooseEffect | timeout fired closing dialog`);
			clearTimeout(second1TimeoutId);
			dialog.close();
			reject('timeout');
		}, timeout * 1000);
		set1SecondTimeout();
	});
	return await returnValue;
}
export async function canSee(tokenEntity, targetEntity) {
	const NON_SIGHT_CONSIDERED_SIGHT = ["blindsight"];
	//@ts-expect-error
	const detectionModes = CONFIG.Canvas.detectionModes;
	const sightDetectionModes = Object.keys(detectionModes).filter((d) => 
	//@ts-expect-error DetectionMode
	detectionModes[d].type === DetectionMode.DETECTION_TYPES.SIGHT ||
		NON_SIGHT_CONSIDERED_SIGHT.includes[d]);
	return canSense(tokenEntity, targetEntity, sightDetectionModes);
}
export function sumRolls(rolls = []) {
	if (!rolls)
		return 0;
	return rolls.reduce((total, b) => total + (b?.total ?? 0), 0);
}
const updatesCache = {};
export async function _updateAction(document) {
	if (!updatesCache[document.uuid])
		return;
	const updates = updatesCache[document.uuid];
	clearUpdatesCache(document.uuid);
	if (debugEnabled > 0)
		warn("update action | Doing updateAction", updates);
	//@ts-expect-error
	const baseDocument = fromUuidSync(document.uuid);
	return await baseDocument.update(updates);
}
export async function debouncedUpdate(document, updates, immediate = false) {
	if (!DebounceInterval || !configSettings.mergeCard) {
		if (debugEnabled > 0)
			console.warn("debouncedUpdate | performing update", immediate);
		return await document.update(updates);
	}
	if (debugEnabled > 0) {
		if (updatesCache[document.uuid]) {
			warn("debouncedUpdate | Cache not empty");
		}
		else
			warn("debouncedUpdate | cache empty");
	}
	updatesCache[document.uuid] = foundry.utils.mergeObject((updatesCache[document.uuid] ?? {}), updates, { overwrite: true });
	if (immediate)
		return await _updateAction(document);
	return await _debouncedUpdateAction(document);
}
export function getUpdatesCache(uuid) {
	if (!uuid)
		return {};
	if (!updatesCache[uuid])
		return {};
	return updatesCache[uuid];
}
export function clearUpdatesCache(uuid) {
	if (!uuid)
		return;
	delete updatesCache[uuid];
}
export function getCachedDocument(uuid) {
	if (!uuid)
		return undefined;
	//@ts-expect-error
	let document = fromUuidSync(uuid);
	let updates = document?.uuid && updatesCache[document.uuid];
	if (updates) {
		document = foundry.utils.deepClone(document);
		Object.keys(updates).forEach(key => { foundry.utils.setProperty(document, key, updates[key]); });
	}
	return document;
}
export function getConcentrationEffectsRemaining(concentrationData, deletedUuid) {
	const allConcentrationEffects = concentrationData.targets?.reduce((effects, target) => {
		let actor = MQfromActorUuid(target.actorUuid);
		let matchEffects = actor?.effects.filter(effect => {
			let matched = effect.origin === concentrationData.uuid
				&& !effect.flags.dae.transfer
				&& effect.uuid !== deletedUuid;
			matched = matched && !isEffectExpired(effect);
			return matched;
		}) ?? [];
		return effects.concat(matchEffects);
	}, []);
	return allConcentrationEffects;
}
export function isEffectExpired(effect) {
	if (installedModules.get("times-up") && globalThis.TimesUp.isEffectExpired) {
		return globalThis.TimesUp.isEffectExpired(effect);
	}
	// TODO find out how to check some other module can delete expired effects
	// return effect.updateDuration().remaining ?? false;
	return effect.duration.remaining <= 0;
}
export async function expireEffects(actor, effects, options) {
	if (!effects)
		return {};
	const effectsToDelete = [];
	const effectsToDisable = [];
	for (let effect of effects) {
		if (!effect.id)
			continue;
		//@ts-expect-error
		if (!fromUuidSync(effect.uuid))
			continue;
		//@ts-expect-error
		if (effect.transfer)
			effectsToDisable.push(effect);
		else
			effectsToDelete.push(effect.id);
	}
	if (effectsToDelete.length > 0)
		await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete, options);
	if (effectsToDisable.length > 0) {
		for (let effect of effectsToDisable) {
			await effect.update({ "disabled": true });
		}
	}
	return { deleted: effectsToDelete, disabled: effectsToDisable };
}
export function blankOrUndefinedDamageType(s) {
	if (!s)
		return "none";
	if (s === "")
		return "none";
	return s;
}
export function processConcentrationSave(message, html, data) {
	if (configSettings.concentrationAutomation || safeGetGameSetting("dnd5e", "disableConcentration") || !configSettings.doConcentrationCheck)
		return;
	let button = html.find("[data-action=concentration]");
	const hasRolled = foundry.utils.getProperty(message, "flags.midi-qol.concentrationRolled");
	//@ts-expect-error
	if (hasRolled || game.user !== game.users?.activeGM)
		return;
	if (button.length === 1 && !hasRolled) {
		let { action, dc, type } = button[0].dataset;
		let token, actor;
		if (action === "concentration" && type === "concentration") {
			dc = Number(dc);
			let { actor, alias, scene, token } = message.speaker;
			if (scene && token)
				token = game.scenes?.get(scene)?.tokens.get(token);
			if (token)
				actor = token.actor;
			else
				actor = game.actors?.get(actor);
			if (actor) {
				const user = playerForActor(actor);
				if (user?.active) {
					const whisper = game.users.filter(user => actor.testUserPermission(user, "OWNER"));
					socketlibSocket.executeAsUser("rollConcentration", user.id, { actorUuid: actor.uuid, targetValue: dc, whisper });
				}
				else
					actor.rollConcentration({ targetValue: dc });
				message.setFlag("midi-qol", "concentrationRolled", true);
			}
		}
	}
}
export function setRollOperatorEvaluated(roll) {
	if (!roll._evaluated)
		return roll;
	roll.terms.forEach(t => {
		if (!t._evaluated)
			t.evaluate();
	});
}
export function doSyncRoll(roll, source) {
	//@ts-expect-error
	if (game.release.generation > 11) {
		if (!roll.isDeterministic)
			error(`%c doSyncEval | dice expressions are not supported in v12 [${roll._formula}] and has been ignore ${source}`, "color:red;");
		return roll.evaluateSync({ strict: false });
	}
	else if (!roll.isDeterministic)
		console.warn(`%c doSyncEval | dice expressions not supported in v12 [${roll._formula}] and will be ignored ${source}`, "color:red;");
	return roll.evaluate({ async: false });
}
export function setRollMinDiceTerm(roll, minValue) {
	roll.dice.forEach(d => {
		d.results.forEach(r => {
			if (r.result < minValue)
				r.result = minValue;
		});
	});
	//@ts-expect-error
	roll._total = roll._evaluateTotal();
	return roll;
}
export function setRollMaxDiceTerm(roll, maxValue) {
	roll.dice.forEach(d => {
		d.results.forEach(r => {
			if (r.result > maxValue)
				r.result = maxValue;
		});
	});
	//@ts-expect-error
	roll._total = roll._evaluateTotal();
	return roll;
}
export async function addConcentrationDependent(actorRef, dependent, item) {
	if (configSettings.concentrationAutomation && !safeGetGameSetting("dnd5e", "disableConcentration")) {
		error("Invalid concentration settings: dnd5e concentration is enabled and you must disable midi concentration automation");
		return undefined;
	}
	if (dependent instanceof Token)
		dependent = dependent.document;
	if (!dependent.uuid) {
		console.warn(`midi-qol | addConcentrationDependent | dependent ${dependent?.name} must have a uuid`);
		return undefined;
	}
	const actor = getActor(actorRef);
	if (!actor) {
		console.warn(`midi-qol | addConcentrationDependent | actor not found for ${actorRef}`);
		return undefined;
	}
	if (configSettings.concentrationAutomation && safeGetGameSetting("dnd5e", "disableConcentration")) {
		const concentrationData = actor?.getFlag("midi-qol", "concentration-data");
		if (!concentrationData) {
			console.warn(`midi-qol | addConcentrationDependent | midi concentration not set for ${actor.name}`);
			return undefined;
		}
		const removeUuids = concentrationData.removeUuids ?? [];
		removeUuids.push(dependent.uuid);
		concentrationData.removeUuids = removeUuids;
		if (game.user?.isGM || actor.isOwner) {
			return actor.setFlag("midi-qol", "concentration-data", concentrationData);
		}
		else {
			return socketlibSocket.executeAsGM("_gmsetFlag", { base: "midi-qol", key: "concentration-data", value: concentrationData, actorUuid: actor.uuid });
		}
	}
	if (!item) {
		console.warn("midi-qol | addConcentrationDependent | item not supplied - using any concentration effect");
	}
	const concentrationEffect = actor?.effects.find(e => {
		//@ts-expect-error
		const flags = e.flags;
		return (flags?.dnd5e && flags.dnd5e.dependents && flags.dnd5e.itemData === (item?.id ?? flags.dnd5e.itemData));
	});
	if (!concentrationEffect) {
		console.warn(`midi-qol | addConcentrationDependent | dnd5e concentration effect not found for ${actor.name} ${item?.name ?? "no item"}`);
		return undefined;
	}
	if (game.user?.isGM || actor.isOwner) {
		//@ts-expect-error
		return concentrationEffect.addDependent(dependent);
	}
	return socketlibSocket.executeAsGM("addDependent", { concentrationEffectUuid: concentrationEffect.uuid, dependentUuid: dependent.uuid });
}
