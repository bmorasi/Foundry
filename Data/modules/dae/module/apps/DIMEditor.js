import { debug } from "../../dae.js";
export class DIMEditor extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: "./modules/dae/templates/DIMEditor.html",
            classes: ["macro-sheet", "sheet", "dimeditor"],
            resizable: true,
            width: 560,
            height: 480
        });
    }
    render(force, options = {}) {
        Hooks.once("renderDIMEditor", (app, html, data) => {
            Hooks.callAll("renderMacroConfig", app, html, data);
        });
        return super.render(force, options);
    }
    //@ts-expect-error getData
    getData(options = {}) {
        //@ts-expect-error documentTypes
        const macroTypes = game.documentTypes.Macro.reduce((obj, t) => {
            if (t === CONST.BASE_DOCUMENT_TYPE)
                return obj;
            if ((t === "script") && !game.user?.can("MACRO_SCRIPT"))
                return obj;
            //@ts-expect-error typeLabels
            obj[t] = game.i18n.localize(CONFIG.Macro.typeLabels[t]);
            return obj;
        }, {});
        const macroScopes = CONST.MACRO_SCOPES;
        return foundry.utils.mergeObject(super.getData(options), {
            macro: this.getMacro(),
            macroTypes,
            macroScopes
        });
    }
    /*
      Override
    */
    _onEditImage(event) {
        debug("DIMEditor | _onEditImage  | ", { event });
        // return ui.notifications.error(settings.i18n("error.editImage"));
    }
    /*
      Override
    */
    async _updateObject(event, formData) {
        debug("DIMEditor | _updateObject  | ", { event, formData });
        //@ts-expect-error type
        await this.updateMacro(foundry.utils.mergeObject(formData, { type: "script", }));
    }
    async updateMacro({ command, type }) {
        let item = this.object;
        let macro = this.getMacro();
        debug("DIMEditor | updateMacro  | ", { command, type, item, macro });
        if (macro.command != command) {
            await this.setMacro(new Macro({
                name: this.object.name,
                img: this.object.img,
                type: "script",
                scope: "global",
                command,
                author: game.user?.id,
                //@ts-expect-error v12 DOCUMENT_PERMISSION_LEVELS -> DOCUMENT_OWNERSHIP_LEVELS
                ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_PERMISSION_LEVELS.OWNER }
            }, {}));
        }
    }
    hasMacro() {
        let command = foundry.utils.getProperty(this.object, "flags.dae.macro.command") ?? foundry.utils.getProperty(this.object, "flags.itemacro.macro");
        return !!command;
    }
    getMacro() {
        let macroData = foundry.utils.getProperty(this.object, "flags.dae.macro")
            ?? foundry.utils.getProperty(this.object, "flags.itemacro.macro")
            ?? {};
        if (!macroData.command && macroData.data)
            macroData = macroData.data;
        delete macroData.data;
        macroData = foundry.utils.mergeObject(macroData, { img: this.object.img, name: this.object.name, scope: "global", type: "script" });
        debug("DIMEditor | getMacro | ", { macroData });
        return new Macro(macroData, {});
    }
    async setMacro(macro) {
        if (macro instanceof Macro) {
            await this.object.update({ "flags.dae.macro": macro.toObject() });
        }
    }
    static preUpdateItemHook(item, updates, context, user) {
        if (!game.settings.get("dae", "DIMESyncItemacro") /*|| !game.modules.get("itemacro") */)
            return true;
        const existing = foundry.utils.getProperty(item, "flags.dae.macro")
            ?? foundry.utils.getProperty(item, "flags.itemacro.macro")
            ?? { command: "" };
        if (foundry.utils.getProperty(updates, "flags.dae.macro")) {
            const macroData = foundry.utils.mergeObject(existing, updates.flags.dae.macro);
            foundry.utils.setProperty(updates, "flags.itemacro.macro", macroData);
        }
        else if (foundry.utils.getProperty(updates, "flags.itemacro.macro")) {
            const macrodata = foundry.utils.mergeObject(existing, updates.flags.itemacro.macro);
            foundry.utils.setProperty(updates, "flags.dae.macro", macrodata);
        }
        return true;
    }
}