import { confirmAction, daeSpecialDurations } from "../../dae.js";
import { teleportToToken, blindToken, restoreVision, setTokenVisibility, setTileVisibility, moveToken, renameToken, getTokenFlag, setTokenFlag, setFlag, unsetFlag, getFlag, deleteActiveEffect, createToken, teleportToken, deleteItemActiveEffects } from "../../module/daeMacros.js";
import { convertDuration } from "../GMAction.js";
import { ActiveEffects } from "../apps/ActiveEffects.js";
import { DAEActiveEffectConfig, addAutoFields, otherFields } from "../apps/DAEActiveEffectConfig.js";
import { DIMEditor } from "../apps/DIMEditor.js";
import { daeMacro, doEffects, daeSystemClass, actionQueue, actorFromUuid } from "../dae.js";
import { cleanActorItemsEffectOrigins, cleanEffectOrigins, fixTransferEffect, fixTransferEffects, migrateActorDAESRD, migrateAllActorsDAESRD, migrateAllNPCDAESRD, removeActorsPassiveEffects, removeAllScenesPassiveEffects, removeCompendiaPassiveEffects, removeScenePassiveEffects, tobMapper } from "../migration.js";
import { ValidSpec, wildcardEffects } from "../Systems/DAESystem.js";
const API = {
    ActiveEffects(object = {}, options = {}) {
        return new ActiveEffects(object, options);
    },
    addAutoFields(fields) {
        return addAutoFields(fields);
    },
    async blindToken(tokenOrId) {
        return await blindToken(tokenOrId);
    },
    async cleanEffectOrigins(processItems) {
        return await cleanEffectOrigins(processItems);
    },
    async cleanActorItemsEffectOrigins(actor) {
        return await cleanActorItemsEffectOrigins(actor);
    },
    confirmAction(toCheck, confirmFunction, title) {
        return confirmAction(toCheck, confirmFunction, title);
    },
    convertDuration(itemDuration, inCombat) {
        return convertDuration(itemDuration, inCombat);
    },
    async createToken(tokenData, x, y) {
        return await createToken(tokenData, x, y);
    },
    DAEActiveEffectConfig(object = {}, options = {}) {
        return new DAEActiveEffectConfig(object, options);
    },
    DAEfromActorUuid(uuid) {
        console.warn("dae | Deprecation warning | DAEfromActorUuid is deprecated, use DAE.fromActorUuid instead");
        return actorFromUuid(uuid);
    },
    actorFromUuid(uuid) {
        return actorFromUuid(uuid);
    },
    DAEfromUuid(uuid) {
        console.warn("dae | Deprecation warning | DAEfromUuid is deprecated, use foundry.utils.fromUuidSync instead");
        //@ts-expect-error fromUuidSync
        return fromUuidSync(uuid);
    },
    async daeMacro(action, actor, effectData, lastArgOptions = {}) {
        if (effectData instanceof ActiveEffect && !lastArgOptions.effectUuid)
            lastArgOptions.effectUuid = effectData.uuid;
        return await daeMacro(action, actor, effectData, lastArgOptions);
    },
    daeSpecialDurations() {
        return daeSpecialDurations;
    },
    async deleteActiveEffect(uuid, origin, ignore = [], deleteEffects = [], removeSequencer = true) {
        return await deleteActiveEffect(uuid, origin, ignore, deleteEffects, removeSequencer);
    },
    async deleteItemActiveEffects(tokens, origin, ignore = [], deleteEffects = [], removeSequencer = true) {
        return await deleteItemActiveEffects(tokens, origin, ignore, deleteEffects, removeSequencer);
    },
    get DIMEditor() { return DIMEditor; },
    async doEffects(item, activate, targets = undefined, options = {
        whisper: false, spellLevel: 0, damageTotal: null, itemCardId: null, critical: false,
        fumble: false, effectsToApply: [], removeMatchLabel: false, toggleEffect: false,
        selfEffects: "none"
    }) {
        return await doEffects(item, activate, targets, options);
    },
    async fixTransferEffects(actor) {
        return await fixTransferEffects(actor);
    },
    async fixTransferEffect(actor, item) {
        return await fixTransferEffect(actor, item);
    },
    getFlag(entity, flagId) {
        return getFlag(entity, flagId);
    },
    getTokenFlag(token /* TokenDocument*/, flagName) {
        return getTokenFlag(token, flagName);
    },
    async migrateActorDAESRD(actor, includeSRD = false) {
        return await migrateActorDAESRD(actor, includeSRD);
    },
    async migrateAllActorsDAESRD(includeSRD = false) {
        return await migrateAllActorsDAESRD(includeSRD);
    },
    async migrateAllNPCDAESRD(includeSRD = false) {
        return await migrateAllNPCDAESRD(includeSRD);
    },
    async moveToken(token, targetTokenName, xGridOffset = 0, yGridOffset = 0, targetSceneName = "") {
        return await moveToken(token, targetTokenName, xGridOffset, yGridOffset, targetSceneName);
    },
    async renameToken(token, newName) {
        return await renameToken(token, newName);
    },
    async restoreVision(tokenOrId) {
        return await restoreVision(tokenOrId);
    },
    evalExpression() {
        return daeSystemClass.safeEvalExpression.bind(daeSystemClass);
    },
    async setFlag(tactor, flagId, value) {
        return await setFlag(tactor, flagId, value);
    },
    async setTileVisibility(tileOrId, visible) {
        return await setTileVisibility(tileOrId, visible);
    },
    async setTokenFlag(tokenOrId, flagName, flagValue) {
        return await setTokenFlag(tokenOrId, flagName, flagValue);
    },
    async setTokenVisibility(tokenOrId, visible) {
        return await setTokenVisibility(tokenOrId, visible);
    },
    async teleportToken(token, scene, position) {
        return await teleportToken(token, scene, position);
    },
    async teleportToToken(token, targetTokenName, xGridOffset = 0, yGridOffset = 0, targetSceneName = "") {
        return await teleportToToken(token, targetTokenName, xGridOffset, yGridOffset, targetSceneName);
    },
    async tobMapper(iconsPath = "icons/TOBTokens") {
        return await tobMapper(iconsPath);
    },
    async unsetFlag(tactor, flagId) {
        return await unsetFlag(tactor, flagId);
    },
    get ValidSpec() { return ValidSpec; },
    get otherValidSpecKeys() { return otherFields; },
    get allValidSpecKeys() {
        return otherFields.concat(Object.keys(ValidSpec.specs["union"].allSpecsObj));
    },
    get actionQueue() { return actionQueue; },
    get wildcardBaseEffects() {
        return wildcardEffects;
    },
    get daeCustomEffect() {
        return daeSystemClass.daeCustomEffect;
    },
    async removeScenePassiveEffects() {
        return removeScenePassiveEffects();
    },
    async removeAllScenesPassiveEffects() {
        return removeAllScenesPassiveEffects();
    },
    async removeActorsPassiveEffects() {
        return removeActorsPassiveEffects();
    },
    async removeCompendiaPassiveEffects() {
        return removeCompendiaPassiveEffects();
    }
};
export default API;