import { debug } from '../../../dae.js';
// import { EditOwnedItemEffectsActiveEffect } from './owned-item-effect.js';
/**
 * Handles all the logic related to Item Sheet
 */
export class ItemEffectsItemSheet {
    static init() {
        Hooks.on('renderItemSheet', this.handleItemSheetRender);
    }
    /**
     * Only applies to owned items which can be edited
     * Removes some effect controls
     * Unregisters all Core Effect Control listeners
     * Adds a "Transfer" button for effects marked "Transfer"
     * Re-registers custom listeners for create, edit, and delete controls
     *
     * @param {*} app
     * @param {*} html
     * @returns
     */
    static onManageActiveEffect(event, owner) {
        //@ts-expect-error
        const legacyTransferral = CONFIG.ActiveEffect.legacyTransferral;
        event.preventDefault();
        event.stopPropagation();
        const a = event.currentTarget;
        const li = a.closest("li");
        const effect = li.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;
        if (a.dataset.action === "create") {
            event.preventDefault();
            let name = owner.name ?? game.i18n.localize("DND5E.EffectNew");
            let i = 0;
            while (owner.effects.some(ef => ef.name === name)) {
                i += 1;
                name = (owner.name ?? game.i18n.localize("DND5E.EffectNew")) + ` ${i}`;
            }
            return owner.createEmbeddedDocuments("ActiveEffect", [{
                    name,
                    icon: owner.img ?? "icons/svg/aura.svg",
                    origin: owner.uuid,
                    "duration.rounds": li.dataset.effectType === "temporary" ? 1 : undefined,
                    transfer: li.dataset.effectType === "passive",
                    disabled: li.dataset.effectType === "inactive"
                }]);
        }
        else if (a.dataset.action === "transfer" && owner.parent instanceof Actor && legacyTransferral === true) {
            debug('Attempting to Transfer an effect to an Actor', { effectUuid: effect.uuid, actor: owner.parent });
            return CONFIG.ActiveEffect.documentClass.create({
                ...effect.toObject(),
                origin: effect.parent.uuid,
            }, { parent: owner.parent });
        }
        else {
            //@ts-expect-error onManageActiveEffect
            CONFIG.ActiveEffect.documentClass.onManageActiveEffect(event, owner);
        }
    }
    static handleItemSheetRender = (app, html) => {
        const effectsList = html.find('.tab.effects-list');
        if (!effectsList || !app.isEditable)
            return;
        if (app.item.parent instanceof Actor) {
            app.item.effects.filter(effect => effect.transfer).forEach(effect => {
                const id = effect.id;
                const newButton = `<a class="effect-control" data-action="transfer" title="${game.i18n.localize('EFFECT.Transfer')}">
      <i class="fas fa-hand-holding-medical"></i> </a>`;
                html.find(`li[data-effect-id=${id}] .effect-controls`).append(newButton);
            });
        }
        // override the listener preventing management of these effects
        // unregister all remaining listeners on the effect controls
        const gameSystem = game.system.id;
        //@ts-expect-error
        const gameVersion = game.system.version;
        if (gameSystem === "dnd5e" && foundry.utils.isNewerVersion("2.9.99", gameVersion)) {
            html.find(".effect-control").unbind('click');
            html.find('.effect-control').off("click");
            html.find('.effect-control').click((ev) => {
                ItemEffectsItemSheet.onManageActiveEffect(ev, app.item);
            });
        }
    };
}