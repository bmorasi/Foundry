import { confirmDelete, effectIsTransfer, simpleCalendarInstalled } from "../dae.js";
import { i18n, confirmAction, daeSpecialDurations } from "../../dae.js";
import { ValidSpec } from "../Systems/DAESystem.js";
export class ActiveEffects extends FormApplication {
    static filters = new Set();
    hookId = null;
    itemHookId = null;
    effectHookIdu = null;
    effectHookIdc = null;
    effectHookIdd = null;
    effectHookIdt = null;
    effectHookIda = null;
    timeHookId = null;
    combatHookId = null;
    effect;
    effectList;
    static get defaultOptions() {
        const options = super.defaultOptions;
        // options.id = "effect-selector-actor";
        options.classes = ["dnd5e", "sw5e"];
        options.title = game.i18n.localize("dae.ActiveEffectName");
        options.template = "./modules/dae/templates/ActiveEffects.html";
        options.submitOnClose = true;
        options.height = 400;
        options.width = 600;
        options.resizable = true;
        return options;
    }
    get id() {
        const actor = this.object;
        let id = `ActiveEffects-${actor.id}`;
        if (actor.isToken)
            id += `-${actor.token.id}`;
        return id;
    }
    get title() {
        return game.i18n.localize("dae.ActiveEffectName") + ` ${this.object.name}`;
    }
    get filters() { return ActiveEffects.filters; }
    getData() {
        // const object: any = this.object;
        const EFFECTMODES = CONST.ACTIVE_EFFECT_MODES;
        const modeKeys = Object.keys(EFFECTMODES);
        function* effectsGenerator() { for (const effect of this.effects)
            yield effect; }
        ;
        let effects = effectsGenerator.bind(this.object);
        //@ts-expect-error legacyTransferral
        if (this.object instanceof CONFIG.Actor.documentClass && CONFIG.ActiveEffect.legacyTransferral === false) {
            //@ts-expect-error allApplicableEffects
            effects = this.object.allApplicableEffects.bind(this.object);
        }
        let actives = [];
        for (let ae of effects()) {
            //    let newAe = globalThis.foundry.utils.foundry.utils.deepClone(ae);
            let newAe = ae.toObject();
            newAe.uuid = ae.uuid;
            newAe.isSuppressed = ae.isSuppressed;
            newAe.duration = foundry.utils.duplicate(ae.duration);
            ae.updateDuration(); // TODO remove this if v10 change made
            if (simpleCalendarInstalled && ae.duration?.type === "seconds") {
                const simpleCalendar = globalThis.SimpleCalendar?.api;
                newAe.duration.label = simpleCalendar.formatTimestamp(ae.duration.remaining).time;
            }
            else if (ae.duration.label) {
                newAe.duration.label = ae.duration.label.replace("Seconds", "s").replace("Rounds", "R").replace("Turns", "T");
            }
            let specialDuration = foundry.utils.getProperty(ae.flags, "dae.specialDuration") || [daeSpecialDurations["None"]];
            if (typeof specialDuration === "string")
                specialDuration = [ae.flags.dae.specialDuration];
            newAe.duration.label += ", " + `[${specialDuration.map(dur => (daeSpecialDurations[dur], dur))}]`;
            newAe.isTemporary = ae.isTemporary;
            newAe.sourceName = `(${ae.sourceName ?? "Unknown"})`;
            if (this.filters.has("summary")) {
                newAe.changes = [];
                actives.push(newAe);
                continue;
            }
            newAe.changes.map(change => {
                if (this.object instanceof CONFIG.Item.documentClass)
                    change.label = ValidSpec.specs["union"].allSpecsObj[change.key]?.label || change.key;
                else
                    change.label = ValidSpec.specs[this.object.type].allSpecsObj[change.key]?.label || change.key;
                if (typeof change.value === "string" && change.value.length > 40) {
                    change.value = change.value.substring(0, 30) + " ... ";
                }
                else if (Array.isArray(change.value)) {
                    if (typeof change.value[0] === "string" && change.value[0].length > 20)
                        change.value[0] = "<Macro>";
                    change.value = change.value.join("|");
                }
                return change;
            });
            actives.push(newAe);
        }
        ;
        if (this.filters.has("temporary"))
            actives = actives.filter(e => e.isTemporary);
        if (this.filters.has("enabled"))
            actives = actives.filter(e => !e.disabled && !e.isSuppressed);
        actives.sort((a, b) => a.name < b.name ? -1 : 1);
        actives.forEach(e => {
            let id = e.origin?.match(/Actor.*Item\.(.*)/);
            if (id?.length === 2) {
                const item = this.object.items?.get(id[1]);
                foundry.utils.setProperty(e, "flags.dae.itemName", item?.name || "???");
            }
            else {
                foundry.utils.setProperty(e, "flags.dae.itemName", "????");
            }
            e.transfer = effectIsTransfer(e) ?? true;
        });
        let efl = CONFIG.statusEffects
            .map(se => {
            //@ts-expect-error .name
            if (se.id.startsWith("Convenient Effect:"))
                return { id: se.id, name: `${se.name} (CE)` };
            //@ts-expect-error .name
            if (se.id.startsWith("condition-lab-triggler."))
                return { id: se.id, name: `${se.name} (CLT)` };
            //@ts-expect-error .name
            return { id: se.id, name: i18n(se.name) };
        })
            .sort((a, b) => a.name < b.name ? -1 : 1);
        this.effectList = { "new": "new" };
        efl.forEach(se => {
            this.effectList[se.id] = se.name;
        });
        const isItem = this.object instanceof CONFIG.Item.documentClass;
        let data = {
            actives: actives,
            isGM: game.user?.isGM,
            isItem,
            isOwned: this.object.isOwned,
            flags: this.object.flags,
            modes: modeKeys,
            validSpecs: isItem ? ValidSpec.specs["union"].allSpecsObj : ValidSpec.specs[this.object.type],
            // canEdit: game.user.isGM || (playersCanSeeEffects === "edit" && game.user.isTrusted),
            canEdit: true,
            // showEffects: playersCanSeeEffects !== "none" || game.user.isGM,
            showEffects: true,
            effectList: this.effectList,
            newEffect: "new",
            //@ts-expect-error
            useIcon: game.release.generation < 12,
        };
        return data;
    }
    async _updateObject(event, formData) {
        const object = this.object;
        formData = foundry.utils.expandObject(formData);
        if (!formData.changes)
            formData.changes = [];
        formData.changes = Object.values(formData.changes);
        for (let c of formData.changes) {
            if (Number.isNumeric(c.value))
                c.value = parseFloat(c.value);
        }
        return object.update(formData);
    }
    _initializeFilterItemList(i, ul) {
        const set = this.filters;
        const filters = ul.querySelectorAll(".filter-item");
        for (let li of filters) {
            if (set.has(li.dataset.filter))
                li.classList.add("active");
        }
    }
    _onToggleFilter(event) {
        event.preventDefault();
        const li = event.currentTarget;
        const set = this.filters;
        const filter = li.dataset.filter;
        if (set.has(filter))
            set.delete(filter);
        else
            set.add(filter);
        this.render();
    }
    // delete change
    activateListeners(html) {
        super.activateListeners(html);
        const filterLists = html.find(".filter-list");
        filterLists.each(this._initializeFilterItemList.bind(this));
        filterLists.on("click", ".filter-item", this._onToggleFilter.bind(this));
        html.find('.refresh').click(async (ev) => {
            //@ts-expect-error
            return this.submit({ preventClose: true }).then(() => this.render());
        });
        // Delete Effect
        html.find('.effect-delete').click(async (ev) => {
            const object = this.object;
            const effectid = $(ev.currentTarget).parents(".effect-header").attr("effect-id");
            if (object instanceof CONFIG.Actor.documentClass || object instanceof CONFIG.Item.documentClass) {
                confirmAction(confirmDelete || object instanceof CONFIG.Item.documentClass, () => {
                    //@ts-expect-error
                    object.deleteEmbeddedDocuments("ActiveEffect", [effectid], { "expiry-reason": "manual-deletion" });
                });
            }
            else {
                let effect = object.effects.get(effectid);
                // effect =  new EditOwnedItemEffectsActiveEffect(effect.toObject(), effect.parent);
                // effect = new CONFIG.ActiveEffect.documentClass(effect.toObjct(), effect.parent);
                confirmAction(confirmDelete, () => {
                    effect.delete({});
                });
            }
        });
        html.find('.effect-edit').click(async (ev) => {
            const object = this.object;
            if (object.parent instanceof Item)
                return; // TODO Think about editing effects on items in bags
            const effectUuid = $(ev.currentTarget).parents(".effect-header").attr("effect-uuid");
            if (!effectUuid)
                return;
            //@ ts-expect-error fromUuidSync
            let effect = await fromUuid(effectUuid);
            // const ownedItemEffect = new EditOwnedItemEffectsActiveEffect(effect.toObject(), effect.parent);
            //const ownedItemEffect = new CONFIG.ActiveEffect.documentClass(effect.toObject(), effect.parent);
            return effect?.sheet.render(true);
        });
        html.find('.effect-add').click(async (ev) => {
            const object = this.object;
            let effect_name = $(ev.currentTarget).parents(".effect-header").find(".newEffect option:selected").text();
            let AEDATA;
            //@ts-expect-error
            let id = Object.entries(this.effectList).find(([key, value]) => value === effect_name)[0];
            if (effect_name === "new") {
                AEDATA = {
                    name: object.name,
                    changes: [],
                    transfer: false,
                };
                const img = object.img || "icons/svg/mystery-man.svg";
                //@ts-expect-error
                if (game.release.generation < 12)
                    AEDATA.icon = img;
                else
                    AEDATA.img = img;
                await object.createEmbeddedDocuments("ActiveEffect", [AEDATA]);
            }
            else {
                let statusEffect = CONFIG.statusEffects.find(se => se.id === id);
                if (statusEffect) {
                    if (object instanceof CONFIG.Item.documentClass) {
                        AEDATA = {
                            //@ts-expect-error
                            name: statusEffect.name,
                            origin: object.uuid,
                            changes: [{ key: "StatusEffect", mode: 0, value: id }],
                            transfer: true,
                            flags: { "dae.itemName": object.name }
                        };
                        //@ts-expect-error
                        if (game.release.generation < 12)
                            AEDATA.icon = statusEffect.icon;
                        //@ts-expect-error
                        else
                            AEDATA.img = statusEffect.img;
                        object.createEmbeddedDocuments("ActiveEffect", [AEDATA]);
                    }
                    else {
                        if (!statusEffect._id) { // fiddle for CE effects
                            statusEffect._id = randomID();
                        }
                        ;
                        //@ts-expect-error
                        let effect = await ActiveEffect.implementation.fromStatusEffect(id, { parent: object, keepId: true });
                        effect.updateSource({ _id: statusEffect._id, origin: object.uuid });
                        //@ts-expect-error
                        await ActiveEffect.implementation.create(effect, { parent: object, keepId: true });
                    }
                }
            }
        });
        function efhandler(type, effect, data, options, user) {
            if (this.object.id === effect.parent.id || effect.parent?.parent?.id === this.object.id) {
                setTimeout(() => this.render(), 0);
            }
        }
        ;
        function itemHandler(item, data, options, user) {
            if (this.object.id === item.id || item.parent?.id === this.object.id) {
                setTimeout(() => this.render(), 0);
            }
        }
        ;
        function tmHandler(worldTime, dt) {
            //@ts-expect-error
            if (Array.from(this.object.effects).some(ef => ef.isTemporary))
                setTimeout(() => this.render(), 0);
        }
        function tkHandler(token, update, options, user) {
            if (token.actor.id !== this.object.id)
                return;
            setTimeout(() => this.render(), 0);
        }
        function actHandler(actor, updates, options, user) {
            if (actor.id !== this.object.id)
                return;
            setTimeout(() => this.render(), 0);
        }
        if (!this.effectHookIdu)
            this.effectHookIdu = Hooks.on("updateActiveEffect", efhandler.bind(this, "update"));
        if (!this.effectHookIdc)
            this.effectHookIdc = Hooks.on("createActiveEffect", efhandler.bind(this, "create"));
        if (!this.effectHookIdd)
            this.effectHookIdd = Hooks.on("deleteActiveEffect", efhandler.bind(this, "delete"));
        if (!this.itemHookId)
            this.itemHookId = Hooks.on("updateItem", itemHandler.bind(this));
        if (!this.effectHookIdt)
            this.effectHookIdt = Hooks.on("updateToken", tkHandler.bind(this));
        if (!this.effectHookIda)
            this.effectHookIda = Hooks.on("updateActor", actHandler.bind(this));
        if (!this.timeHookId)
            this.timeHookId = Hooks.on("updateWorldTime", tmHandler.bind(this));
        if (!this.combatHookId)
            this.combatHookId = Hooks.on("updateCombat", tmHandler.bind(this));
    }
    async close() {
        if (this.effectHookIdu)
            Hooks.off("updateActiveEffect", this.effectHookIdu);
        if (this.effectHookIdc)
            Hooks.off("createActiveEffect", this.effectHookIdc);
        if (this.effectHookIdd)
            Hooks.off("deleteActiveEffect", this.effectHookIdd);
        if (this.timeHookId)
            Hooks.off("updateWorldTime", this.timeHookId);
        if (this.effectHookIdt)
            Hooks.off("updateToken", this.effectHookIdt);
        if (this.effectHookIda)
            Hooks.off("updateActor", this.effectHookIda);
        if (this.itemHookId)
            Hooks.off("updateItem", this.itemHookId);
        if (this.combatHookId)
            Hooks.off("updateCombat", this.combatHookId);
        return super.close();
    }
}